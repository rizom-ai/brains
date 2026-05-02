import type { SimpleGit } from "simple-git";
import { getErrorMessage } from "@brains/utils";
import type { Logger } from "@brains/utils";

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
  git: SimpleGit,
  logger: Logger,
  branch: string,
): Promise<void> {
  logger.debug("Pushing to origin", { branch });
  try {
    await git.push("origin", branch, ["--set-upstream"]);
  } catch {
    await git.push("origin", branch);
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
