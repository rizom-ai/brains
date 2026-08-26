import type { SimpleGit } from "simple-git";
import type { Logger } from "@brains/utils/logger";
import type { GitSyncStatus } from "../../types";

export async function getGitStatus(
  git: SimpleGit,
  logger: Logger,
  branch: string,
  remoteUrl: string,
): Promise<GitSyncStatus> {
  try {
    const status = await git.status();
    let lastCommit: string | undefined;
    try {
      const log = await git.log({ maxCount: 1 });
      lastCommit = log.latest?.hash;
    } catch {
      // No commits yet
    }
    const divergence = remoteUrl
      ? await getExplicitRemoteDivergence(git, branch)
      : undefined;
    return {
      isRepo: true,
      hasChanges: !status.isClean(),
      ahead: divergence?.ahead ?? status.ahead,
      behind: divergence?.behind ?? status.behind,
      branch: status.current ?? branch,
      lastCommit,
      remote: remoteUrl || undefined,
      files: status.files.map((f) => ({
        path: f.path,
        status: f.working_dir + f.index,
      })),
    };
  } catch (error) {
    logger.error("Failed to get git status", { error });
    return {
      isRepo: false,
      hasChanges: false,
      ahead: 0,
      behind: 0,
      branch,
      files: [],
    };
  }
}

async function getExplicitRemoteDivergence(
  git: SimpleGit,
  branch: string,
): Promise<{ ahead: number; behind: number } | undefined> {
  try {
    const counts = await git.raw([
      "rev-list",
      "--left-right",
      "--count",
      `HEAD...refs/remotes/origin/${branch}`,
    ]);
    const [ahead, behind] = counts.trim().split(/\s+/).map(Number);
    if (Number.isInteger(ahead) && Number.isInteger(behind)) {
      return { ahead: ahead ?? 0, behind: behind ?? 0 };
    }
  } catch {
    // An empty remote has no tracking ref yet; local history still needs push.
    try {
      const count = Number(await git.raw(["rev-list", "--count", "HEAD"]));
      if (Number.isInteger(count)) return { ahead: count, behind: 0 };
    } catch {
      // An unborn repository has no divergence to report.
    }
  }
  return undefined;
}

export async function hasGitLocalChanges(git: SimpleGit): Promise<boolean> {
  const status = await git.status();
  return (
    status.modified.length > 0 ||
    status.not_added.length > 0 ||
    status.deleted.length > 0 ||
    status.created.length > 0 ||
    status.conflicted.length > 0
  );
}
