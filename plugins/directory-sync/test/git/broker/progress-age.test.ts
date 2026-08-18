import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSilentLogger } from "@brains/test-utils";
import { BrokerConnection } from "../../../src/lib/broker/client";
import { GitBrokerServer } from "../../../src/lib/broker/server";
import { getGitRemoteFingerprint } from "../../../src/lib/git-options";
import { pointOriginAt, stallingRemote } from "../real-git";

/**
 * Phase 3 of docs/plans/directory-sync-git-execution-broker.md.
 *
 * A wedged owner does not exit — that is the whole shape of the Bun defect
 * this design has to survive — so supervision cannot wait for a process to
 * die. It watches durable facts instead: what is active, and how long since
 * that operation last showed progress.
 */

const LINUX = process.platform === "linux";

let scratch: string | undefined;
let broker: GitBrokerServer | undefined;

interface Harness {
  checkout: string;
  identity: { branch: string; remoteFingerprint: string };
  connect(): Promise<BrokerConnection>;
}

async function harness(now: () => number): Promise<Harness> {
  scratch = await mkdtemp(join(tmpdir(), "progress-age-"));
  const checkout = join(scratch, "checkout");
  const identity = {
    branch: "main",
    remoteFingerprint: getGitRemoteFingerprint(""),
  };

  broker = await GitBrokerServer.start({
    runtimeDir: join(scratch, "runtime"),
    now,
    resolveCheckout: (path) =>
      path === checkout
        ? {
            logger: createSilentLogger(),
            dataDir: checkout,
            branch: "main",
            remoteUrl: "",
            remoteFingerprint: identity.remoteFingerprint,
            timeoutMs: 30_000,
            authorName: "Test",
            authorEmail: "test@example.com",
          }
        : undefined,
  });

  const socketPath = broker.socketPath;
  return {
    checkout,
    identity,
    connect: async (): Promise<BrokerConnection> => {
      const connection = await BrokerConnection.connect(socketPath);
      await connection.registerCheckout({
        checkoutPath: checkout,
        ...identity,
      });
      return connection;
    },
  };
}

afterEach(async () => {
  await broker?.stop();
  broker = undefined;
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

/**
 * Hold the checkout turn the way production can.
 *
 * Managed operations no longer run hooks, so a turn is held with a network
 * operation waiting on a remote that never answers — which is also closer to
 * the case supervision exists for.
 */
async function holdTheTurn(
  client: BrokerConnection,
  checkout: string,
): Promise<{ done: Promise<unknown>; release: () => void }> {
  const remote = stallingRemote();
  await pointOriginAt(checkout, remote.gitUrl);
  const done = client
    .execute(checkout, { name: "pull" })
    .catch(() => undefined);
  return { done, release: remote.release };
}

/** Wait until the broker reports something actually holding the turn. */
async function untilHolding(client: BrokerConnection): Promise<void> {
  const deadline = Date.now() + 20_000;
  const poll = async (): Promise<void> => {
    if ((await client.status()).activeRequestIds.length > 0) return;
    if (Date.now() >= deadline) throw new Error("nothing took the turn");
    await Bun.sleep(50);
    return poll();
  };
  return poll();
}

describe.skipIf(!LINUX)("broker progress age", () => {
  it("reports nothing active when it is idle", async () => {
    const { connect } = await harness(() => 1_000);
    const connection = await connect();

    const status = await connection.status();
    expect(status.activeRequestIds).toEqual([]);
    expect(status.oldestActiveProgressAt).toBeNull();

    connection.close();
  }, 30_000);

  it("reports an in-flight operation and when it last showed progress", async () => {
    let now = 1_000;
    const { checkout, connect } = await harness(() => now);
    const worker = await connect();
    await worker.execute(checkout, { name: "initialize" });

    // Still owned, still running, nothing exited — what a wedged operation
    // looks like from outside.
    const held = await holdTheTurn(worker, checkout);
    const observer = await connect();
    await untilHolding(observer);

    now = 5_000;
    const during = await observer.status();
    expect(during.activeRequestIds).toHaveLength(1);
    expect(during.oldestActiveProgressAt).not.toBeNull();

    held.release();
    await held.done;
    const after = await observer.status();
    expect(after.activeRequestIds).toEqual([]);
    expect(after.oldestActiveProgressAt).toBeNull();

    worker.close();
    observer.close();
  }, 60_000);

  it("counts a queued request as waiting, not as stalled work", async () => {
    let now = 1_000;
    const { checkout, connect } = await harness(() => now);
    const worker = await connect();
    await worker.execute(checkout, { name: "initialize" });

    // One operation holds the turn; a second arrives behind it.
    const held = await holdTheTurn(worker, checkout);
    const observer = await connect();
    await untilHolding(observer);

    now = 5_000;
    const queued = observer.execute(checkout, { name: "get-status" });
    await Bun.sleep(200);

    // The queued request has made no progress because it has not started.
    // Counting its wait made the oldest progress look old and killed a
    // broker whose actual work was fine.
    now = 9_000;
    const during = await observer.status();
    expect(during.queuedRequestIds).toHaveLength(1);
    expect(during.activeRequestIds).toHaveLength(1);
    expect(during.oldestActiveProgressAt).toBeLessThan(5_000);

    held.release();
    await held.done;
    await queued;
    const after = await observer.status();
    expect(after.activeRequestIds).toEqual([]);
    expect(after.queuedRequestIds).toEqual([]);

    worker.close();
    observer.close();
  }, 60_000);
});
