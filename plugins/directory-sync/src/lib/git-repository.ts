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
      await simpleGit(dataDir).raw(["init", `--initial-branch=${branch}`]);
    }
  }

  const git = simpleGit(dataDir);

  await repairInvalidPlaceholderHead({ logger, dataDir, branch });

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

  let remoteHasHistory: boolean;
  try {
    const refs = await simpleGit().listRemote(["--heads", authenticatedUrl]);
    remoteHasHistory = refs.trim().length > 0;
  } catch {
    logger.info("ls-remote failed, initializing locally", {
      gitUrl: remoteUrl,
    });
    await simpleGit(dataDir).raw(["init", `--initial-branch=${branch}`]);
    return;
  }

  if (!remoteHasHistory) {
    logger.info("Remote is empty, initializing locally", { gitUrl: remoteUrl });
    await simpleGit(dataDir).raw(["init", `--initial-branch=${branch}`]);
    return;
  }

  logger.info("Cloning repository", { gitUrl: remoteUrl });
  const parentDir = join(dataDir, "..");
  const cloneDir = await mkdtemp(
    join(parentDir, `${basename(dataDir)}-clone-`),
  );

  try {
    await simpleGit(parentDir).clone(authenticatedUrl, cloneDir);
    await rm(dataDir, { recursive: true, force: true });
    await rename(cloneDir, dataDir);
  } catch {
    logger.info("Clone failed, initializing locally");
    await rm(cloneDir, { recursive: true, force: true });
    await simpleGit(dataDir).raw(["init", `--initial-branch=${branch}`]);
  }
}

export async function hasGitHead(dir: string): Promise<boolean> {
  if (!(await pathExists(join(dir, ".git")))) {
    return false;
  }
  try {
    await simpleGit(dir).revparse(["--verify", "HEAD"]);
    return true;
  } catch {
    return false;
  }
}

async function repairInvalidPlaceholderHead(options: {
  logger: Logger;
  dataDir: string;
  branch: string;
}): Promise<void> {
  const { logger, dataDir, branch } = options;
  const headPath = join(dataDir, ".git", "HEAD");
  const headContents = (await readFile(headPath, "utf8")).trim();

  if (headContents !== "ref: refs/heads/.invalid") {
    return;
  }

  logger.warn("Repairing invalid git HEAD", {
    dataDir,
    branch,
    head: headContents,
  });
  await writeFile(headPath, `ref: refs/heads/${branch}\n`);
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
