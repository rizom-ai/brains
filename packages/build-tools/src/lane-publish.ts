import { existsSync } from "node:fs";
import { rename } from "node:fs/promises";
import { join } from "node:path";
import { runWithPreparedPublishManifests } from "./publish-workspace";
import {
  preparedManifestPackageDirs,
  runWithScopedReleasePackages,
  type ReleaseLane,
  type WorkspacePackageLike,
} from "./release-lanes";

export interface LanePublishOptions {
  repositoryRoot: string;
  packages: readonly WorkspacePackageLike[];
  lane: ReleaseLane;
}

/** Where the prerelease state waits while a lane publishes. */
const PUBLISHING_PRE_STATE = "pre.json.publishing";

/**
 * Publish to `latest`, the tag third parties install, for every package.
 *
 * In prerelease mode changesets chooses each package's dist-tag from its
 * registry history: `latest` when every published version is a prerelease
 * of the pre tag, the pre tag (`alpha`) otherwise. One non-alpha version,
 * such as the `0.0.0-stage` placeholder a trusted-publishing bootstrap
 * leaves, sent `@rizom/brain-ui` to `alpha` while the rest of its fixed group
 * went to `latest`. `changeset publish --tag` is refused in prerelease mode,
 * and the prerelease state feeds only that choice once versions are written,
 * so the state waits aside for the publish and every package lands on
 * `latest`. Restored on success or failure; a state already set aside means a
 * publish died mid-run, and this refuses rather than guessing which is current.
 */
async function runWithLatestDistTag<T>(
  repositoryRoot: string,
  publish: () => Promise<T>,
): Promise<T> {
  const preState = join(repositoryRoot, ".changeset", "pre.json");
  const aside = join(repositoryRoot, ".changeset", PUBLISHING_PRE_STATE);
  if (existsSync(aside)) {
    throw new Error(
      `${aside} exists: an earlier publish did not restore the prerelease state. Restore it to .changeset/pre.json before publishing.`,
    );
  }
  if (!existsSync(preState)) return publish();

  await rename(preState, aside);
  try {
    return await publish();
  } finally {
    await rename(aside, preState);
  }
}

/**
 * Run one lane's publish the way a release does: the other lane's packages
 * hidden, this lane's publish manifests prepared, and every package
 * published to `latest`.
 */
export async function runLanePublish<T>(
  { repositoryRoot, packages, lane }: LanePublishOptions,
  publish: () => Promise<T>,
): Promise<T> {
  return runWithScopedReleasePackages(packages, lane, () =>
    runWithPreparedPublishManifests(
      preparedManifestPackageDirs(packages, lane),
      () => runWithLatestDistTag(repositoryRoot, publish),
    ),
  );
}
