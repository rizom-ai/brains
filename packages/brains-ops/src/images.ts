import { createHash } from "node:crypto";

import { loadPilotRegistry, type ResolvedSiteOverride } from "./load-registry";
import { runSubprocess, type RunCommand } from "./run-subprocess";

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

/**
 * The npm packages a site override installs into its per-instance image.
 * A @rizom-scoped theme is an independently published package and rides along
 * at the same lockstep version; @brains/* themes are bundled inside
 * @rizom/brain and must not be npm-installed.
 */
export function sitePackagesFor(
  siteOverride: ResolvedSiteOverride | undefined,
): string[] {
  if (!siteOverride) {
    return [];
  }
  return [
    `${siteOverride.package}@${siteOverride.version}`,
    ...(siteOverride.theme?.startsWith("@rizom/")
      ? [`${siteOverride.theme}@${siteOverride.version}`]
      : []),
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
  /** Sorted, deduped — build args for the image, empty for the default. */
  sitePackages: string[];
}

/**
 * The image set the declared fleet state requires: one default
 * `brain-{version}` per distinct brain version in use, plus one
 * `brain-{version}-sites-{hash}` per distinct site-override package set.
 * Derived purely from resolved users (pass `registry.users`), so CI can build
 * exactly what a config push declares — nothing reactive, nothing manual.
 */
export function requiredImages(
  users: ImageRequirementSource[],
): RequiredImage[] {
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

export interface ResolveImageBuildsOptions {
  users: ImageRequirementSource[];
  /**
   * Explicit dispatch override — the manual/backfill path. When set, exactly
   * this one image is built, skipping both the registry and the exists check.
   */
  brainVersionInput?: string | undefined;
  sitePackagesInput?: string | undefined;
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
    return [
      {
        tag: siteImageTag(versionInput, sitePackages),
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

  const users = brainVersionInput
    ? []
    : (await loadPilotRegistry(options.rootDir)).users;

  const builds = await resolveImageBuilds({
    users,
    brainVersionInput,
    sitePackagesInput,
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
