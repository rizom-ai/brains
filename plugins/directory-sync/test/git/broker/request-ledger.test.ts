import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSilentLogger } from "@brains/test-utils";
import { deferred } from "@brains/utils/deferred";
import type { CheckoutExecutorOptions } from "../../../src/lib/broker/checkout-executor";
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
  options: {
    answeredWindow?: number;
    afterOperation?: CheckoutExecutorOptions["afterOperation"];
  } = {},
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
            ...(options.afterOperation
              ? { afterOperation: options.afterOperation }
              : {}),
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
  it("joins a mutation across independent RPC clients before it settles", async () => {
    const entered = deferred();
    const release = deferred();
    let commits = 0;
    const { checkout, connect } = await ownedCheckout({
      afterOperation: async (operation): Promise<void> => {
        if (operation.name !== "commit") return;
        commits++;
        entered.resolve();
        await release.promise;
      },
    });
    const first = await connect();
    const second = await connect();
    const admitted: Promise<unknown>[] = [];
    try {
      await first.execute(checkout, { name: "initialize" });
      await writeFile(join(checkout, "note.md"), "note\n");
      const id = "req_independent_rpc";
      const a = first.executeWithId(id, checkout, { name: "commit" });
      const b = second.executeWithId(id, checkout, { name: "commit" });
      admitted.push(a, b);
      await entered.promise;
      await second.status();
      expect(commits).toBe(1);
      release.resolve();
      expect(await b).toEqual(await a);
      expect(commits).toBe(1);
    } finally {
      release.resolve();
      await Promise.allSettled(admitted);
      first.close();
      second.close();
    }
  }, 60_000);

  it("does not evict an admitted read when answered sibling reads roll over", async () => {
    const entered = deferred();
    const release = deferred();
    let held = false;
    let reads = 0;
    const { checkout, sibling, connect } = await ownedCheckout({
      answeredWindow: 1,
      afterOperation: async (operation): Promise<void> => {
        if (!held || operation.name !== "get-status") return;
        reads++;
        entered.resolve();
        await release.promise;
      },
    });
    const first = await connect();
    const second = await connect();
    const admitted: Promise<unknown>[] = [];
    try {
      await first.execute(checkout, { name: "initialize" });
      await first.execute(sibling, { name: "initialize" });
      held = true;
      const id = "req_held_read_rpc";
      const a = first.executeWithId(id, checkout, { name: "get-status" });
      admitted.push(a);
      await entered.promise;
      // A different operation is a read too, but does not use the held seam.
      for (let i = 0; i < 3; i++)
        await second.execute(sibling, { name: "has-local-changes" });
      const b = second.executeWithId(id, checkout, { name: "get-status" });
      admitted.push(b);
      await second.status();
      release.resolve();
      expect(await b).toEqual(await a);
      expect(reads).toBe(1);
    } finally {
      release.resolve();
      await Promise.allSettled(admitted);
      first.close();
      second.close();
    }
  }, 60_000);

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
