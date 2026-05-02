import type { SimpleGit } from "simple-git";
import simpleGit from "simple-git";
import { mkdir } from "fs/promises";
import { basename, join } from "path";
import type { Logger } from "@brains/utils";
import { pathExists } from "./fs-utils";

export interface PrepareGitRepositoryOptions {
  logger: Logger;
  dataDir: string;
  remoteUrl: string;
  authenticatedUrl: string;
}

export async function prepareGitRepository(
  options: PrepareGitRepositoryOptions,
): Promise<SimpleGit> {
  const { logger, dataDir, remoteUrl, authenticatedUrl } = options;

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
