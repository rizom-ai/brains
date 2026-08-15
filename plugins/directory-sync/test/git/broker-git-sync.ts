import { afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrokerConnection } from "../../src/lib/broker/client";
import { BrokerGitSync } from "../../src/lib/broker/git-sync-client";
import { GitBrokerServer } from "../../src/lib/broker/server";
import {
  DEFAULT_GIT_TIMEOUT_MS,
  getAuthenticatedGitUrl,
  getGitRemoteFingerprint,
  resolveGitRemoteUrl,
} from "../../src/lib/git-options";
import type { GitSyncOptions } from "../../src/lib/git-options";

/**
 * A checkout with its real owner, for tests that exercise real Git.
 *
 * These tests used to construct `GitSync` and run Git on their own event
 * loop. Production no longer has that path — the plugin reaches Git only
 * through the broker — so the tests go through it too, and what they assert
 * stays a statement about the shipping code.
 */

interface RunningTestBroker {
  server: GitBrokerServer;
  /** Another client of the same owner, as a second process role would be. */
  connect(): Promise<BrokerGitSync>;
}

const started: RunningTestBroker[] = [];
const runtimeDirs: string[] = [];

afterEach(async () => {
  await Promise.all(started.splice(0).map((broker) => broker.server.stop()));
  await Promise.all(
    runtimeDirs
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

export async function startTestBroker(
  options: GitSyncOptions,
): Promise<RunningTestBroker> {
  const runtimeDir = await mkdtemp(join(tmpdir(), "test-broker-"));
  runtimeDirs.push(runtimeDir);

  const remoteUrl = resolveGitRemoteUrl(options);
  const branch = options.branch ?? "main";
  const checkout = {
    logger: options.logger,
    dataDir: options.dataDir,
    branch,
    remoteUrl,
    authenticatedUrl: getAuthenticatedGitUrl(remoteUrl, options.authToken),
    remoteFingerprint: getGitRemoteFingerprint(remoteUrl),
    timeoutMs: options.timeoutMs ?? DEFAULT_GIT_TIMEOUT_MS,
    authorName: options.authorName,
    authorEmail: options.authorEmail,
  };

  const server = await GitBrokerServer.start({
    runtimeDir,
    resolveCheckout: (path) =>
      path === options.dataDir ? checkout : undefined,
  });

  const running: RunningTestBroker = {
    server,
    connect: async (): Promise<BrokerGitSync> => {
      const connection = await BrokerConnection.connect(server.socketPath);
      await connection.registerCheckout({
        checkoutPath: options.dataDir,
        branch,
        remoteFingerprint: checkout.remoteFingerprint,
      });
      return new BrokerGitSync({
        connection,
        checkoutPath: options.dataDir,
        remoteUrl,
      });
    },
  };
  started.push(running);
  return running;
}

/** One checkout, one owner, one client — the common case. */
export async function createBrokerGitSync(
  options: GitSyncOptions,
): Promise<BrokerGitSync> {
  const broker = await startTestBroker(options);
  return broker.connect();
}
