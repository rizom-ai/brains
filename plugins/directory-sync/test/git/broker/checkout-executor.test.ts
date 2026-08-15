import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSilentLogger } from "@brains/test-utils";
import { sha256Hex } from "@brains/utils/hash";
import { CheckoutOperationExecutor } from "../../../src/lib/broker/checkout-executor";
import { pathExists } from "../../../src/lib/fs-utils";

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

async function untilExists(path: string, budgetMs = 10_000): Promise<boolean> {
  const deadline = Date.now() + budgetMs;
  const poll = async (): Promise<boolean> => {
    if (await pathExists(path)) return true;
    if (Date.now() >= deadline) return false;
    await Bun.sleep(10);
    return poll();
  };
  return poll();
}

function executorFor(dataDir: string): CheckoutOperationExecutor {
  return new CheckoutOperationExecutor({
    logger: createSilentLogger(),
    dataDir,
    branch: "main",
    remoteUrl: "",
    authenticatedUrl: "",
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

  it("keeps one caller's commit free of another caller's work", async () => {
    scratch = await mkdtemp(join(tmpdir(), "checkout-executor-atomic-"));
    const dataDir = join(scratch, "checkout");
    // One executor is the owner. Two callers reach it, as web and worker will
    // through the broker socket.
    const executor = executorFor(dataDir);
    await executor.execute({ name: "initialize" });

    const hooks = join(scratch, "hooks");
    const started = join(scratch, "hook-started");
    await mkdir(hooks, { recursive: true });
    await writeFile(
      join(hooks, "pre-commit"),
      [
        "#!/bin/sh",
        `if [ ! -e "${started}" ]; then`,
        `  touch "${started}"`,
        "  sleep 1.5",
        "fi",
        "exit 0",
      ].join("\n"),
      { mode: 0o755 },
    );
    await git(["config", "core.hooksPath", hooks], dataDir);

    await writeFile(join(dataDir, "web.md"), "web work\n");
    const first = executor.execute({ name: "commit", message: "web change" });

    // The second caller's file lands while the first is inside its commit —
    // the window that previously let `add -A` sweep it up.
    expect(await untilExists(started)).toBe(true);
    await writeFile(join(dataDir, "worker.md"), "worker work\n");
    const second = executor.execute({
      name: "commit",
      message: "worker change",
    });

    await Promise.all([first, second]);

    expect(await commitTouching(dataDir, "web.md")).toEqual(["web.md"]);
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
