import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSilentLogger } from "@brains/test-utils";
import { GitSync } from "../../src/lib/git-sync";
import {
  commitTouching,
  installOneShotSlowPreCommit,
  untilExists,
} from "./real-git";

/**
 * `GitSync` holds a turn for every operation it runs, not only the ones a
 * caller remembered to wrap.
 *
 * This file used to assert serialization by handing the mock its own
 * `withLock`, so it measured the test's lock rather than the implementation's
 * — and the implementation had none, because the lease was opt-in and only
 * composite callers took it. The lease is gone (see
 * `src/lib/broker/operations.ts`); serialization is now a property of the
 * operations themselves, so it is asserted against real Git.
 *
 * Ownership *across* processes is the broker's job and stays failing in
 * `operation-atomicity.test.ts`.
 */

const LINUX = process.platform === "linux";

let scratch: string | undefined;

afterEach(async () => {
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe.skipIf(!LINUX)("git operation serialization", () => {
  it("keeps one caller's commit free of another caller's work", async () => {
    scratch = await mkdtemp(join(tmpdir(), "git-serialization-"));
    const dataDir = join(scratch, "checkout");
    const git = new GitSync({
      logger: createSilentLogger(),
      dataDir,
      branch: "main",
      authorName: "Test",
      authorEmail: "test@example.com",
    });

    await git.initialize();
    const started = await installOneShotSlowPreCommit(dataDir, scratch);

    await writeFile(join(dataDir, "first.md"), "first\n");
    const first = git.commit("first change");

    // The second file appears only once the first commit is past staging,
    // so `add -A` can only sweep it up if the operations interleave.
    expect(await untilExists(started)).toBe(true);
    await writeFile(join(dataDir, "second.md"), "second\n");
    const second = git.commit("second change");

    // Settled, not all: without a turn per operation the second commit dies
    // on Git's index lock, and the assertions below are what should say so —
    // a rejection here would hide whether the commits were isolated.
    await Promise.allSettled([first, second]);

    expect(await commitTouching(dataDir, "first.md")).toEqual(["first.md"]);
    expect(await commitTouching(dataDir, "second.md")).toEqual(["second.md"]);

    await git.cleanup();
  }, 120_000);
});
