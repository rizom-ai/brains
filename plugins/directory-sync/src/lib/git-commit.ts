import type { OwnedGit } from "./owned-git";
import { getErrorMessage } from "@brains/utils/error";
import type { Logger } from "@brains/utils/logger";
import { GitStallError } from "./git-stall";
import type { GitProcessOptions } from "./git-stall";

/** Stage and commit all changes. */
export async function commitGitChanges(
  git: OwnedGit,
  logger: Logger,
  message?: string,
): Promise<void> {
  const finalMessage = message ?? `Auto-sync: ${new Date().toISOString()}`;

  await resolveLocalConflicts(git, logger);
  await git.add(["-A"]);
  await assertNoConflictMarkers(git);

  try {
    const result = await git.commit(finalMessage);
    // A clean tree yields a result with no commit hash — don't claim a
    // commit happened when it didn't.
    if (result.commit) {
      logger.info("Committed changes", {
        message: finalMessage,
        commit: result.commit,
      });
    } else {
      logger.debug("Nothing to commit", { message: finalMessage });
    }
  } catch (error) {
    // "nothing to commit" is not an error
    if (!getErrorMessage(error).includes("nothing to commit")) {
      throw error;
    }
  }
}

export async function pushGitChanges(
  git: OwnedGit,
  logger: Logger,
  branch: string,
  processOptions: GitProcessOptions,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  logger.debug("Pushing to origin", { branch });
  try {
    await git.raw(["push", "origin", branch, "--set-upstream"], {
      signal,
      onProgress: processOptions.onProgress,
    });
  } catch (error) {
    // Cancellation and stalls are terminal. The fallback exists only for the
    // "no upstream configured" case.
    if (signal?.aborted) throw signal.reason;
    if (error instanceof GitStallError) {
      throw error;
    }
    await git.raw(["push", "origin", branch], {
      signal,
      onProgress: processOptions.onProgress,
    });
  }
  signal?.throwIfAborted();
  logger.info("Pushed changes to remote");
}

async function resolveLocalConflicts(
  git: OwnedGit,
  logger: Logger,
): Promise<void> {
  const status = await git.status();
  if (status.conflicted.length === 0) {
    return;
  }

  logger.warn("Resolving conflicts with local version", {
    files: status.conflicted,
  });
  for (const file of status.conflicted) {
    await git.raw(["checkout", "--ours", file]);
  }
}

async function assertNoConflictMarkers(git: OwnedGit): Promise<void> {
  const diff = await git.diff(["--cached", "--name-only"]);
  for (const file of diff.split("\n").filter((f) => f.trim())) {
    try {
      const content = await git.show([`:${file}`]);
      if (
        content.includes("<<<<<<<") ||
        content.includes("=======") ||
        content.includes(">>>>>>>")
      ) {
        throw new Error(
          `Conflict markers found in ${file}. Manual intervention required.`,
        );
      }
    } catch (error) {
      if (error?.toString().includes("Conflict markers found")) throw error;
      // Can't read file (deleted, binary) — skip check
    }
  }
}
