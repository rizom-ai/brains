import type { SimpleGit } from "simple-git";
import { getErrorMessage } from "@brains/utils/error";
import type { Logger } from "@brains/utils/logger";
import type { PullResult } from "../../types";
import { commitGitChanges, pushGitChanges } from "./git-commit";
import { reconcileRemoteDeletedFiles } from "../git-remote-deletion-reconciliation";
import { GitStallError, runGitCommandWithStallTimeout } from "./git-stall";
import type { GitNetwork } from "./git-stall";
import { listPullConflicts, spoolPullConflict } from "./pull-conflict-spool";

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
      ["fetch", "origin", branch],
      signal,
    );
    signal?.throwIfAborted();
    await mergeRemote(git, branch);
    // A merge that stops on conflicts reports them on stdout and may not
    // fail the command, so the index is asked.
    const unmerged = (await git.status()).conflicted;
    if (unmerged.length > 0) {
      await resolveMergeConflicts(
        git,
        logger,
        net.baseDir,
        "merge stopped on conflicts",
        unmerged,
      );
    }

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
    return await withUnacknowledgedConflicts(result, net.baseDir);
  } catch (pullError) {
    return handlePullError(
      { git, logger, branch, net, headBefore, remoteHeadBefore, signal },
      pullError,
    );
  }
}

/** What a pull attempt knew before it failed. */
interface PullAttempt {
  git: SimpleGit;
  logger: Logger;
  branch: string;
  net: GitNetwork;
  headBefore: string;
  remoteHeadBefore: string | undefined;
  signal?: AbortSignal | undefined;
}

async function handlePullError(
  attempt: PullAttempt,
  pullError: unknown,
): Promise<PullResult> {
  const { git, logger, branch, net, headBefore, remoteHeadBefore, signal } =
    attempt;
  if (signal?.aborted) throw signal.reason;
  if (pullError instanceof GitStallError) {
    throw pullError;
  }

  const msg = getErrorMessage(pullError);
  const mergeStatus = await git.status();

  if (msg.includes("CONFLICT") || mergeStatus.conflicted.length > 0) {
    await resolveMergeConflicts(
      git,
      logger,
      net.baseDir,
      msg,
      mergeStatus.conflicted,
    );
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
    return withUnacknowledgedConflicts(result, net.baseDir);
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
    deletedFiles: await withoutKeptFiles(
      git,
      remoteChanges?.deletedFiles ?? localChanges.deletedFiles,
    ),
  };
}

/**
 * The deletions the checkout took. A file the remote deleted and the brain
 * changed stays in the merge, and is no deletion.
 */
export async function withoutKeptFiles(
  git: SimpleGit,
  deletedFiles: string[],
): Promise<string[]> {
  const kept = await Promise.all(
    deletedFiles.map((file) =>
      git.raw(["cat-file", "-e", `HEAD:${file}`]).then(
        () => true,
        () => false,
      ),
    ),
  );
  return deletedFiles.filter((_, index) => !kept[index]);
}

/**
 * Merge what was fetched. Histories that share a version merge as git
 * merges them, and what it cannot merge is left for the caller. Histories
 * that share none, a seeded checkout meeting its remote for the first time,
 * have no version both sides started from: the remote wins, as it always did.
 */
async function mergeRemote(git: SimpleGit, branch: string): Promise<void> {
  const remoteRef = `refs/remotes/origin/${branch}`;
  const related = await git.raw(["merge-base", "HEAD", remoteRef]).then(
    (base) => base.trim().length > 0,
    () => false,
  );
  await git.raw(
    related
      ? ["merge", "--no-edit", remoteRef]
      : [
          "merge",
          "--no-edit",
          "--allow-unrelated-histories",
          "--strategy=recursive",
          "-Xtheirs",
          remoteRef,
        ],
  );
}

/** The pull's result with every remote text still waiting to be recorded. */
async function withUnacknowledgedConflicts(
  result: PullResult,
  baseDir: string,
): Promise<PullResult> {
  const conflicts = await listPullConflicts(baseDir);
  return conflicts.length === 0 ? result : { ...result, conflicts };
}

export async function getChangedPaths(
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

export async function tryResolveRemoteHead(
  git: SimpleGit,
  branch: string,
): Promise<string | undefined> {
  try {
    return await git.revparse([`refs/remotes/origin/${branch}`]);
  } catch {
    return undefined;
  }
}

/** Whether the index holds this side of a conflicted file. */
const hasSide = (git: SimpleGit, side: 2 | 3, file: string): Promise<boolean> =>
  git.raw(["cat-file", "-e", `:${side}:${file}`]).then(
    () => true,
    () => false,
  );

/**
 * Settle the files git could not merge. Text both sides changed keeps the
 * brain's side, and the remote's text is spooled to become a conflict. A
 * file the remote deleted and the brain changed stays. A file the brain
 * deleted and the remote changed comes back. A binary file takes the
 * remote's side, as it always did: it has no text to keep.
 */
async function resolveMergeConflicts(
  git: SimpleGit,
  logger: Logger,
  baseDir: string,
  msg: string,
  conflictedFiles: string[],
): Promise<void> {
  logger.warn("Resolving merge conflict", { error: msg });
  const remoteCommit = (await git.revparse(["MERGE_HEAD"])).trim();
  for (const file of conflictedFiles) {
    const ours = await hasSide(git, 2, file);
    const theirs = await hasSide(git, 3, file);
    if (ours && theirs && file.endsWith(".md")) {
      await spoolPullConflict(baseDir, {
        path: file,
        text: await git.show([`:3:${file}`]),
        remoteCommit,
      });
      await git.raw(["checkout", "--ours", "--", file]);
    } else if (ours && !theirs) {
      await git.raw(["checkout", "--ours", "--", file]);
    } else if (theirs) {
      await git.raw(["checkout", "--theirs", "--", file]);
    } else {
      await git.raw(["rm", "--force", "--", file]);
    }
  }
  await git.add(["-A"]);
  await git.commit("Auto-resolve merge conflict (the brain's version kept)");
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
    const studiog = getErrorMessage(commitError);
    if (!studiog.includes("nothing to commit")) {
      throw commitError;
    }
  }
  signal?.throwIfAborted();
  await pushGitChanges(logger, branch, net, signal);
  return { files: [], deletedFiles: [] };
}
