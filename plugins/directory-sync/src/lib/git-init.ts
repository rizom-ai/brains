import type { SimpleGit } from "simple-git";
import simpleGit from "simple-git";
import { mkdir } from "fs/promises";
import { basename, join } from "path";
import type { Logger } from "@brains/utils";
import { pathExists } from "./fs-utils";
import { checkoutGitBranch } from "./git-branch";

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

  await checkoutGitBranch(git, dataDir, branch);

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
