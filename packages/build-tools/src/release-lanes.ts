import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type ReleaseLane = "core" | "site";

export interface ReleasePlanPackage {
  name: string;
  type?: string;
  private?: boolean;
}

export interface WorkspacePackageLike {
  dir: string;
  packageJson: {
    name: string;
    private?: boolean;
  };
}

/** Public site/theme ecosystem packages publish outside the core lane. */
export function isSiteReleasePackage(name: string): boolean {
  return /^@rizom\/(?:site(?:-|$)|theme(?:-|$))/.test(name);
}

export function packageMatchesReleaseLane(
  name: string,
  lane: ReleaseLane,
): boolean {
  return isSiteReleasePackage(name) === (lane === "site");
}

/**
 * Every package a changeset touches lives in exactly one lane, so the lane
 * never needs to be spelled out — it is derived from the packages themselves.
 */
export function inferReleaseLane(
  releases: readonly ReleasePlanPackage[],
): ReleaseLane {
  if (releases.length === 0) {
    throw new Error(
      "Cannot infer a release lane from a changeset without packages; pass core or site explicitly",
    );
  }

  const byLane = new Map<ReleaseLane, string[]>();
  for (const release of releases) {
    const lane: ReleaseLane = isSiteReleasePackage(release.name)
      ? "site"
      : "core";
    byLane.set(lane, [...(byLane.get(lane) ?? []), release.name]);
  }
  if (byLane.size > 1) {
    const described = (["core", "site"] as const)
      .map((lane) => `${lane} (${(byLane.get(lane) ?? []).sort().join(", ")})`)
      .join(" and ");
    throw new Error(
      `A changeset may reference packages from only one release lane, but this one mixes ${described}`,
    );
  }
  const [lane] = byLane.keys();
  if (lane === undefined) {
    throw new Error(
      "Cannot infer a release lane from a changeset without packages; pass core or site explicitly",
    );
  }
  return lane;
}

/**
 * Fail before versioning if dependency propagation crosses a release lane.
 * Private packages are exempt: they can never be published, so a private
 * dependent version-bumping in the other lane's plan is harmless bookkeeping.
 */
export function assertReleasePlanMatchesLane(
  lane: ReleaseLane,
  releases: readonly ReleasePlanPackage[],
): void {
  const unexpected = releases
    .filter(
      (release) =>
        release.type !== "none" &&
        release.private !== true &&
        !packageMatchesReleaseLane(release.name, lane),
    )
    .map((release) => release.name)
    .sort();

  if (unexpected.length > 0) {
    throw new Error(
      `${lane} release plan crosses into the other release lane: ${unexpected.join(", ")}`,
    );
  }
}

/**
 * Hide the opposite lane from `changeset publish`, restoring every source
 * manifest exactly after success or failure. Changesets has no publish-time
 * package filter, so marking the other public packages private is the narrowest
 * way to retain its registry checks, prerelease tags, and git tags without
 * allowing one pipeline to publish the other lane.
 */
export async function runWithScopedReleasePackages<T>(
  packages: readonly WorkspacePackageLike[],
  lane: ReleaseLane,
  operation: () => Promise<T>,
): Promise<T> {
  const hidden = packages.filter(
    ({ packageJson }) =>
      packageJson.private !== true &&
      !packageMatchesReleaseLane(packageJson.name, lane),
  );
  const originals = new Map<string, string>();
  let operationResult: { value: T } | { error: unknown };

  try {
    for (const { dir } of hidden) {
      const manifestPath = join(dir, "package.json");
      const original = await readFile(manifestPath, "utf8");
      const manifest = JSON.parse(original) as Record<string, unknown>;
      manifest["private"] = true;
      originals.set(manifestPath, original);
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }

    try {
      operationResult = { value: await operation() };
    } catch (error) {
      operationResult = { error };
    }
  } catch (error) {
    operationResult = { error };
  }

  const restoreErrors: unknown[] = [];
  for (const [manifestPath, original] of [...originals].reverse()) {
    try {
      await writeFile(manifestPath, original);
    } catch (error) {
      restoreErrors.push(error);
    }
  }

  if ("error" in operationResult) {
    if (restoreErrors.length > 0) {
      throw new AggregateError(
        [operationResult.error, ...restoreErrors],
        "Release failed and one or more scoped package manifests could not be restored",
      );
    }
    throw operationResult.error;
  }
  if (restoreErrors.length > 0) {
    throw new AggregateError(
      restoreErrors,
      "One or more scoped package manifests could not be restored after release",
    );
  }

  return operationResult.value;
}
