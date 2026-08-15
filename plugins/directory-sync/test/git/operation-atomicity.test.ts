import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSilentLogger } from "@brains/test-utils";
import { startTestBroker } from "./broker-git-sync";
import {
  commitTouching,
  installOneShotSlowPreCommit,
  untilExists,
} from "./real-git";

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

describe.skipIf(!LINUX)("git operation atomicity", () => {
  it("keeps one role's commit free of another role's work", async () => {
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

    // The hook pauses the first commit between staging and committing —
    // the window a second owner can occupy. No production seam is involved:
    // this is real Git.
    const started = await installOneShotSlowPreCommit(dataDir, scratch);

    await writeFile(join(dataDir, "web.md"), "web work\n");
    const webCommit = web.commit("web change");

    // The worker's file appears only once web is inside its commit, so
    // `add -A` cannot sweep it up unless the operations truly interleave.
    expect(await untilExists(started)).toBe(true);
    await writeFile(join(dataDir, "worker.md"), "worker work\n");
    const workerCommit = worker.commit("worker change");

    await Promise.allSettled([webCommit, workerCommit]);

    expect(await commitTouching(dataDir, "web.md")).toEqual(["web.md"]);
    expect(await commitTouching(dataDir, "worker.md")).toEqual(["worker.md"]);

    await web.cleanup();
    await worker.cleanup();
  }, 120_000);
});
