import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSilentLogger } from "@brains/test-utils";
import { startTestBroker } from "./broker-git-sync";
import { commitTouching, pointOriginAt, stallingRemote } from "./real-git";
import type { GitBrokerServer } from "../../src/lib/broker/server";

/**
 * Phase 0 evidence for docs/plans/directory-sync-git-execution-broker.md.
 *
 * A Git operation is more than one command: a commit is `status`, `add -A`,
 * marker checks, `commit`. Ownership that serializes commands rather than
 * operations lets a second owner run inside the first owner's operation,
 * where `add -A` stages the whole working tree — including the other owner's
 * files.
 *
 * The plan requires this reproduction to assert operation atomicity rather
 * than the absence of errors, because an earlier version asserted only that
 * concurrent commits produced no rejection and passed while the operations
 * interleaved.
 *
 * It failed for as long as web and worker each executed Git themselves. It
 * passes now because both reach one owner, which holds a queue turn for the
 * whole commit — not because the commands got faster or safer.
 */

const LINUX = process.platform === "linux";

let scratch: string | undefined;

afterEach(async () => {
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

/** Wait until the owner reports a turn actually being held. */
async function untilHolding(server: GitBrokerServer): Promise<void> {
  const deadline = Date.now() + 20_000;
  const poll = async (): Promise<void> => {
    if (server.activity.activeRequestIds.length > 0) return;
    if (Date.now() >= deadline) throw new Error("nothing took the turn");
    await Bun.sleep(50);
    return poll();
  };
  return poll();
}
describe.skipIf(!LINUX)("git operation atomicity", () => {
  it("runs no role's work inside another role's turn", async () => {
    scratch = await mkdtemp(join(tmpdir(), "operation-atomicity-"));
    const dataDir = join(scratch, "checkout");
    const base = {
      logger: createSilentLogger(),
      dataDir,
      branch: "main",
      authorName: "Test",
      authorEmail: "test@example.com",
    };

    // Two clients of one owner, exactly as the two process roles are.
    const broker = await startTestBroker(base);
    const web = await broker.connect();
    await web.initialize();
    const worker = await broker.connect();

    // Web takes the turn and keeps it: a network operation against a remote
    // that never answers. This used to be staged with a slow `pre-commit`
    // hook, which held the turn from inside a commit — the precise window
    // where `add -A` swept up another role's file. Managed operations no
    // longer run hooks, so that window is now unreachable rather than merely
    // unobserved, and what remains to prove is that nothing runs inside
    // someone else's turn at all.
    const remote = stallingRemote();
    await pointOriginAt(dataDir, remote.gitUrl);
    const held = web.pull().catch(() => undefined);
    await untilHolding(broker.server);

    await writeFile(join(dataDir, "worker.md"), "worker work\n");
    const workerCommit = worker.commit("worker change");
    await Bun.sleep(300);

    // Still nothing committed: the worker is queued, not running.
    expect(await commitTouching(dataDir, "worker.md")).toEqual([]);

    remote.release();
    await held;
    await workerCommit;

    // And when it does run, it commits its own work and only its own.
    expect(await commitTouching(dataDir, "worker.md")).toEqual(["worker.md"]);

    await web.cleanup();
    await worker.cleanup();
  }, 120_000);
});
