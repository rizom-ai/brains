import { createHash } from "node:crypto";
import { verifyRuntimeImage } from "./image-inventory";
import type { RequiredImage } from "./image-types";
export type { RequiredImage } from "./image-types";
import { loadPilotRegistry, type ResolvedSiteOverride } from "./load-registry";
import {
  runSubprocess,
  type RunCommand,
} from "@brains/deploy-support/run-subprocess";

/** The longest tag a container registry accepts. */
const TAG_LIMIT = 128;

/**
 * Name the immutable runtime image for a Brain version and the exact site
 * packages installed into it: `brain-<version>` for an instance without site
 * pins, else that followed by each pin, sorted, in registry-safe spelling
 * (`@rizom/site-x@1.2.3` → `rizom-site-x-1.2.3`), plus an identity digest.
 * Readable spelling is lossy, so even short names require the digest. A pin
 * set too long to spell out uses only that digest. Every instance with the same Brain
 * version and pins shares one image; a change of pins is a new image, so a
 * site can move on its own. Build and Deploy both import this function so
 * their tags can never disagree.
 */
export function runtimeImageTag(
  brainVersion: string,
  sitePackages: readonly string[] = [],
): string {
  const base = `brain-${brainVersion}`;
  const pins = [...new Set(sitePackages)].sort();
  if (pins.length === 0) return base;
  const spelled = `${base}--${pins
    .map((spec) =>
      spec
        .replace(/^@/, "")
        .replace("/", "-")
        .replace(/@(?=[^@]*$)/, "-"),
    )
    .join("--")}`;
  const digest = createHash("sha256")
    .update(JSON.stringify([brainVersion, ...pins]))
    .digest("hex")
    .slice(0, 12);
  const suffix = `--s${digest}`;
  return `${spelled.length + suffix.length <= TAG_LIMIT ? spelled : base}${suffix}`;
}

/**
 * The npm packages a site override contributes to every new fleet image.
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

/**
 * Derive one immutable image per effective Brain version and site pin set:
 * every instance runs the image named by its own version and pins, so a
 * site's pin change builds that site's image and no other, and promoting an
 * instance to a version keeps whatever image already carries its pins there.
 */
export function requiredImages(
  users: ImageRequirementSource[],
): RequiredImage[] {
  const byTag = new Map<string, RequiredImage>();
  for (const user of users) {
    const sitePackages = [
      ...new Set(sitePackagesFor(user.siteOverride)),
    ].sort();
    const tag = runtimeImageTag(user.brainVersion, sitePackages);
    const existing = byTag.get(tag);
    if (
      existing &&
      (existing.brainVersion !== user.brainVersion ||
        !Bun.deepEquals(existing.sitePackages, sitePackages))
    ) {
      throw new Error(
        `Image tag collision for distinct runtime requirements: ${tag}`,
      );
    }
    byTag.set(tag, { tag, brainVersion: user.brainVersion, sitePackages });
  }
  return [...byTag.values()].sort((left, right) =>
    left.tag.localeCompare(right.tag),
  );
}

function mergeExactPackagePins(
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
        "Fleet shared images have conflicting pins for " +
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
   * one image is built: this version with exactly the dispatched pins.
   * Published tags stay immutable: a same-tag rebuild from a newer Dockerfile
   * can strand the tag boot-broken, so rebuilding needs allowTagOverwrite.
   */
  brainVersionInput?: string | undefined;
  sitePackagesInput?: string | undefined;
  allowTagOverwrite?: boolean | undefined;
  imageExists: (tag: string) => Promise<boolean>;
  /** Fail closed if a published image cannot serve its assigned instances. */
  verifyImage: (image: RequiredImage) => Promise<void>;
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
    const sitePackages = mergeExactPackagePins(
      [],
      (options.sitePackagesInput ?? "").split(/\s+/).filter(Boolean),
    );
    const tag = runtimeImageTag(versionInput, sitePackages);
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
    } else {
      // An image is named by what it holds; reuse is allowed once it is
      // proven to hold exactly that.
      await options.verifyImage(image);
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

  const { users } = await loadPilotRegistry(options.rootDir);

  const builds = await resolveImageBuilds({
    users,
    brainVersionInput,
    sitePackagesInput,
    allowTagOverwrite,
    imageExists: (tag) => imageTagExists(run, options.imageRepository, tag),
    verifyImage: (image) =>
      verifyRuntimeImage(options.imageRepository, image, run),
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
