import { createHash } from "node:crypto";

import type { ResolvedSiteOverride } from "./load-registry";

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
