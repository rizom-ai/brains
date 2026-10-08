import type { SimpleGit } from "simple-git";
import simpleGit from "simple-git";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import type { Logger } from "@brains/utils/logger";
import { pathExists } from "../fs-utils";
import { MANAGED_GIT_CONFIG_ARGS } from "./git-credentials";
import { runGitCommandWithStallTimeout } from "./git-stall";

/** Present in `.git` while a bootstrap checkout is unfinished. */
const CHECKOUT_IN_PROGRESS = "brains-checkout-in-progress";

/** Every local Git process here runs under the managed rules. */
function managedGit(dataDir: string): SimpleGit {
  return simpleGit(dataDir, {
    config: MANAGED_GIT_CONFIG_ARGS,
    unsafe: { allowUnsafeHooksPath: true },
  });
}

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

  // A fresh directory is built; so is a checkout whose bootstrap a crash
  // interrupted, which still carries its marker.
  if (
    !(await pathExists(gitDir)) ||
    (await pathExists(join(gitDir, CHECKOUT_IN_PROGRESS)))
  ) {
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

  const git = managedGit(dataDir);

  await repairInvalidPlaceholderHead({ logger, dataDir, branch });

  if (remoteUrl) {
    await configureRemote(git, remoteUrl);
    await ensureUpstream(git, branch);
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

  const initLocally = async (reason: string): Promise<void> => {
    logger.info(reason, { gitUrl: remoteUrl });
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

  // Built in place: a deployed data directory is a mount point, which can
  // be written into but never removed or renamed onto. Git's own state makes
  // this resumable — until the checkout below names a commit, the next start
  // builds it again.
  logger.info("Checking out repository", { gitUrl: remoteUrl });
  await gitInit(dataDir, branch);
  await configureRemote(managedGit(dataDir), remoteUrl);
  const marker = join(dataDir, ".git", CHECKOUT_IN_PROGRESS);
  await writeFile(marker, "");
  try {
    await runGitCommandWithStallTimeout(
      {
        baseDir: dataDir,
        timeoutMs,
        credentialEnv,
        ...(onProgress ? { onProgress } : {}),
      },
      ["fetch", "--no-tags", "origin", branch],
      signal,
    );
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    logger.error("Fetching the repository failed", {
      gitUrl: remoteUrl,
      error,
    });
    throw error;
  }
  const git = managedGit(dataDir);
  // The remote's content replaces whatever the directory held before it was
  // a checkout.
  await git.raw([
    "checkout",
    "-f",
    "-B",
    branch,
    "--track",
    `origin/${branch}`,
  ]);
  await git.raw(["clean", "-fd"]);
  await rm(marker);
}

/**
 * The branch tracks origin, as a clone would set it up: pulls and the
 * pre-deploy backup both resolve `@{upstream}`. A checkout built without
 * one gets it here on its next start.
 */
async function ensureUpstream(git: SimpleGit, branch: string): Promise<void> {
  const merge = await git
    .raw(["config", "--get", `branch.${branch}.merge`])
    .catch(() => "");
  if (merge.trim()) return;
  await git.raw(["config", `branch.${branch}.remote`, "origin"]);
  await git.raw(["config", `branch.${branch}.merge`, `refs/heads/${branch}`]);
}

async function gitInit(dataDir: string, branch: string): Promise<void> {
  await managedGit(dataDir).raw(["init", `--initial-branch=${branch}`]);
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
