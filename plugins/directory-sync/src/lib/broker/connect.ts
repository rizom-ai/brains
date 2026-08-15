import type { Logger } from "@brains/utils/logger";
import { getGitRemoteFingerprint } from "../git-options";
import { BrokerConnection } from "./client";
import { BrokerGitSync } from "./git-sync-client";

/**
 * How an app role reaches its checkout's owner.
 *
 * There is deliberately no in-process alternative here. A Brain with Git
 * configured is started by a supervisor that runs the broker first, so an
 * absent socket means the runtime is misassembled — not that this process
 * should execute Git itself. Falling back would put a second owner on the
 * checkout, which is the failure this whole design exists to remove.
 */

/** Where the supervisor tells every role its checkout owner is listening. */
export const GIT_BROKER_SOCKET_ENV = "BRAIN_GIT_BROKER_SOCKET";

export interface ConnectGitSyncOptions {
  /** Usually `process.env[GIT_BROKER_SOCKET_ENV]`, absent if unset. */
  socketPath: string | undefined;
  checkoutPath: string;
  branch: string;
  /** Credential-free; the broker resolves any authenticated form itself. */
  remoteUrl: string;
  logger: Logger;
}

export async function connectGitSync(
  options: ConnectGitSyncOptions,
): Promise<BrokerGitSync> {
  const { socketPath } = options;
  if (!socketPath) {
    throw new Error(
      `Git sync is configured but ${GIT_BROKER_SOCKET_ENV} is unset: this role has no checkout owner to work through`,
    );
  }

  const connection = await BrokerConnection.connect(socketPath);
  try {
    // Registration is where identity is checked. A broker that owns a
    // different path, branch, or remote refuses here rather than quietly
    // becoming the owner of something this role did not mean.
    await connection.registerCheckout({
      checkoutPath: options.checkoutPath,
      branch: options.branch,
      remoteFingerprint: getGitRemoteFingerprint(options.remoteUrl),
    });
  } catch (error) {
    connection.close();
    throw error;
  }

  options.logger.debug("Connected to the Git broker", { socketPath });
  return new BrokerGitSync({
    connection,
    checkoutPath: options.checkoutPath,
    remoteUrl: options.remoteUrl,
  });
}
