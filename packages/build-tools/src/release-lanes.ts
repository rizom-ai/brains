import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type ReleaseLane = "core" | "site";

export interface ReleasePlanPackage {
  name: string;
  type?: string;
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

/** Fail before versioning if dependency propagation crosses a release lane. */
export function assertReleasePlanMatchesLane(
  lane: ReleaseLane,
  releases: readonly ReleasePlanPackage[],
): void {
  const unexpected = releases
    .filter(
      (release) =>
        release.type !== "none" &&
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
