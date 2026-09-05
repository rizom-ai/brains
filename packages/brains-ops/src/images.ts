import { loadPilotRegistry, type ResolvedSiteOverride } from "./load-registry";
import { runSubprocess, type RunCommand } from "./run-subprocess";

/**
 * Resolve the immutable runtime image shared by every fleet instance on one
 * Brain version. Build and Deploy both import this function so their tags can
 * never disagree.
 */
export function runtimeImageTag(brainVersion: string): string {
  return `brain-${brainVersion}`;
}

/**
 * The npm packages a site override contributes to its version's shared image.
 * A @rizom-scoped theme is independently published and installs at its own
 * explicit version; @brains/* themes are bundled inside @rizom/brain and must
 * not be npm-installed.
 */
export function sitePackagesFor(
  siteOverride: ResolvedSiteOverride | undefined,
): string[] {
  if (!siteOverride) {
    return [];
  }
  if (!siteOverride.theme?.startsWith("@rizom/")) {
    return [`${siteOverride.package}@${siteOverride.version}`];
  }
  if (siteOverride.themeVersion === undefined) {
    throw new Error(`Theme ${siteOverride.theme} has no explicit version pin`);
  }
  return [
    `${siteOverride.package}@${siteOverride.version}`,
    `${siteOverride.theme}@${siteOverride.themeVersion}`,
  ];
}

/** The per-user slice of the registry that determines which image it runs. */
export interface ImageRequirementSource {
  brainVersion: string;
  siteOverride?: ResolvedSiteOverride | undefined;
}

export interface RequiredImage {
  tag: string;
  brainVersion: string;
  /** Sorted, deduped package specs installed into this runtime image. */
  sitePackages: string[];
}

/**
 * Derive one immutable image per effective Brain version. Each image contains
 * the union of exact site/theme package pins required by every instance on
 * that version.
 */
export function requiredImages(
  users: ImageRequirementSource[],
): RequiredImage[] {
  const byVersion = new Map<string, RequiredImage>();
  for (const user of users) {
    const image = byVersion.get(user.brainVersion) ?? {
      tag: runtimeImageTag(user.brainVersion),
      brainVersion: user.brainVersion,
      sitePackages: [],
    };
    image.sitePackages = mergeExactPackagePins(
      user.brainVersion,
      image.sitePackages,
      sitePackagesFor(user.siteOverride),
    );
    byVersion.set(user.brainVersion, image);
  }
  return [...byVersion.values()].sort((left, right) =>
    left.tag.localeCompare(right.tag),
  );
}

function mergeExactPackagePins(
  brainVersion: string,
  current: string[],
  additions: string[],
): string[] {
  const byPackage = new Map<string, string>();
  for (const spec of [...current, ...additions]) {
    const separator = spec.lastIndexOf("@");
    const packageName = separator > 0 ? spec.slice(0, separator) : spec;
    const existing = byPackage.get(packageName);
    if (existing && existing !== spec) {
      throw new Error(
        `Brain ${brainVersion} shared image has conflicting pins for ` +
          `${packageName}: ${existing} and ${spec}`,
      );
    }
    byPackage.set(packageName, spec);
  }
  return [...byPackage.values()].sort();
}

export interface ResolveImageBuildsOptions {
  users: ImageRequirementSource[];
  /**
   * Explicit dispatch override — the manual/backfill path. When set, exactly
   * this one image is built, skipping the registry-derived resolve. Published
   * tags stay immutable: a same-tag rebuild from a newer Dockerfile can
   * strand the tag boot-broken, so rebuilding needs allowTagOverwrite.
   */
  brainVersionInput?: string | undefined;
  sitePackagesInput?: string | undefined;
  allowTagOverwrite?: boolean | undefined;
  imageExists: (tag: string) => Promise<boolean>;
}

/**
 * Decide which images a Build run must produce: the declared required set
 * filtered to tags the registry does not already hold, or the single image an
 * explicit dispatch input forces.
 */
export async function resolveImageBuilds(
  options: ResolveImageBuildsOptions,
): Promise<RequiredImage[]> {
  const versionInput = options.brainVersionInput?.trim() ?? "";
  if (versionInput) {
    const sitePackages = (options.sitePackagesInput ?? "")
      .split(/\s+/)
      .filter(Boolean);
    const tag = runtimeImageTag(versionInput);
    if (!options.allowTagOverwrite && (await options.imageExists(tag))) {
      throw new Error(
        `Image tag ${tag} already exists; published tags are immutable. ` +
          "Pick a new version, or pass overwrite=true only when replacing a " +
          "tag whose containers were never deployed.",
      );
    }
    return [
      {
        tag,
        brainVersion: versionInput,
        sitePackages,
      },
    ];
  }

  const missing: RequiredImage[] = [];
  for (const image of requiredImages(options.users)) {
    if (!(await options.imageExists(image.tag))) {
      missing.push(image);
    }
  }
  return missing;
}

export interface RunResolveMissingImagesOptions {
  rootDir: string;
  /** e.g. `ghcr.io/rizom-ai/rover-pilot` */
  imageRepository: string;
  env?: NodeJS.ProcessEnv;
  runCommand?: RunCommand;
  writeOutput: (key: string, value: string) => void;
  log?: (line: string) => void;
}

/**
 * Whether the registry already holds this tag.
 *
 * `docker manifest inspect` exits non-zero when the manifest is unknown, so a
 * command failure is the "absent" answer. A failure to run docker at all is
 * not: answering false there would let resolveImageBuilds past its
 * tag-immutability guard and overwrite a published tag, which is exactly what
 * that guard exists to prevent. Those propagate.
 *
 * A non-zero exit caused by an auth or network problem is still read as
 * absent — docker reports it the same way it reports an unknown manifest, and
 * telling them apart means matching stderr text that shifts between versions.
 */
export async function imageTagExists(
  run: RunCommand,
  imageRepository: string,
  tag: string,
): Promise<boolean> {
  try {
    await run("docker", ["manifest", "inspect", `${imageRepository}:${tag}`]);
    return true;
  } catch (error) {
    if (error instanceof Error && /exited with code/.test(error.message)) {
      return false;
    }
    throw error;
  }
}

/**
 * The Build workflow's resolve step: derive the image set the declared fleet
 * state (pilot.yaml + cohorts + users) requires, probe the container registry
 * for each tag, and emit the missing ones as a GitHub Actions build matrix
 * (`images_json`, entries `{tag, brain_version, site_packages}`). Dispatch
 * inputs `BRAIN_VERSION_INPUT`/`SITE_PACKAGES_INPUT` force a single explicit
 * build instead. Deriving and probing here means a config push builds exactly
 * what it declares — nothing reactive, nothing manual.
 */
export async function runResolveMissingImages(
  options: RunResolveMissingImagesOptions,
): Promise<RequiredImage[]> {
  const env = options.env ?? process.env;
  const run = options.runCommand ?? runSubprocess;
  const log = options.log ?? console.log;

  const brainVersionInput = env["BRAIN_VERSION_INPUT"]?.trim() ?? "";
  const sitePackagesInput = env["SITE_PACKAGES_INPUT"]?.trim() ?? "";
  const allowTagOverwrite = env["ALLOW_TAG_OVERWRITE"]?.trim() === "true";

  const registry = brainVersionInput
    ? undefined
    : await loadPilotRegistry(options.rootDir);
  const users = registry?.users ?? [];

  const builds = await resolveImageBuilds({
    users,
    brainVersionInput,
    sitePackagesInput,
    allowTagOverwrite,
    imageExists: (tag) => imageTagExists(run, options.imageRepository, tag),
  });

  for (const image of builds) {
    log(
      `build needed: ${image.tag} (brain ${image.brainVersion}${
        image.sitePackages.length > 0
          ? `, sites ${image.sitePackages.join(" ")}`
          : ""
      })`,
    );
  }
  if (builds.length === 0) {
    log("All declared images already exist; nothing to build.");
  }

  options.writeOutput(
    "images_json",
    JSON.stringify(
      builds.map((image) => ({
        tag: image.tag,
        brain_version: image.brainVersion,
        site_packages: image.sitePackages.join(" "),
      })),
    ),
  );

  return builds;
}
