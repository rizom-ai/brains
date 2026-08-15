import { dirname, resolve } from "path";
import type { Logger } from "@brains/utils/logger";
import { directorySyncConfigSchema } from "../../types/config";
import {
  DEFAULT_GIT_TIMEOUT_MS,
  getAuthenticatedGitUrl,
  getGitRemoteFingerprint,
  resolveGitRemoteUrl,
} from "../git-options";
import { BrokerStartupError, GitBrokerServer } from "./server";

/**
 * What the broker child process runs.
 *
 * It reads the same `brain.yaml` its app roles read and owns the one checkout
 * that configuration names. Resolving the checkout here rather than accepting
 * it from a client is what keeps a token out of the protocol: the remote URL,
 * its credentials, and the branch never leave this process.
 */

export interface GitBrokerHostOptions {
  /** Handed down by the supervisor; every role connects to this path. */
  socketPath: string;
  /** Instance root. Relative configuration paths resolve against it. */
  cwd: string;
  /** The Brain's data dir, with the shell default already applied. */
  dataDir: string;
  /** `plugins.directory-sync` from `brain.yaml`, unvalidated. */
  pluginConfig: unknown;
  logger: Logger;
}

/** The checkout this Brain's directory-sync configuration points at. */
export function resolveCheckoutPath(options: {
  cwd: string;
  dataDir: string;
  syncPath?: string | undefined;
}): string {
  return resolve(options.cwd, options.syncPath ?? options.dataDir);
}

export async function startGitBrokerHost(
  options: GitBrokerHostOptions,
): Promise<GitBrokerServer> {
  const config = directorySyncConfigSchema.parse(options.pluginConfig ?? {});
  const git = config.git;
  const remoteUrl = git
    ? resolveGitRemoteUrl({
        logger: options.logger,
        dataDir: options.dataDir,
        repo: git.repo,
        gitUrl: git.gitUrl,
      })
    : "";
  if (!git || remoteUrl.length === 0) {
    throw new BrokerStartupError(
      "This Brain configures no Git remote, so there is no checkout to own",
    );
  }

  const checkoutPath = resolveCheckoutPath({
    cwd: options.cwd,
    dataDir: options.dataDir,
    syncPath: config.syncPath,
  });
  const checkout = {
    logger: options.logger.child("GitBroker"),
    dataDir: checkoutPath,
    branch: git.branch,
    remoteUrl,
    authenticatedUrl: getAuthenticatedGitUrl(remoteUrl, git.authToken),
    remoteFingerprint: getGitRemoteFingerprint(remoteUrl),
    timeoutMs: DEFAULT_GIT_TIMEOUT_MS,
    authorName: git.authorName,
    authorEmail: git.authorEmail,
  };

  return GitBrokerServer.start({
    runtimeDir: dirname(options.socketPath),
    resolveCheckout: (path) => (path === checkoutPath ? checkout : undefined),
  });
}
