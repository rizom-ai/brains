import type { SimpleGit } from "simple-git";
import simpleGit from "simple-git";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "fs/promises";
import { basename, join } from "path";
import type { Logger } from "@brains/utils/logger";
import { pathExists } from "../fs-utils";
import { runGitCommandWithStallTimeout } from "./git-stall";

export interface PrepareGitRepositoryOptions {
  logger: Logger;
  dataDir: string;
  remoteUrl: string;
  /** Supplied to each Git child; never written to the checkout. */
  credentialEnv: Record<string, string>;
  branch: string;
  timeoutMs: number;
  onProgress?: (() => void) | undefined;
  signal?: AbortSignal | undefined;
}

export async function prepareGitRepository(
  options: PrepareGitRepositoryOptions,
): Promise<SimpleGit> {
  const {
    logger,
    dataDir,
    remoteUrl,
    credentialEnv,
    branch,
    timeoutMs,
    onProgress,
    signal,
  } = options;
  const gitDir = join(dataDir, ".git");

  await mkdir(dataDir, { recursive: true });

  if (!(await pathExists(gitDir))) {
    if (remoteUrl) {
      await prepareRepositoryFromRemote({
        logger,
        dataDir,
        remoteUrl,
        credentialEnv,
        branch,
        timeoutMs,
        ...(onProgress ? { onProgress } : {}),
        ...(signal ? { signal } : {}),
      });
    } else {
      await gitInit(dataDir, branch);
    }
  }

  const git = simpleGit(dataDir);

  await repairInvalidPlaceholderHead({ logger, dataDir, branch });

  if (remoteUrl) {
    await configureRemote(git, remoteUrl);
  }

  return git;
}

async function prepareRepositoryFromRemote(options: {
  logger: Logger;
  dataDir: string;
  remoteUrl: string;
  credentialEnv: Record<string, string>;
  branch: string;
  timeoutMs: number;
  onProgress?: (() => void) | undefined;
  signal?: AbortSignal | undefined;
}): Promise<void> {
  const {
    logger,
    dataDir,
    remoteUrl,
    credentialEnv,
    branch,
    timeoutMs,
    onProgress,
    signal,
  } = options;

  const initLocally = async (
    reason: string,
    cleanupDir?: string,
  ): Promise<void> => {
    logger.info(reason, { gitUrl: remoteUrl });
    if (cleanupDir) {
      await rm(cleanupDir, { recursive: true, force: true });
    }
    await gitInit(dataDir, branch);
  };

  let remoteHasHistory: boolean;
  try {
    const refs = await runGitCommandWithStallTimeout(
      {
        baseDir: dataDir,
        timeoutMs,
        credentialEnv,
        ...(onProgress ? { onProgress } : {}),
      },
      ["ls-remote", "--heads", remoteUrl],
      signal,
    );
    remoteHasHistory = refs.trim().length > 0;
  } catch {
    if (signal?.aborted) throw signal.reason;
    return initLocally("ls-remote failed, initializing locally");
  }

  if (!remoteHasHistory) {
    return initLocally("Remote is empty, initializing locally");
  }

  logger.info("Cloning repository", { gitUrl: remoteUrl });
  const parentDir = join(dataDir, "..");
  const cloneDir = await mkdtemp(
    join(parentDir, `${basename(dataDir)}-clone-`),
  );

  try {
    await runGitCommandWithStallTimeout(
      {
        baseDir: parentDir,
        timeoutMs,
        credentialEnv,
        ...(onProgress ? { onProgress } : {}),
      },
      ["clone", remoteUrl, cloneDir],
      signal,
    );
    await rm(dataDir, { recursive: true, force: true });
    await rename(cloneDir, dataDir);
  } catch {
    if (signal?.aborted) {
      await rm(cloneDir, { recursive: true, force: true });
      throw signal.reason;
    }
    await initLocally("Clone failed, initializing locally", cloneDir);
  }
}

async function gitInit(dataDir: string, branch: string): Promise<void> {
  await simpleGit(dataDir).raw(["init", `--initial-branch=${branch}`]);
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

/**
 * The remote is stored credential-free.
 *
 * It used to be stored authenticated, which put the token in `.git/config` —
 * inside the very checkout that then gets cloned, backed up, and synced.
 */
async function configureRemote(
  git: SimpleGit,
  remoteUrl: string,
): Promise<void> {
  const remotes = await git.getRemotes(true);
  const origin = remotes.find((r) => r.name === "origin");
  if (origin) {
    await git.remote(["set-url", "origin", remoteUrl]);
  } else {
    await git.addRemote("origin", remoteUrl);
  }
}
