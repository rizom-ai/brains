import type { SimpleGit } from "simple-git";
import { getErrorMessage } from "@brains/utils";
import type { Logger } from "@brains/utils";
import type { PullResult } from "../types";
import { commitGitChanges, pushGitChanges } from "./git-commit";

/**
 * Pull changes from remote. Returns the list of changed file paths.
 * Does NOT trigger imports — the caller decides what to do with the files.
 */
export async function pullGitChanges(
  git: SimpleGit,
  logger: Logger,
  branch: string,
): Promise<PullResult> {
  logger.debug("Pulling from origin", { branch });

  const status = await git.status();
  if (!status.isClean()) {
    logger.warn("Committing local changes before pull");
    await commitGitChanges(
      git,
      logger,
      "Pre-pull commit: preserving local changes",
    );
  }

  const headBefore = await git.revparse(["HEAD"]);

  try {
    await git.pull("origin", branch, {
      "--no-rebase": null,
      "--allow-unrelated-histories": null,
      "--strategy=recursive": null,
      "-Xtheirs": null,
    });

    return await getChangedFilesSince(git, headBefore);
  } catch (pullError) {
    return handlePullError(git, logger, branch, pullError);
  }
}

async function handlePullError(
  git: SimpleGit,
  logger: Logger,
  branch: string,
  pullError: unknown,
): Promise<PullResult> {
  const msg = getErrorMessage(pullError);

  if (msg.includes("CONFLICT")) {
    return resolveRemoteConflicts(git, logger, msg);
  }

  if (msg.includes("couldn't find remote ref")) {
    return bootstrapRemoteBranch(git, logger, branch);
  }

  throw new Error(`Failed to pull: ${msg}`);
}

async function getChangedFilesSince(
  git: SimpleGit,
  headBefore: string,
): Promise<PullResult> {
  const headAfter = await git.revparse(["HEAD"]);
  if (headBefore === headAfter) {
    return { files: [] };
  }
  const diff = await git.diff([headBefore, headAfter, "--name-only"]);
  return { files: diff.split("\n").filter((f) => f.trim()) };
}

async function resolveRemoteConflicts(
  git: SimpleGit,
  logger: Logger,
  msg: string,
): Promise<PullResult> {
  logger.warn("Resolving merge conflict", { error: msg });
  const mergeStatus = await git.status();
  for (const file of mergeStatus.conflicted) {
    try {
      await git.raw(["checkout", "--theirs", file]);
    } catch {
      await git.raw(["rm", "--force", file]);
    }
  }
  await git.add(["-A"]);
  await git.commit("Auto-resolve merge conflict (remote wins)");

  const diffOutput = await git.diff(["HEAD~1", "--name-only"]);
  return { files: diffOutput.split("\n").filter((f) => f.trim()) };
}

async function bootstrapRemoteBranch(
  git: SimpleGit,
  logger: Logger,
  branch: string,
): Promise<PullResult> {
  // Remote is empty (no branches) — bootstrap it by committing any
  // pending local changes and pushing to create the remote branch.
  // Without this the initial brain-data content would sit locally
  // forever, never reaching the remote.
  logger.info("Remote branch doesn't exist yet, bootstrapping via push");
  try {
    await commitGitChanges(git, logger, "Bootstrap remote branch");
  } catch (commitError) {
    // "nothing to commit" is fine — we still need to push the
    // existing local history to create the remote branch.
    const cmsg = getErrorMessage(commitError);
    if (!cmsg.includes("nothing to commit")) {
      throw commitError;
    }
  }
  await pushGitChanges(git, logger, branch);
  return { files: [] };
}
