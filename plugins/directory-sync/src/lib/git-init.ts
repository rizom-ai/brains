import type { SimpleGit } from "simple-git";
import simpleGit from "simple-git";
import { mkdir, writeFile } from "fs/promises";
import { basename, join } from "path";
import { getErrorMessage } from "@brains/utils";
import type { Logger } from "@brains/utils";
import { pathExists } from "./fs-utils";

export interface GitInitializeOptions {
  logger: Logger;
  dataDir: string;
  remoteUrl: string;
  authenticatedUrl: string;
  branch: string;
  authorName?: string | undefined;
  authorEmail?: string | undefined;
}

/** Initialize git repository — clone, init, or update remote. */
export async function initializeGitRepository(
  options: GitInitializeOptions,
): Promise<SimpleGit> {
  const {
    logger,
    dataDir,
    remoteUrl,
    authenticatedUrl,
    branch,
    authorName,
    authorEmail,
  } = options;

  logger.debug("Initializing git repository", { gitUrl: remoteUrl });

  await mkdir(dataDir, { recursive: true });

  let git = simpleGit(dataDir);
  const gitDirExists = await pathExists(join(dataDir, ".git"));

  if (!gitDirExists) {
    if (remoteUrl) {
      logger.info("Cloning repository", { gitUrl: remoteUrl });
      const parentDir = join(dataDir, "..");
      const repoName = basename(dataDir);
      try {
        await simpleGit(parentDir).clone(authenticatedUrl, repoName);
        git = simpleGit(dataDir);
      } catch {
        // Clone failed (empty repo?) — init locally and add remote
        logger.info("Clone failed, initializing locally");
        await git.init();
        await git.addRemote("origin", authenticatedUrl);
      }
    } else {
      await git.init();
    }
  } else if (remoteUrl) {
    await configureRemote(git, authenticatedUrl);
  }

  await configureIdentity(git, authorName, authorEmail);
  await git.addConfig("pull.rebase", "false");

  await checkoutBranch(git, dataDir, branch);

  return git;
}

async function configureRemote(
  git: SimpleGit,
  authenticatedUrl: string,
): Promise<void> {
  const remotes = await git.getRemotes(true);
  const origin = remotes.find((r) => r.name === "origin");
  if (origin) {
    await git.remote(["set-url", "origin", authenticatedUrl]);
  } else {
    await git.addRemote("origin", authenticatedUrl);
  }
}

async function configureIdentity(
  git: SimpleGit,
  authorName?: string,
  authorEmail?: string,
): Promise<void> {
  if (authorName) {
    await git.addConfig("user.name", authorName);
  }
  if (authorEmail) {
    await git.addConfig("user.email", authorEmail);
  }
}

async function checkoutBranch(
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
