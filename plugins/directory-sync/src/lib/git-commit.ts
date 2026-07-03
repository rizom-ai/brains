import type { SimpleGit } from "simple-git";
import { getErrorMessage } from "@brains/utils/error";
import type { Logger } from "@brains/utils/logger";
import { GitStallError, runGitWithStallTimeout } from "./git-stall";
import type { GitNetwork } from "./git-stall";

/** Stage and commit all changes. */
export async function commitGitChanges(
  git: SimpleGit,
  logger: Logger,
  message?: string,
): Promise<void> {
  const finalMessage = message ?? `Auto-sync: ${new Date().toISOString()}`;

  await resolveLocalConflicts(git, logger);
  await git.add(["-A"]);
  await assertNoConflictMarkers(git);

  try {
    await git.commit(finalMessage);
    logger.info("Committed changes", { message: finalMessage });
  } catch (error) {
    // "nothing to commit" is not an error
    if (!getErrorMessage(error).includes("nothing to commit")) {
      throw error;
    }
  }
}

export async function pushGitChanges(
  logger: Logger,
  branch: string,
  net: GitNetwork,
): Promise<void> {
  logger.debug("Pushing to origin", { branch });
  // The network push runs on a throwaway, stall-guarded instance so an
  // unresponsive remote can't hang the caller and wedge the git lock.
  try {
    await runGitWithStallTimeout(net, (g) =>
      g.push("origin", branch, ["--set-upstream"]),
    );
  } catch (error) {
    // A stall is terminal — don't retry it. The fallback exists only for the
    // "no upstream configured" case.
    if (error instanceof GitStallError) {
      throw error;
    }
    await runGitWithStallTimeout(net, (g) => g.push("origin", branch));
  }
  logger.info("Pushed changes to remote");
}

async function resolveLocalConflicts(
  git: SimpleGit,
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

async function assertNoConflictMarkers(git: SimpleGit): Promise<void> {
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
