import type { SimpleGit } from "simple-git";
import simpleGit from "simple-git";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "fs/promises";
import { basename, join } from "path";
import type { Logger } from "@brains/utils";
import { pathExists } from "./fs-utils";

export interface PrepareGitRepositoryOptions {
  logger: Logger;
  dataDir: string;
  remoteUrl: string;
  authenticatedUrl: string;
  branch: string;
}

export async function prepareGitRepository(
  options: PrepareGitRepositoryOptions,
): Promise<SimpleGit> {
  const { logger, dataDir, remoteUrl, authenticatedUrl, branch } = options;
  const gitDir = join(dataDir, ".git");

  await mkdir(dataDir, { recursive: true });

  if (!(await pathExists(gitDir))) {
    if (remoteUrl) {
      await prepareRepositoryFromRemote({
        logger,
        dataDir,
        remoteUrl,
        authenticatedUrl,
        branch,
      });
    } else {
      await initializeLocalRepository(dataDir, branch);
    }
  }

  const git = simpleGit(dataDir);

  await repairGitHeadIfNeeded({ logger, dataDir, branch });

  if (remoteUrl) {
    await configureRemote(git, authenticatedUrl);
  }

  return git;
}

async function prepareRepositoryFromRemote(options: {
  logger: Logger;
  dataDir: string;
  remoteUrl: string;
  authenticatedUrl: string;
  branch: string;
}): Promise<void> {
  const { logger, dataDir, remoteUrl, authenticatedUrl, branch } = options;
  logger.info("Cloning repository", { gitUrl: remoteUrl });

  const parentDir = join(dataDir, "..");
  const cloneDir = await mkdtemp(
    join(parentDir, `${basename(dataDir)}-clone-`),
  );

  try {
    await simpleGit(parentDir).clone(authenticatedUrl, cloneDir);

    const clonedGit = simpleGit(cloneDir);
    if (await repositoryHasCommits(clonedGit)) {
      logger.info(
        "Remote has history, replacing local directory with cloned repository",
        { dataDir },
      );
      await rm(dataDir, { recursive: true, force: true });
      await rename(cloneDir, dataDir);
      return;
    }

    logger.info("Remote is empty, initializing locally");
    await rm(cloneDir, { recursive: true, force: true });
    await initializeLocalRepository(dataDir, branch);
  } catch {
    logger.info("Clone failed, initializing locally");
    await rm(cloneDir, { recursive: true, force: true });
    await initializeLocalRepository(dataDir, branch);
  }
}

async function repositoryHasCommits(git: SimpleGit): Promise<boolean> {
  try {
    await git.revparse(["--verify", "HEAD"]);
    return true;
  } catch {
    return false;
  }
}

async function initializeLocalRepository(
  dataDir: string,
  branch: string,
): Promise<void> {
  await simpleGit(dataDir).raw(["init", `--initial-branch=${branch}`]);
}

async function repairGitHeadIfNeeded(options: {
  logger: Logger;
  dataDir: string;
  branch: string;
}): Promise<void> {
  const { logger, dataDir, branch } = options;
  const gitDir = join(dataDir, ".git");
  if (!(await pathExists(gitDir))) {
    return;
  }

  const headPath = join(gitDir, "HEAD");
  const targetHead = `ref: refs/heads/${branch}`;
  let headContents: string;

  try {
    headContents = (await readFile(headPath, "utf8")).trim();
  } catch {
    logger.warn("Repairing missing or unreadable git HEAD", {
      dataDir,
      branch,
    });
    await writeFile(headPath, `${targetHead}\n`);
    return;
  }

  if (headContents === targetHead) {
    return;
  }

  if (headContents === "ref: refs/heads/.invalid") {
    logger.warn("Repairing invalid git HEAD", {
      dataDir,
      branch,
      head: headContents,
    });
    await writeFile(headPath, `${targetHead}\n`);
  }
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
