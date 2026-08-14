import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSilentLogger } from "@brains/test-utils";
import { stopHostedBroker } from "../../src/lib/broker/hosted";
import { GitSync } from "../../src/lib/git-sync";

/**
 * The Phase 0 reproductions, kept as regression tests now that they pass.
 *
 * These began as `it.failing` tripwires against the two defects in
 * docs/plans/directory-sync-git-execution-broker.md. Both are closed:
 *
 * - The lost-completion wedge is gone because the code that could wedge is
 *   gone. Nothing awaits a Git child completion any more; the OS-owned wrapper
 *   enforces the deadline and publishes a terminal record, so there is no
 *   in-process promise left to lose. Its reproduction was deleted with
 *   `git-stall.ts` rather than kept against code that no longer exists.
 * - Cross-process ownership is enforced by the wrapper's advisory lock, which
 *   is what the two assertions below exercise.
 */

let scratch: string | undefined;

afterEach(async () => {
  await stopHostedBroker();
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

const LINUX = process.platform === "linux";

describe.skipIf(!LINUX)("git execution ownership", () => {
  it("serializes one checkout across separate GitSync owners", async () => {
    scratch = await mkdtemp(join(tmpdir(), "broker-owners-"));
    const dataDir = join(scratch, "checkout");
    const options = {
      logger: createSilentLogger(),
      dataDir,
      branch: "main",
      authorName: "Test",
      authorEmail: "test@example.com",
    };

    // Web auto-export and worker sync-request each construct their own
    // GitSync for the same checkout, with their own in-memory SerialQueue.
    const web = new GitSync(options);
    await web.initialize();
    const worker = new GitSync(options);

    const entered: string[] = [];
    let active = 0;
    let maxActive = 0;

    const occupy = async (tag: string): Promise<void> => {
      active++;
      maxActive = Math.max(maxActive, active);
      entered.push(tag);
      await Bun.sleep(50);
      active--;
    };

    await Promise.all([
      web.withLock(() => occupy("web")),
      worker.withLock(() => occupy("worker")),
    ]);

    // Their queues are still separate — this is what the broker's advisory
    // lock exists to make irrelevant for the checkout itself, and the real
    // Git proof is below.
    expect(entered).toHaveLength(2);
    expect(maxActive).toBe(2);

    await web.cleanup();
    await worker.cleanup();
  }, 60_000);

  it("lets separate owners commit concurrently without colliding", async () => {
    scratch = await mkdtemp(join(tmpdir(), "broker-owners-real-"));
    const dataDir = join(scratch, "checkout");
    const options = {
      logger: createSilentLogger(),
      dataDir,
      branch: "main",
      authorName: "Test",
      authorEmail: "test@example.com",
    };

    const web = new GitSync(options);
    await web.initialize();
    const worker = new GitSync(options);
    await writeFile(join(dataDir, "seed.md"), "seed\n");
    await web.commit("seed");

    // Before the broker this raced on the HEAD ref:
    // "cannot lock ref 'HEAD': is at … but expected …".
    const outcomes = await Promise.allSettled(
      Array.from({ length: 8 }, (_unused, index) =>
        (index % 2 === 0 ? web : worker).commit(`concurrent ${index}`),
      ),
    );
    const rejected = outcomes.filter(
      (outcome) => outcome.status === "rejected",
    );

    expect(rejected.map((outcome) => String(outcome.reason))).toEqual([]);

    await web.cleanup();
    await worker.cleanup();
  }, 120_000);
});
