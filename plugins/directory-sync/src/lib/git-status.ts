import type { SimpleGit } from "simple-git";
import type { Logger } from "@brains/utils";
import type { GitSyncStatus } from "./git-sync";

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
    return {
      isRepo: true,
      hasChanges: !status.isClean(),
      ahead: status.ahead,
      behind: status.behind,
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
