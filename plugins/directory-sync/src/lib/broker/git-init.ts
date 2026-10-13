import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { SimpleGit } from "simple-git";
import { ATOMIC_WRITE_EXCLUDE_PATTERN } from "../atomic-write";
import type { Logger } from "@brains/utils/logger";
import { checkoutGitBranch } from "../git-branch";
import { prepareGitRepository } from "./git-repository";

export interface GitInitializeOptions {
  logger: Logger;
  dataDir: string;
  remoteUrl: string;
  /** Supplied to each Git child; never written to the checkout. */
  credentialEnv: Record<string, string>;
  branch: string;
  timeoutMs: number;
  onProgress?: (() => void) | undefined;
  signal?: AbortSignal | undefined;
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
    credentialEnv,
    branch,
    timeoutMs,
    onProgress,
    signal,
    authorName,
    authorEmail,
  } = options;

  logger.debug("Initializing git repository", { gitUrl: remoteUrl });

  const git = await prepareGitRepository({
    logger,
    dataDir,
    remoteUrl,
    credentialEnv,
    branch,
    timeoutMs,
    ...(onProgress ? { onProgress } : {}),
    ...(signal ? { signal } : {}),
  });

  await excludeAtomicWrites(git, dataDir);
  await configureIdentity(git, authorName, authorEmail);
  await git.addConfig("pull.rebase", "false");

  await checkoutGitBranch(git, dataDir, branch);

  return git;
}

/**
 * Keep in-flight atomic writes out of every Git operation on this checkout,
 * including `add -A` while an export is mid-replace. The local exclude file
 * is never committed, so the content repository itself is unchanged.
 */
async function excludeAtomicWrites(
  git: SimpleGit,
  dataDir: string,
): Promise<void> {
  const excludePath = resolve(
    dataDir,
    (await git.revparse(["--git-path", "info/exclude"])).trim(),
  );
  const existing = await readFile(excludePath, "utf-8").catch(
    // A fresh repository may not have created info/exclude yet.
    () => "",
  );
  if (existing.split("\n").includes(ATOMIC_WRITE_EXCLUDE_PATTERN)) return;
  await mkdir(dirname(excludePath), { recursive: true });
  const separator = existing === "" || existing.endsWith("\n") ? "" : "\n";
  await writeFile(
    excludePath,
    `${existing}${separator}${ATOMIC_WRITE_EXCLUDE_PATTERN}\n`,
  );
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
