import type { OwnedGit } from "./owned-git";
import type { Logger } from "@brains/utils/logger";
import { checkoutGitBranch } from "./git-branch";
import { prepareGitRepository } from "./git-repository";
import type { GitRunnerFactory } from "./git-runner-factory";

export interface GitInitializeOptions {
  logger: Logger;
  dataDir: string;
  remoteUrl: string;
  authenticatedUrl: string;
  branch: string;
  timeoutMs: number;
  signal?: AbortSignal | undefined;
  runnerFactory?: GitRunnerFactory | undefined;
  authorName?: string | undefined;
  authorEmail?: string | undefined;
}

/** Initialize git repository — clone, init, or update remote. */
export async function initializeGitRepository(
  options: GitInitializeOptions,
): Promise<OwnedGit> {
  const {
    logger,
    dataDir,
    remoteUrl,
    authenticatedUrl,
    branch,
    timeoutMs,
    signal,
    runnerFactory,
    authorName,
    authorEmail,
  } = options;

  logger.debug("Initializing git repository", { gitUrl: remoteUrl });

  const git = await prepareGitRepository({
    logger,
    dataDir,
    remoteUrl,
    authenticatedUrl,
    branch,
    timeoutMs,
    signal,
    runnerFactory,
  });

  await configureIdentity(git, authorName, authorEmail);
  await git.addConfig("pull.rebase", "false");

  await checkoutGitBranch(git, dataDir, branch);

  return git;
}

async function configureIdentity(
  git: OwnedGit,
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
