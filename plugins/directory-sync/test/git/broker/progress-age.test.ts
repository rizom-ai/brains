import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSilentLogger } from "@brains/test-utils";
import { BrokerConnection } from "../../../src/lib/broker/client";
import { GitBrokerServer } from "../../../src/lib/broker/server";
import { getGitRemoteFingerprint } from "../../../src/lib/git-options";
import { installOneShotSlowPreCommit, untilExists } from "../real-git";

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
            authenticatedUrl: "",
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

    // A commit that pauses inside Git, which is what a wedged operation looks
    // like from outside: still owned, still running, nothing exited.
    const started = await installOneShotSlowPreCommit(
      checkout,
      scratch ?? "",
      2,
    );
    await writeFile(join(checkout, "note.md"), "note\n");
    const committing = worker.execute(checkout, { name: "commit" });
    expect(await untilExists(started)).toBe(true);

    // A second client can ask, exactly as a supervisor's probe would.
    const observer = await connect();
    now = 5_000;
    const during = await observer.status();
    expect(during.activeRequestIds).toHaveLength(1);
    expect(during.oldestActiveProgressAt).toBe(1_000);

    await committing;
    const after = await observer.status();
    expect(after.activeRequestIds).toEqual([]);
    expect(after.oldestActiveProgressAt).toBeNull();

    worker.close();
    observer.close();
  }, 60_000);
});
