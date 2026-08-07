import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type ReleaseLane = "core" | "site";
export type ReleaseWorkflowMode = "standard" | "stable-exit" | "stable-version";
export type ReleaseVersionStrategy = "lane" | "stable" | "defer";

export interface ReleasePlanPackage {
  name: string;
  type?: string;
  private?: boolean;
  newVersion?: string;
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

/** Classify the checked-out release revision from current and parent pre state. */
export function resolveReleaseWorkflowMode(
  currentPreMode: string | undefined,
  previousPreMode: string | undefined,
): ReleaseWorkflowMode {
  if (currentPreMode === "exit") {
    return "stable-exit";
  }
  if (currentPreMode === undefined && previousPreMode === "exit") {
    return "stable-version";
  }
  return "standard";
}

/** Core versions a prerelease exit globally; the site lane waits for that commit. */
export function resolveReleaseVersionStrategy(
  lane: ReleaseLane,
  preMode: string | undefined,
): ReleaseVersionStrategy {
  if (preMode !== "exit") {
    return "lane";
  }
  return lane === "core" ? "stable" : "defer";
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

export interface ReleaseConfigPackageNames {
  /** Repository-relative file the names were read from. */
  source: string;
  /** Raw entries, which may carry a `!` exclusion prefix or be globs. */
  names: readonly string[];
}

/**
 * Release and dependency config name packages directly. When a package leaves
 * the workspace its entries go inert rather than failing, so they survive as
 * rot until a release breaks on them. Glob entries match whatever exists and
 * are skipped here; only exact names are held to the workspace.
 */
export function assertReleaseConfigReferencesWorkspacePackages(
  workspacePackageNames: readonly string[],
  configs: readonly ReleaseConfigPackageNames[],
): void {
  const workspace = new Set(workspacePackageNames);
  const stale = configs
    .map(({ source, names }) => {
      const missing = [
        ...new Set(
          names
            .map((name) => name.replace(/^!/, "").trim())
            .filter((name) => name.length > 0 && !name.includes("*"))
            .filter((name) => !workspace.has(name)),
        ),
      ].sort();
      return { source, missing };
    })
    .filter(({ missing }) => missing.length > 0)
    .map(({ source, missing }) => `${source}: ${missing.join(", ")}`);

  if (stale.length > 0) {
    throw new Error(
      `Release config names packages that are no longer in the workspace:\n${stale.join("\n")}`,
    );
  }
}

/** A prerelease exit is one intentional global plan and must target stable versions. */
export function assertCoordinatedStableReleasePlan(
  releases: readonly ReleasePlanPackage[],
): void {
  const publicReleases = releases.filter(
    (release) => release.type !== "none" && release.private !== true,
  );
  if (publicReleases.length === 0) {
    throw new Error(
      "Stable prerelease exit produced no public package releases",
    );
  }

  const invalid = publicReleases
    .filter(
      (release) =>
        release.newVersion === undefined || release.newVersion.includes("-"),
    )
    .map(
      (release) =>
        `${release.name}@${release.newVersion ?? "<missing version>"}`,
    )
    .sort();
  if (invalid.length > 0) {
    throw new Error(
      `Stable prerelease exit contains non-stable versions: ${invalid.join(", ")}`,
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
