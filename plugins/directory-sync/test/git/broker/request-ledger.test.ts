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
 * A request id is a promise that the work happens once.
 *
 * An independent review broke that twice with real Git: sending one id
 * concurrently produced two commits, and retrying an id after the answer
 * window had rolled over produced a third. Both are the duplicate mutation
 * safety invariant 5 forbids.
 */

const LINUX = process.platform === "linux";

let scratch: string | undefined;
let broker: GitBrokerServer | undefined;

interface Owned {
  checkout: string;
  /** A second checkout of the same owner, for id-reuse across them. */
  sibling: string;
  connect: () => Promise<BrokerConnection>;
}

async function ownedCheckout(
  options: { answeredWindow?: number } = {},
): Promise<Owned> {
  scratch = await mkdtemp(join(tmpdir(), "request-ledger-"));
  const checkout = join(scratch, "checkout");
  const sibling = join(scratch, "sibling");
  const remoteFingerprint = getGitRemoteFingerprint("");
  const owned = new Set([checkout, sibling]);

  broker = await GitBrokerServer.start({
    runtimeDir: join(scratch, "runtime"),
    ...(options.answeredWindow === undefined
      ? {}
      : { answeredWindow: options.answeredWindow }),
    resolveCheckout: (path) =>
      owned.has(path)
        ? {
            logger: createSilentLogger(),
            dataDir: path,
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
    sibling,
    connect: async (): Promise<BrokerConnection> => {
      const connection = await BrokerConnection.connect(socketPath);
      for (const path of owned) {
        await connection.registerCheckout({
          checkoutPath: path,
          branch: "main",
          remoteFingerprint,
        });
      }
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

describe.skipIf(!LINUX)("one request id", () => {
  it("commits once when it arrives twice at the same moment", async () => {
    const { checkout, connect } = await ownedCheckout();
    const connection = await connect();
    await connection.execute(checkout, { name: "initialize" });
    await writeFile(join(checkout, "note.md"), "note\n");

    // Both in flight together: the second must join the first rather than
    // start its own commit. Checking only settled answers let it through.
    const requestId = "req_concurrent001";
    const [first, second] = await Promise.all([
      connection.executeWithId(requestId, checkout, { name: "commit" }),
      connection.executeWithId(requestId, checkout, { name: "commit" }),
    ]);

    expect(second).toEqual(first);
    expect(await commitTouching(checkout, "note.md")).toEqual(["note.md"]);
  }, 60_000);

  it("stays answerable after the window has rolled past it", async () => {
    // A retry can arrive late. Forgetting a mutation because reads happened
    // since is indistinguishable, from the client's side, from never having
    // run it — and re-running is a second commit.
    const { checkout, connect } = await ownedCheckout({ answeredWindow: 3 });
    const connection = await connect();
    await connection.execute(checkout, { name: "initialize" });
    await writeFile(join(checkout, "first.md"), "first\n");

    const requestId = "req_longlived0001";
    await connection.executeWithId(requestId, checkout, { name: "commit" });

    for (const index of [1, 2, 3, 4, 5, 6]) {
      await connection.executeWithId(`req_reads000000${index}`, checkout, {
        name: "get-status",
      });
    }
    await writeFile(join(checkout, "second.md"), "second\n");
    await connection.executeWithId(requestId, checkout, { name: "commit" });

    expect(await commitTouching(checkout, "first.md")).toEqual(["first.md"]);
    expect(await commitTouching(checkout, "second.md")).toEqual([]);
  }, 60_000);

  it("refuses concurrent reuse for different work", async () => {
    const { checkout, connect } = await ownedCheckout();
    const connection = await connect();
    await connection.execute(checkout, { name: "initialize" });
    await writeFile(join(checkout, "note.md"), "note\n");

    // The second call reaches the client's in-flight ledger before the first
    // reply can arrive. It must still be bound to the operation and checkout;
    // otherwise a commit's void reply can masquerade as a successful push.
    const requestId = "req_concurrentmix1";
    const commit = connection.executeWithId(requestId, checkout, {
      name: "commit",
    });
    const mismatched = await connection
      .executeWithId(requestId, checkout, { name: "push" })
      .then(
        () => undefined,
        (error: unknown) => String(error),
      );

    expect(mismatched).toContain("already used");
    await commit;
  }, 60_000);

  it("refuses to answer for work it never did", async () => {
    const { checkout, connect } = await ownedCheckout();
    const connection = await connect();
    await connection.execute(checkout, { name: "initialize" });
    await writeFile(join(checkout, "note.md"), "note\n");

    const requestId = "req_reused000001";
    await connection.executeWithId(requestId, checkout, { name: "commit" });

    // A commit's answer is `undefined`, and so is a push's. Replaying one for
    // the other would report a push that never reached the remote.
    const mismatched = await connection
      .executeWithId(requestId, checkout, { name: "push" })
      .then(
        () => undefined,
        (error: unknown) => String(error),
      );

    expect(mismatched).toContain("already used");
  }, 60_000);

  it("refuses an id reused for different operation arguments", async () => {
    const { checkout, connect } = await ownedCheckout();
    const connection = await connect();
    await connection.execute(checkout, { name: "initialize" });
    await writeFile(join(checkout, "first.md"), "first\n");
    await writeFile(join(checkout, "second.md"), "second\n");
    await connection.execute(checkout, { name: "commit" });

    const requestId = "req_otherargument";
    await connection.executeWithId(requestId, checkout, {
      name: "show-file",
      sha: "HEAD",
      filePath: "first.md",
    });
    const mismatched = await connection
      .executeWithId(requestId, checkout, {
        name: "show-file",
        sha: "HEAD",
        filePath: "second.md",
      })
      .then(
        () => undefined,
        (error: unknown) => String(error),
      );

    expect(mismatched).toContain("already used");
  }, 60_000);

  it("refuses an id borrowed from another checkout", async () => {
    const { checkout, sibling, connect } = await ownedCheckout();
    const connection = await connect();
    await connection.execute(checkout, { name: "initialize" });
    await connection.execute(sibling, { name: "initialize" });

    // Both checkouts are registered with this owner, so the only thing that
    // can refuse the reuse is the id being bound to what it first ran.
    const requestId = "req_othercheckout";
    await connection.executeWithId(requestId, checkout, {
      name: "get-status",
    });

    const mismatched = await connection
      .executeWithId(requestId, sibling, { name: "get-status" })
      .then(
        () => undefined,
        (error: unknown) => String(error),
      );

    expect(mismatched).toContain("already used");
  }, 60_000);
});
