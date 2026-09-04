import { createHash } from "node:crypto";

import { loadPilotRegistry, type ResolvedSiteOverride } from "./load-registry";
import { runSubprocess, type RunCommand } from "./run-subprocess";
import {
  imageContractSchema,
  ISOLATED_SITE_IMAGE_CONTRACT,
  type ImageContract,
} from "./schema";

/**
 * Resolve a fleet image tag as a pure function of a single instance's own
 * config. This is the shared contract between the build (which tags the image
 * it pushes) and the deploy (which waits for and runs that tag), so both must
 * import this — never recompute it independently.
 *
 * The default path is deliberately untouched: an instance with no site packages
 * resolves to the plain `brain-{version}` tag every other fleet instance uses.
 * A site override is a per-instance opt-in that hashes only *that instance's*
 * package set into a distinct `brain-{version}-sites-{hash}` image, so it can
 * never collide with — or leak into — the shared default image.
 */
export function siteImageTag(
  brainVersion: string,
  sitePackages: string[],
): string {
  const packages = [
    ...new Set(sitePackages.map((entry) => entry.trim()).filter(Boolean)),
  ].sort();

  if (packages.length === 0) {
    return `brain-${brainVersion}`;
  }

  const hash = createHash("sha256")
    .update(packages.join("\n"))
    .digest("hex")
    .slice(0, 12);

  return `brain-${brainVersion}-sites-${hash}`;
}

/** Resolve the runtime tag selected by the pilot's explicit image contract. */
export function runtimeImageTag(
  imageContract: ImageContract,
  brainVersion: string,
  sitePackages: string[],
): string {
  return imageContract === ISOLATED_SITE_IMAGE_CONTRACT
    ? siteImageTag(brainVersion, sitePackages)
    : `brain-${brainVersion}`;
}

/**
 * The npm packages a site override installs into its per-instance image.
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
 * Derive the immutable images required by the declared fleet. Shared fleets
 * get one image per Brain version containing the union of packages required by
 * every instance on that version. Fleets that explicitly retain isolated site
 * images get one tag per distinct version/package set.
 */
export function requiredImages(
  users: ImageRequirementSource[],
  imageContract: ImageContract = ISOLATED_SITE_IMAGE_CONTRACT,
): RequiredImage[] {
  if (imageContract === ISOLATED_SITE_IMAGE_CONTRACT) {
    const byTag = new Map<string, RequiredImage>();
    for (const user of users) {
      const sitePackages = [
        ...new Set(sitePackagesFor(user.siteOverride)),
      ].sort();
      const tag = siteImageTag(user.brainVersion, sitePackages);
      byTag.set(tag, { tag, brainVersion: user.brainVersion, sitePackages });
    }
    return [...byTag.values()].sort((left, right) =>
      left.tag.localeCompare(right.tag),
    );
  }

  const byVersion = new Map<string, RequiredImage>();
  for (const user of users) {
    const image = byVersion.get(user.brainVersion) ?? {
      tag: runtimeImageTag(imageContract, user.brainVersion, []),
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
  imageContract?: ImageContract | undefined;
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
  const imageContract = options.imageContract ?? ISOLATED_SITE_IMAGE_CONTRACT;
  if (versionInput) {
    const sitePackages = (options.sitePackagesInput ?? "")
      .split(/\s+/)
      .filter(Boolean);
    const tag = runtimeImageTag(imageContract, versionInput, sitePackages);
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
  for (const image of requiredImages(options.users, imageContract)) {
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
 * The Build workflow's resolve step: derive the image set the declared fleet
 * state (pilot.yaml + cohorts + users) requires, probe the container registry
 * for each tag, and emit the missing ones as a GitHub Actions build matrix
 * (`images_json`, entries `{tag, brain_version, site_packages}`). Dispatch
 * inputs `BRAIN_VERSION_INPUT`/`SITE_PACKAGES_INPUT`/`IMAGE_CONTRACT_INPUT`
 * force a single explicit build instead. Deriving and probing here means a config push builds exactly
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
  const imageContractInput = env["IMAGE_CONTRACT_INPUT"]?.trim();
  const explicitImageContract = imageContractSchema.parse(
    imageContractInput ?? ISOLATED_SITE_IMAGE_CONTRACT,
  );

  const registry = brainVersionInput
    ? undefined
    : await loadPilotRegistry(options.rootDir);
  const users = registry?.users ?? [];

  const builds = await resolveImageBuilds({
    users,
    imageContract: registry?.pilot.imageContract ?? explicitImageContract,
    brainVersionInput,
    sitePackagesInput,
    allowTagOverwrite,
    imageExists: async (tag) => {
      try {
        await run("docker", [
          "manifest",
          "inspect",
          `${options.imageRepository}:${tag}`,
        ]);
        return true;
      } catch {
        return false;
      }
    },
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
