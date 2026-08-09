import type { SimpleGit } from "simple-git";
import { getErrorMessage } from "@brains/utils/error";
import type { Logger } from "@brains/utils/logger";
import type { PullResult } from "../types";
import { commitGitChanges, pushGitChanges } from "./git-commit";
import { reconcileRemoteDeletedFiles } from "./git-remote-deletion-reconciliation";
import { GitStallError, runGitCommandWithStallTimeout } from "./git-stall";
import type { GitNetwork } from "./git-stall";

interface ChangedPaths {
  files: string[];
  deletedFiles: string[];
}

/**
 * Pull changes from remote. Returns the list of changed file paths.
 * Does NOT trigger imports — the caller decides what to do with the files.
 */
export async function pullGitChanges(
  git: SimpleGit,
  logger: Logger,
  branch: string,
  net: GitNetwork,
  signal?: AbortSignal,
): Promise<PullResult> {
  signal?.throwIfAborted();
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
  const remoteHeadBefore = await tryResolveRemoteHead(git, branch);

  try {
    // The network fetch runs on a throwaway, stall-guarded instance so an
    // unresponsive remote can't hang the caller and wedge the git lock.
    await runGitCommandWithStallTimeout(
      net,
      [
        "pull",
        "origin",
        branch,
        "--no-rebase",
        "--allow-unrelated-histories",
        "--strategy=recursive",
        "-Xtheirs",
      ],
      signal,
    );
    signal?.throwIfAborted();

    const result = await getPullChanges(
      git,
      headBefore,
      remoteHeadBefore,
      branch,
    );
    await reconcileRemoteDeletedFiles({
      git,
      logger,
      syncPath: net.baseDir,
      deletedFiles: result.deletedFiles ?? [],
    });
    signal?.throwIfAborted();
    return result;
  } catch (pullError) {
    return handlePullError(
      git,
      logger,
      branch,
      net,
      headBefore,
      remoteHeadBefore,
      pullError,
      signal,
    );
  }
}

async function handlePullError(
  git: SimpleGit,
  logger: Logger,
  branch: string,
  net: GitNetwork,
  headBefore: string,
  remoteHeadBefore: string | undefined,
  pullError: unknown,
  signal?: AbortSignal,
): Promise<PullResult> {
  if (signal?.aborted) throw signal.reason;
  if (pullError instanceof GitStallError) {
    throw pullError;
  }

  const msg = getErrorMessage(pullError);
  const mergeStatus = await git.status();

  if (msg.includes("CONFLICT") || mergeStatus.conflicted.length > 0) {
    await resolveRemoteConflicts(git, logger, msg, mergeStatus.conflicted);
    const result = await getPullChanges(
      git,
      headBefore,
      remoteHeadBefore,
      branch,
    );
    await reconcileRemoteDeletedFiles({
      git,
      logger,
      syncPath: net.baseDir,
      deletedFiles: result.deletedFiles ?? [],
    });
    return result;
  }

  if (msg.includes("couldn't find remote ref")) {
    return bootstrapRemoteBranch(git, logger, branch, net, signal);
  }

  throw new Error(`Failed to pull: ${msg}`);
}

async function getPullChanges(
  git: SimpleGit,
  headBefore: string,
  remoteHeadBefore: string | undefined,
  branch: string,
): Promise<PullResult> {
  const headAfter = await git.revparse(["HEAD"]);
  const localChanges =
    headBefore === headAfter
      ? { files: [], deletedFiles: [] }
      : await getChangedPaths(git, headBefore, headAfter);

  const remoteHeadAfter = await tryResolveRemoteHead(git, branch);
  const remoteChanges =
    remoteHeadBefore && remoteHeadAfter && remoteHeadBefore !== remoteHeadAfter
      ? await getChangedPaths(git, remoteHeadBefore, remoteHeadAfter)
      : undefined;

  return {
    files: [
      ...new Set([...localChanges.files, ...(remoteChanges?.files ?? [])]),
    ],
    deletedFiles: remoteChanges?.deletedFiles ?? localChanges.deletedFiles,
  };
}

async function getChangedPaths(
  git: SimpleGit,
  from: string,
  to: string,
): Promise<ChangedPaths> {
  const diff = await git.diff([from, to, "--name-status", "--no-renames"]);
  const files: string[] = [];
  const deletedFiles: string[] = [];

  for (const line of diff.split("\n")) {
    if (!line.trim()) continue;
    const [status, filePath] = line.split("\t");
    if (!status || !filePath) continue;
    files.push(filePath);
    if (status.startsWith("D")) deletedFiles.push(filePath);
  }

  return { files, deletedFiles };
}

async function tryResolveRemoteHead(
  git: SimpleGit,
  branch: string,
): Promise<string | undefined> {
  try {
    return await git.revparse([`refs/remotes/origin/${branch}`]);
  } catch {
    return undefined;
  }
}

async function resolveRemoteConflicts(
  git: SimpleGit,
  logger: Logger,
  msg: string,
  conflictedFiles: string[],
): Promise<void> {
  logger.warn("Resolving merge conflict", { error: msg });
  for (const file of conflictedFiles) {
    try {
      await git.raw(["checkout", "--theirs", file]);
    } catch {
      await git.raw(["rm", "--force", file]);
    }
  }
  await git.add(["-A"]);
  await git.commit("Auto-resolve merge conflict (remote wins)");
}

async function bootstrapRemoteBranch(
  git: SimpleGit,
  logger: Logger,
  branch: string,
  net: GitNetwork,
  signal?: AbortSignal,
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
  signal?.throwIfAborted();
  await pushGitChanges(logger, branch, net, signal);
  return { files: [], deletedFiles: [] };
}
