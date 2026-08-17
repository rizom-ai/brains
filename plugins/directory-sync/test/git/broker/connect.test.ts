import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSilentLogger } from "@brains/test-utils";
import { connectGitSync } from "../../../src/lib/broker/connect";
import { GIT_BROKER_SOCKET_ENV } from "../../../src/lib/broker/connect";
import { startGitBrokerHost } from "../../../src/lib/broker/host";
import { gitBrokerSocketPath } from "../../../src/lib/broker/server";
import type { GitBrokerServer } from "../../../src/lib/broker/server";

/**
 * An app role reaches Git only through its checkout's owner. What is asserted
 * here is mostly what does *not* happen: no socket means no Git, and a broker
 * that owns something else is refused rather than used.
 */

const LINUX = process.platform === "linux";

let scratch: string | undefined;
let broker: GitBrokerServer | undefined;

async function ownedCheckout(): Promise<{
  socketPath: string;
  checkoutPath: string;
  gitUrl: string;
}> {
  scratch = await mkdtemp(join(tmpdir(), "broker-connect-"));
  const socketPath = gitBrokerSocketPath(join(scratch, "runtime"));
  const checkoutPath = join(scratch, "brain-data");
  const gitUrl = `file://${join(scratch, "remote.git")}`;

  broker = await startGitBrokerHost({
    socketPath,
    cwd: scratch,
    dataDir: checkoutPath,
    logger: createSilentLogger(),
    pluginConfig: { git: { gitUrl, branch: "main" } },
  });

  return { socketPath, checkoutPath, gitUrl };
}

afterEach(async () => {
  await broker?.stop();
  broker = undefined;
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe("git broker connection", () => {
  it("refuses to run Git without a checkout owner", async () => {
    // No fallback: an absent socket means the runtime is misassembled, not
    // that this process should execute Git itself.
    const outcome = await connectGitSync({
      socketPath: undefined,
      checkoutPath: "/brain/brain-data",
      branch: "main",
      remoteUrl: "https://github.com/rizom-ai/content.git",
      logger: createSilentLogger(),
    }).then(
      () => undefined,
      (error: unknown) => String(error),
    );

    expect(outcome).toContain(GIT_BROKER_SOCKET_ENV);
  });

  it.skipIf(!LINUX)(
    "registers its checkout before handing back a client",
    async () => {
      const { socketPath, checkoutPath, gitUrl } = await ownedCheckout();

      const gitSync = await connectGitSync({
        socketPath,
        checkoutPath,
        branch: "main",
        remoteUrl: gitUrl,
        logger: createSilentLogger(),
      });

      expect(gitSync.hasRemote()).toBe(true);
      await gitSync.initialize();
      expect(await gitSync.hasLocalChanges()).toBe(false);

      await gitSync.cleanup();
    },
    30_000,
  );

  it.skipIf(!LINUX)(
    "refuses a broker that owns a different checkout",
    async () => {
      const { socketPath, gitUrl } = await ownedCheckout();

      const outcome = await connectGitSync({
        socketPath,
        checkoutPath: join(scratch ?? "", "somewhere-else"),
        branch: "main",
        remoteUrl: gitUrl,
        logger: createSilentLogger(),
      }).then(
        () => undefined,
        (error: unknown) => String(error),
      );

      expect(outcome).toContain("owns no checkout");
    },
    30_000,
  );

  it.skipIf(!LINUX)(
    "refuses a broker holding a different remote identity",
    async () => {
      const { socketPath, checkoutPath } = await ownedCheckout();

      // Same path, different repository. Accepting this would move ownership
      // to another remote while every role still believed it shared one owner.
      const outcome = await connectGitSync({
        socketPath,
        checkoutPath,
        branch: "main",
        remoteUrl: "https://github.com/rizom-ai/other.git",
        logger: createSilentLogger(),
      }).then(
        () => undefined,
        (error: unknown) => String(error),
      );

      expect(outcome).toContain("different branch or remote identity");
    },
    30_000,
  );
});
