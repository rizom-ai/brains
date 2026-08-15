import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSilentLogger } from "@brains/test-utils";
import { BrokerConnection } from "../../../src/lib/broker/client";
import { GitBrokerServer } from "../../../src/lib/broker/server";
import { getGitRemoteFingerprint } from "../../../src/lib/git-options";
import { commitTouching } from "../real-git";

/**
 * Phase 2 of docs/plans/directory-sync-git-execution-broker.md, completed.
 *
 * "A lost acknowledgement within a live broker is replayable by request ID."
 * The replay must return the first result rather than run the work again — a
 * client that retries a commit whose reply it never saw must not produce a
 * second commit.
 */

const LINUX = process.platform === "linux";

let scratch: string | undefined;
let broker: GitBrokerServer | undefined;

async function ownedCheckout(): Promise<{
  checkout: string;
  connect: () => Promise<BrokerConnection>;
}> {
  scratch = await mkdtemp(join(tmpdir(), "broker-idempotency-"));
  const checkout = join(scratch, "checkout");
  const remoteFingerprint = getGitRemoteFingerprint("");

  broker = await GitBrokerServer.start({
    runtimeDir: join(scratch, "runtime"),
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

  const socketPath = broker.socketPath;
  return {
    checkout,
    connect: async (): Promise<BrokerConnection> => {
      const connection = await BrokerConnection.connect(socketPath);
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

describe.skipIf(!LINUX)("a repeated request id", () => {
  it("executes one mutation and answers both times", async () => {
    const { checkout, connect } = await ownedCheckout();
    const connection = await connect();
    await connection.execute(checkout, { name: "initialize" });
    await writeFile(join(checkout, "note.md"), "note\n");

    const requestId = "req_retried00001";
    const first = await connection.executeWithId(requestId, checkout, {
      name: "commit",
    });
    await writeFile(join(checkout, "second.md"), "second\n");
    const second = await connection.executeWithId(requestId, checkout, {
      name: "commit",
    });

    expect(second).toEqual(first);

    // The retry answered from the record. Had it run, `second.md` would have
    // been swept into a commit the caller never asked for twice.
    expect(await commitTouching(checkout, "note.md")).toEqual(["note.md"]);
    expect(await commitTouching(checkout, "second.md")).toEqual([]);

    connection.close();
  }, 60_000);

  it("does not confuse two callers who chose different ids", async () => {
    const { checkout, connect } = await ownedCheckout();
    const connection = await connect();
    await connection.execute(checkout, { name: "initialize" });

    await writeFile(join(checkout, "first.md"), "first\n");
    await connection.executeWithId("req_first00000001", checkout, {
      name: "commit",
    });
    await writeFile(join(checkout, "second.md"), "second\n");
    await connection.executeWithId("req_second0000001", checkout, {
      name: "commit",
    });

    expect(await commitTouching(checkout, "first.md")).toEqual(["first.md"]);
    expect(await commitTouching(checkout, "second.md")).toEqual(["second.md"]);

    connection.close();
  }, 60_000);
});
