import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSilentLogger } from "@brains/test-utils";
import { connectGitSync } from "../../../src/lib/broker/connect";
import {
  createBrokerHealthCheck,
  probeBrokerActivity,
} from "../../../src/lib/broker/health";
import { startGitBrokerHost } from "../../../src/lib/broker/host";
import { gitBrokerSocketPath } from "../../../src/lib/broker/server";
import type { GitBrokerServer } from "../../../src/lib/broker/server";

/**
 * Review blocker 6.
 *
 * A health request must observe, never act. Asking through a role's own client
 * meant the probe could reconnect, notice a new owner, and schedule durable
 * replay — so reading `/health/operate` could start queue and repository
 * writes. That is not a health check; that is a side effect with a status
 * code.
 */

const LINUX = process.platform === "linux";

let scratch: string | undefined;
let broker: GitBrokerServer | undefined;

interface Owned {
  socketPath: string;
  checkoutPath: string;
  gitUrl: string;
  restart(): Promise<void>;
}

async function ownedCheckout(): Promise<Owned> {
  scratch = await mkdtemp(join(tmpdir(), "health-read-only-"));
  const socketPath = gitBrokerSocketPath(join(scratch, "runtime"));
  const checkoutPath = join(scratch, "brain-data");
  const gitUrl = `file://${join(scratch, "remote.git")}`;
  const start = async (): Promise<void> => {
    broker = await startGitBrokerHost({
      socketPath,
      cwd: scratch ?? "",
      dataDir: checkoutPath,
      logger: createSilentLogger(),
      pluginConfig: { git: { gitUrl, branch: "main" } },
    });
  };

  await start();
  return {
    socketPath,
    checkoutPath,
    gitUrl,
    restart: async (): Promise<void> => {
      await broker?.stop();
      broker = undefined;
      await start();
    },
  };
}

afterEach(async () => {
  await broker?.stop();
  broker = undefined;
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe.skipIf(!LINUX)("an operational health request", () => {
  it("does not make the role reconcile behind its back", async () => {
    const owned = await ownedCheckout();
    const replacements: string[] = [];
    const gitSync = await connectGitSync({
      socketPath: owned.socketPath,
      checkoutPath: owned.checkoutPath,
      branch: "main",
      remoteUrl: owned.gitUrl,
      logger: createSilentLogger(),
      onOwnerReplaced: (brokerId) => {
        replacements.push(brokerId);
      },
    });
    await gitSync.initialize();

    await owned.restart();

    // The owner changed. A probe that went through this client would reattach,
    // notice that, and schedule durable replay — from a read.
    const health = await createBrokerHealthCheck({
      probe: probeBrokerActivity(owned.socketPath),
      now: () => Date.now(),
      progressTimeoutMs: 60_000,
    })();

    expect(health.status).toBe("degraded");
    expect(replacements).toEqual([]);

    // Resolving recovery is an explicit write by the scheduling role, never a
    // side effect of the probe. Once reported, historical ambiguity may remain
    // visible without keeping operational health degraded forever.
    const recovery = await import("../../../src/lib/broker/client").then(
      ({ BrokerConnection }) => BrokerConnection.connect(owned.socketPath),
    );
    await recovery.openAdmission();
    recovery.close();
    const recovered = await createBrokerHealthCheck({
      probe: probeBrokerActivity(owned.socketPath),
      now: () => Date.now(),
      progressTimeoutMs: 60_000,
    })();
    expect(recovered.status).toBe("healthy");

    await gitSync.cleanup();
  }, 60_000);

  it("reports an owner that answers nothing at all", async () => {
    const owned = await ownedCheckout();
    await broker?.stop();
    broker = undefined;

    const health = await createBrokerHealthCheck({
      probe: probeBrokerActivity(owned.socketPath),
      now: () => Date.now(),
      progressTimeoutMs: 60_000,
    })();

    expect(health.status).toBe("unhealthy");
    expect(health.message).toContain("owner");
  }, 60_000);

  it("reports work the previous generation left unaccounted for", async () => {
    const owned = await ownedCheckout();
    const connection = await import("../../../src/lib/broker/client").then(
      ({ BrokerConnection }) => BrokerConnection.connect(owned.socketPath),
    );
    const status = await connection.status();

    // Nothing was lost here, so the honest report is that the record is whole
    // and nothing is outstanding. The fields have to exist for the degraded
    // case to be reportable at all.
    expect(status.ambiguousRequestIds).toEqual([]);
    expect(status.evidenceComplete).toBe(true);
    expect(status.recoveryPending).toBe(false);

    connection.close();
  }, 60_000);
});
