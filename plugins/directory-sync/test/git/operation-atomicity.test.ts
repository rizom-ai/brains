import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSilentLogger } from "@brains/test-utils";
import { GitSync } from "../../src/lib/git-sync";
import { pathExists } from "../../src/lib/fs-utils";

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

/** Files in the commit that introduced `path`. */
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

afterEach(async () => {
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe.skipIf(!LINUX)("git operation atomicity", () => {
  it.failing(
    "keeps one owner's commit free of another owner's work",
    async () => {
      scratch = await mkdtemp(join(tmpdir(), "operation-atomicity-"));
      const dataDir = join(scratch, "checkout");
      const base = {
        logger: createSilentLogger(),
        dataDir,
        branch: "main",
        authorName: "Test",
        authorEmail: "test@example.com",
      };

      // Web and worker each construct their own GitSync for one checkout,
      // exactly as the two process roles do today.
      const web = new GitSync(base);
      await web.initialize();
      const worker = new GitSync(base);

      // A one-shot pre-commit hook pauses the *first* commit between staging
      // and committing — the window a second owner can occupy. Bounded, and
      // one-shot, so operation-level ownership would simply serialize instead
      // of deadlocking. No production seam is involved: this is real Git.
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
    },
    120_000,
  );
});
