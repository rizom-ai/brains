import type { SimpleGit } from "simple-git";
import { writeFile } from "fs/promises";
import { join } from "path";
import { getErrorMessage } from "@brains/utils";
import { pathExists } from "./fs-utils";

export async function checkoutGitBranch(
  git: SimpleGit,
  dataDir: string,
  branch: string,
): Promise<void> {
  // Ensure we're on the configured branch. Only create it when the
  // checkout failed because the branch does not exist yet.
  try {
    await git.checkout(branch);
  } catch (error) {
    const message = getErrorMessage(error);
    const branchMissing =
      message.includes(`pathspec '${branch}' did not match`) ||
      message.includes(`invalid reference: ${branch}`) ||
      message.includes("did not match any file(s) known to git");

    if (!branchMissing) {
      throw error;
    }

    await git.checkoutLocalBranch(branch);
    await createInitialCommitIfNeeded(git, dataDir);
  }
}

async function createInitialCommitIfNeeded(
  git: SimpleGit,
  dataDir: string,
): Promise<void> {
  // Create initial commit if empty. Stage ANY existing files in the
  // working tree (seed content, pre-populated brain-data) so the
  // first commit captures them — otherwise the initial commit would
  // contain only .gitkeep and the seed files would sit uncommitted
  // forever until the first entity change triggered auto-commit.
  const log = await git.log().catch(() => ({ all: [] }));
  if (log.all.length > 0) {
    return;
  }

  await git.add("-A");
  const status = await git.status();
  if (status.staged.length === 0 && status.created.length === 0) {
    // Truly empty working tree — fall back to .gitkeep so we have
    // something to commit and a branch to check out.
    const gitkeepPath = join(dataDir, ".gitkeep");
    if (!(await pathExists(gitkeepPath))) {
      await writeFile(gitkeepPath, "");
    }
    await git.add(".gitkeep");
  }
  await git.commit("Initial commit");
}
