import type { SimpleGit } from "simple-git";
import type { Logger } from "@brains/utils";
import { checkoutGitBranch } from "./git-branch";
import { prepareGitRepository } from "./git-repository";

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

  const git = await prepareGitRepository({
    logger,
    dataDir,
    remoteUrl,
    authenticatedUrl,
  });

  await configureIdentity(git, authorName, authorEmail);
  await git.addConfig("pull.rebase", "false");

  await checkoutGitBranch(git, dataDir, branch);

  return git;
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
