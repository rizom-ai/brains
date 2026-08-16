import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathExists } from "../../src/lib/fs-utils";

/**
 * Helpers for tests that assert against real Git rather than a seam.
 *
 * Two tests need the same window — one owner paused between staging and
 * committing while another owner tries to work — so the shape lives here
 * rather than being copied: `operation-atomicity.test.ts` uses it across two
 * `GitSync` instances (still failing, the broker's job) and
 * `git-lock.test.ts` uses it within one (fixed by serializing operations).
 */

export async function runGit(args: string[], cwd: string): Promise<string> {
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
export async function commitTouching(
  checkout: string,
  path: string,
): Promise<string[]> {
  const sha = (
    await runGit(["log", "--format=%H", "-1", "--", path], checkout)
  ).trim();
  if (!sha) return [];
  return (await runGit(["show", "--name-only", "--format=", sha], checkout))
    .trim()
    .split("\n")
    .filter(Boolean)
    .sort();
}

export async function untilExists(
  path: string,
  budgetMs = 10_000,
): Promise<boolean> {
  const deadline = Date.now() + budgetMs;
  const poll = async (): Promise<boolean> => {
    if (await pathExists(path)) return true;
    if (Date.now() >= deadline) return false;
    await Bun.sleep(10);
    return poll();
  };
  return poll();
}

/**
 * Pause the *first* commit in a checkout between staging and committing.
 *
 * Bounded and one-shot, so operation-level ownership serializes rather than
 * deadlocking. Returns the marker the hook touches on entry.
 */
export async function installOneShotSlowPreCommit(
  checkout: string,
  scratch: string,
  sleepSeconds = 1.5,
): Promise<string> {
  const hooks = join(scratch, "hooks");
  const started = join(scratch, "hook-started");
  await mkdir(hooks, { recursive: true });
  await writeFile(
    join(hooks, "pre-commit"),
    [
      "#!/bin/sh",
      `if [ ! -e "${started}" ]; then`,
      `  touch "${started}"`,
      `  sleep ${sleepSeconds}`,
      "fi",
      "exit 0",
    ].join("\n"),
    { mode: 0o755 },
  );
  await runGit(["config", "core.hooksPath", hooks], checkout);
  return started;
}

/**
 * A remote that accepts the connection and then says nothing.
 *
 * Holding a checkout turn used to be staged with a slow `pre-commit` hook, but
 * managed operations no longer run hooks — so the turn is held the way
 * production actually can hold one: a network operation waiting on a remote
 * that never answers. `release()` closes the connection, which lets Git fail
 * and the turn finish.
 */
export function stallingRemote(): {
  gitUrl: string;
  release(): void;
} {
  const server = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: { data: (): void => {}, open: (): void => {} },
  });
  return {
    gitUrl: `git://127.0.0.1:${server.port}/repo.git`,
    release: (): void => {
      server.stop(true);
    },
  };
}

/** Point an initialized checkout at a remote, without going through Git sync. */
export async function pointOriginAt(
  checkout: string,
  gitUrl: string,
): Promise<void> {
  const existing = await runGit(["remote"], checkout);
  await runGit(
    existing.includes("origin")
      ? ["remote", "set-url", "origin", gitUrl]
      : ["remote", "add", "origin", gitUrl],
    checkout,
  );
}
