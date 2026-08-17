import { afterEach, describe, expect, it } from "bun:test";
import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSilentLogger } from "@brains/test-utils";
import { BrokerConnection } from "../../../src/lib/broker/client";
import { connectGitSync } from "../../../src/lib/broker/connect";
import { GitBrokerServer } from "../../../src/lib/broker/server";
import { getGitRemoteFingerprint } from "../../../src/lib/git-options";
import { commitTouching } from "../real-git";

/**
 * Review blocker 1.
 *
 * A replacement inherits a checkout whose state nobody has accounted for: the
 * lost generation may have committed without anything being enqueued. The
 * plan's order is prove the old group absent, start the replacement with Git
 * admission closed, reconcile, and only then reopen. Announcing readiness on
 * binding the socket skipped the middle two steps, so mutations could land
 * before anything had looked at what was already there.
 *
 * The broker cannot reconcile: the queue and the durable checkpoint live in
 * the app. So it refuses mutations until a role tells it reconciliation is
 * done, and reads stay open because reconciliation is made of reads.
 */

const LINUX = process.platform === "linux";

let scratch: string | undefined;
let broker: GitBrokerServer | undefined;

interface Owned {
  checkout: string;
  runtimeDir: string;
  /** Read at call time: the owner is replaced during these tests. */
  socketPath: () => string;
  connect: () => Promise<BrokerConnection>;
  restart: () => Promise<void>;
}

async function ownedCheckout(): Promise<Owned> {
  scratch = await mkdtemp(join(tmpdir(), "broker-admission-"));
  const checkout = join(scratch, "checkout");
  const runtimeDir = join(scratch, "runtime");
  const remoteFingerprint = getGitRemoteFingerprint("");

  const start = async (): Promise<void> => {
    broker = await GitBrokerServer.start({
      runtimeDir,
      resolveCheckout: (path) =>
        path === checkout
          ? {
              logger: createSilentLogger(),
              dataDir: checkout,
              branch: "main",
              remoteUrl: "",
              remoteFingerprint,
              timeoutMs: 30_000,
              authorName: "Test",
              authorEmail: "test@example.com",
            }
          : undefined,
    });
  };
  await start();

  return {
    checkout,
    runtimeDir,
    socketPath: (): string => broker?.socketPath ?? "",
    restart: async (): Promise<void> => {
      await broker?.stop();
      broker = undefined;
      await start();
    },
    connect: async (): Promise<BrokerConnection> => {
      const connection = await BrokerConnection.connect(
        broker?.socketPath ?? "",
      );
      await connection.registerCheckout({
        checkoutPath: checkout,
        branch: "main",
        remoteFingerprint,
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

describe.skipIf(!LINUX)("git admission", () => {
  it("holds every replacement until durable handoff is reconciled", async () => {
    const owned = await ownedCheckout();
    const connection = await owned.connect();
    await connection.execute(owned.checkout, { name: "initialize" });

    // A terminal broker record does not prove the caller received the result
    // or advanced its durable queue checkpoint. Every inherited generation
    // therefore starts closed, including one whose journal is syntactically
    // complete and contains no unsettled request.
    await owned.restart();
    const replacement = await owned.connect();
    expect((await replacement.status()).admitsMutations).toBe(false);

    await replacement.openAdmission();
    expect((await replacement.status()).admitsMutations).toBe(true);

    connection.close();
    replacement.close();
  }, 60_000);

  it("refuses mutations while unaccounted work is outstanding", async () => {
    const owned = await ownedCheckout();
    const connection = await owned.connect();
    await connection.execute(owned.checkout, { name: "initialize" });
    connection.close();

    // The lost generation started something and never settled it.
    await broker?.stop();
    broker = undefined;
    await appendFile(
      join(owned.runtimeDir, "broker-journal.jsonl"),
      `${JSON.stringify({
        requestId: "req_lost00000001",
        checkoutPath: owned.checkout,
        operation: "commit",
        mutating: true,
        startedAt: 1_000,
      })}\n`,
    );
    await owned.restart();

    const replacement = await owned.connect();
    expect((await replacement.status()).admitsMutations).toBe(false);

    await writeFile(join(owned.checkout, "note.md"), "note\n");
    const refused = await replacement
      .execute(owned.checkout, { name: "commit" })
      .then(
        () => undefined,
        (error: unknown) => String(error),
      );

    expect(refused).toContain("admission is closed");
    expect(await commitTouching(owned.checkout, "note.md")).toEqual([]);

    replacement.close();
  }, 60_000);

  it("still answers the reads reconciliation is made of", async () => {
    const owned = await ownedCheckout();
    const connection = await owned.connect();
    await connection.execute(owned.checkout, { name: "initialize" });
    connection.close();

    await broker?.stop();
    broker = undefined;
    await appendFile(
      join(owned.runtimeDir, "broker-journal.jsonl"),
      `${JSON.stringify({
        requestId: "req_lost00000001",
        checkoutPath: owned.checkout,
        operation: "push",
        mutating: true,
        startedAt: 1_000,
      })}\n`,
    );
    await owned.restart();

    // Closing admission to reads would make reconciliation impossible, which
    // would leave the checkout closed forever.
    const replacement = await owned.connect();
    const delta = await replacement.execute(owned.checkout, {
      name: "get-reconciliation-delta",
    });
    expect(delta.mode).toBeDefined();
    expect(
      await replacement.execute(owned.checkout, { name: "get-status" }),
    ).toMatchObject({ isRepo: true });

    replacement.close();
  }, 60_000);

  it("opens once a role reports it has reconciled", async () => {
    const owned = await ownedCheckout();
    const connection = await owned.connect();
    await connection.execute(owned.checkout, { name: "initialize" });
    connection.close();

    await broker?.stop();
    broker = undefined;
    await appendFile(
      join(owned.runtimeDir, "broker-journal.jsonl"),
      `${JSON.stringify({
        requestId: "req_lost00000001",
        checkoutPath: owned.checkout,
        operation: "commit",
        mutating: true,
        startedAt: 1_000,
      })}\n`,
    );
    await owned.restart();

    const replacement = await owned.connect();
    await replacement.openAdmission();
    expect((await replacement.status()).admitsMutations).toBe(true);

    await writeFile(join(owned.checkout, "note.md"), "note\n");
    await replacement.execute(owned.checkout, { name: "commit" });
    expect(await commitTouching(owned.checkout, "note.md")).toEqual([
      "note.md",
    ]);

    replacement.close();
  }, 60_000);

  it("refuses a role's own commit until that role has reconciled", async () => {
    const owned = await ownedCheckout();
    const connection = await owned.connect();
    await connection.execute(owned.checkout, { name: "initialize" });
    connection.close();

    await broker?.stop();
    broker = undefined;
    await appendFile(
      join(owned.runtimeDir, "broker-journal.jsonl"),
      `${JSON.stringify({
        requestId: "req_lost00000001",
        checkoutPath: owned.checkout,
        operation: "commit",
        mutating: true,
        startedAt: 1_000,
      })}\n`,
    );
    await owned.restart();

    // The path a role actually uses, not the raw protocol.
    const gitSync = await connectGitSync({
      socketPath: owned.socketPath(),
      checkoutPath: owned.checkout,
      branch: "main",
      remoteUrl: "",
      logger: createSilentLogger(),
    });
    expect(await gitSync.admitsMutations()).toBe(false);

    await writeFile(join(owned.checkout, "note.md"), "note\n");
    const refused = await gitSync.commit("held").then(
      () => undefined,
      (error: unknown) => String(error),
    );
    expect(refused).toContain("admission is closed");

    // Reads are what reconciliation is made of, so they answer throughout.
    expect((await gitSync.getStatus()).isRepo).toBe(true);

    await gitSync.openAdmission();
    await gitSync.commit("reconciled");
    expect(await commitTouching(owned.checkout, "note.md")).toEqual([
      "note.md",
    ]);

    await gitSync.cleanup();
  }, 60_000);
});
