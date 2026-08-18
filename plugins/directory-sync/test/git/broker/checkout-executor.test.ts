import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSilentLogger } from "@brains/test-utils";
import { pointOriginAt, stallingRemote } from "../real-git";
import { sha256Hex } from "@brains/utils/hash";
import { CheckoutOperationExecutor } from "../../../src/lib/broker/checkout-executor";

/**
 * Phase 2 of docs/plans/directory-sync-git-execution-broker.md.
 *
 * The executor is where ownership lives: one queue turn per semantic
 * operation, held for the complete sequence. The atomicity assertion here is
 * the same scenario `test/git/operation-atomicity.test.ts` uses to reproduce
 * the defect — same real Git, same forced interleaving — so it is a direct
 * before/after rather than a differently-shaped claim.
 */

const LINUX = process.platform === "linux";

let scratch: string | undefined;

async function git(args: string[], cwd: string): Promise<string> {
  const child = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(`git ${args.join(" ")}: ${err}`);
  return out;
}

async function commitTouching(
  checkout: string,
  path: string,
): Promise<string[]> {
  const sha = (
    await git(["log", "--format=%H", "-1", "--", path], checkout)
  ).trim();
  if (!sha) return [];
  return (await git(["show", "--name-only", "--format=", sha], checkout))
    .trim()
    .split("\n")
    .filter(Boolean)
    .sort();
}

function executorFor(dataDir: string): CheckoutOperationExecutor {
  return new CheckoutOperationExecutor({
    logger: createSilentLogger(),
    dataDir,
    branch: "main",
    remoteUrl: "",
    remoteFingerprint: sha256Hex(""),
    timeoutMs: 30_000,
    authorName: "Test",
    authorEmail: "test@example.com",
  });
}

afterEach(async () => {
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe.skipIf(!LINUX)("checkout operation executor", () => {
  it("runs the operations callers need", async () => {
    scratch = await mkdtemp(join(tmpdir(), "checkout-executor-"));
    const dataDir = join(scratch, "checkout");
    const executor = executorFor(dataDir);

    await executor.execute({ name: "initialize" });
    expect(await executor.execute({ name: "has-local-changes" })).toBe(false);

    await writeFile(join(dataDir, "note.md"), "hello\n");
    expect(await executor.execute({ name: "has-local-changes" })).toBe(true);

    await executor.execute({ name: "commit", message: "add note" });
    const status = await executor.execute({ name: "get-status" });
    expect(status.branch).toBe("main");
    expect(status.hasChanges).toBe(false);

    const log = await executor.execute({
      name: "log-file",
      filePath: "note.md",
    });
    expect(log).toHaveLength(1);
    expect(
      await executor.execute({
        name: "show-file",
        sha: log[0]?.sha ?? "",
        filePath: "note.md",
      }),
    ).toBe("hello\n");

    const checkpoint = await executor.execute({ name: "get-checkpoint" });
    expect(checkpoint.branch).toBe("main");
    expect(checkpoint.lastReconciledGitHead).toHaveLength(40);

    const delta = await executor.execute({
      name: "get-reconciliation-delta",
      checkpoint,
    });
    expect(delta.mode).toBe("incremental");
  }, 60_000);

  it("runs no caller's work inside another caller's turn", async () => {
    scratch = await mkdtemp(join(tmpdir(), "checkout-executor-atomic-"));
    const dataDir = join(scratch, "checkout");
    // One executor is the owner. Two callers reach it, as web and worker will
    // through the broker socket.
    const executor = executorFor(dataDir);
    await executor.execute({ name: "initialize" });

    // The turn is held by a network operation waiting on a remote that
    // never answers. It used to be held from inside a commit by a slow
    // `pre-commit` hook — the window where `add -A` swept up the other
    // caller's file — but managed operations no longer run hooks, so that
    // window is unreachable now rather than merely unobserved.
    const remote = stallingRemote();
    await pointOriginAt(dataDir, remote.gitUrl);
    const held = executor.execute({ name: "pull" }).catch(() => undefined);
    await Bun.sleep(300);

    await writeFile(join(dataDir, "worker.md"), "worker work\n");
    const queued = executor.execute({
      name: "commit",
      message: "worker change",
    });
    await Bun.sleep(300);

    // Nothing of the second caller's has run while the first holds the turn.
    expect(await commitTouching(dataDir, "worker.md")).toEqual([]);

    remote.release();
    await held;
    await queued;

    expect(await commitTouching(dataDir, "worker.md")).toEqual(["worker.md"]);
  }, 120_000);

  it("lets a failed operation release the turn", async () => {
    scratch = await mkdtemp(join(tmpdir(), "checkout-executor-failure-"));
    const dataDir = join(scratch, "checkout");
    const executor = executorFor(dataDir);
    await executor.execute({ name: "initialize" });

    const failed = await executor
      .execute({ name: "show-file", sha: "deadbeef", filePath: "missing.md" })
      .then(
        () => undefined,
        (error: unknown) => error,
      );

    // A held turn after a failure would wedge the checkout as surely as a lost
    // completion, so the queue must still accept work.
    expect(failed).toBeDefined();
    expect(await executor.execute({ name: "has-local-changes" })).toBe(false);
  }, 60_000);
});
