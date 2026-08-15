import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSilentLogger } from "@brains/test-utils";
import { sha256Hex } from "@brains/utils/hash";
import { BrokerConnection } from "../../../src/lib/broker/client";
import { BrokerGitSync } from "../../../src/lib/broker/git-sync-client";
import { GitBrokerServer } from "../../../src/lib/broker/server";

/**
 * Phase 2: callers keep an `IGitSync`-shaped seam while every method becomes
 * one owned operation.
 */

const LINUX = process.platform === "linux";
const FINGERPRINT = sha256Hex("");

let scratch: string | undefined;
let broker: GitBrokerServer | undefined;

async function harness(): Promise<{
  client: BrokerGitSync;
  checkout: string;
}> {
  scratch = await mkdtemp(join(tmpdir(), "broker-gitsync-"));
  const checkout = join(scratch, "checkout");

  broker = await GitBrokerServer.start({
    runtimeDir: join(scratch, "runtime"),
    resolveCheckout: (path) =>
      path === checkout
        ? {
            logger: createSilentLogger(),
            dataDir: checkout,
            branch: "main",
            remoteUrl: "",
            authenticatedUrl: "",
            remoteFingerprint: FINGERPRINT,
            timeoutMs: 30_000,
            authorName: "Test",
            authorEmail: "test@example.com",
          }
        : undefined,
  });

  const socketPath = broker.socketPath;
  const client = new BrokerGitSync({
    connect: (): Promise<BrokerConnection> =>
      BrokerConnection.connect(socketPath),
    checkoutPath: checkout,
    branch: "main",
    remoteFingerprint: FINGERPRINT,
    remoteUrl: "",
  });
  await client.attach();

  return { client, checkout };
}

afterEach(async () => {
  await broker?.stop();
  broker = undefined;
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe.skipIf(!LINUX)("broker-backed IGitSync", () => {
  it("serves the whole caller-facing surface", async () => {
    const { client, checkout } = await harness();

    await client.initialize();
    expect(client.hasRemote()).toBe(false);
    expect(await client.hasLocalChanges()).toBe(false);

    await writeFile(join(checkout, "note.md"), "hello\n");
    expect(await client.hasLocalChanges()).toBe(true);
    await client.commit("add note");

    const status = await client.getStatus();
    expect(status.branch).toBe("main");
    expect(status.hasChanges).toBe(false);

    const log = await client.log("note.md");
    expect(log).toHaveLength(1);
    expect(await client.show(log[0]?.sha ?? "", "note.md")).toBe("hello\n");

    const checkpoint = await client.getCheckpoint();
    const delta = await client.getReconciliationDelta(checkpoint);
    expect(delta.mode).toBe("incremental");

    await client.cleanup();
  }, 60_000);

  it("exposes no lease", () => {
    // A lease is a turn an application process holds across work the broker
    // cannot see. Its absence is the point, so it is asserted rather than
    // assumed from the type.
    expect(Object.getOwnPropertyNames(BrokerGitSync.prototype)).not.toContain(
      "withLock",
    );
  });

  it("reports a failed operation to the caller rather than hanging", async () => {
    const { client } = await harness();
    await client.initialize();

    const outcome = await client.show("deadbeef", "missing.md").then(
      () => undefined,
      (error: unknown) => String(error),
    );

    expect(outcome).toBeDefined();
    await client.cleanup();
  }, 60_000);
});
