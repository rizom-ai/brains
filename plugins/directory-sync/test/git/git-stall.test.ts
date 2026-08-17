import { describe, expect, it } from "bun:test";
import {
  GitStallError,
  runGitCommandWithStallTimeout,
} from "../../src/lib/broker/git-stall";

/**
 * A git invocation that produces no output until it is killed.
 *
 * These two tests need nothing more than that: one asserts the stall
 * timeout fires, the other that an abort reason propagates. They used to run
 * `git daemon`, which serves the purpose but binds a port to do it — and
 * ignores the `--port=0` they asked for, taking the fixed 9418 instead. Two
 * checkouts on one machine therefore could not run this file at the same
 * time, and the loser failed with `Address already in use` far from anything
 * it was testing.
 *
 * An alias that sleeps is silent in the same way and contends with nothing.
 * The first test in this file already drives git through an alias.
 */
const SILENT_CHILD = ["-c", "alias.stall=!sleep 30", "stall"];

describe("runGitCommandWithStallTimeout", () => {
  it("returns stdout for a completing command", async () => {
    const stdout = await runGitCommandWithStallTimeout(
      { baseDir: process.cwd(), timeoutMs: 10_000 },
      ["version"],
    );
    expect(stdout).toContain("git version");
  });

  it("signals progress on output and successful subprocess completion", async () => {
    let progressSignals = 0;
    await runGitCommandWithStallTimeout(
      {
        baseDir: process.cwd(),
        timeoutMs: 10_000,
        onProgress: () => progressSignals++,
      },
      ["version"],
    );
    expect(progressSignals).toBeGreaterThanOrEqual(2);
  });

  it("disables automatic maintenance in the owned Git subprocess", async () => {
    const stdout = await runGitCommandWithStallTimeout(
      { baseDir: process.cwd(), timeoutMs: 10_000 },
      ["config", "--get", "maintenance.auto"],
    );
    expect(stdout.trim()).toBe("false");
  });

  it("does not wait for a descendant that retains the completed command's output pipe", async () => {
    const startedAt = performance.now();
    const stdout = await runGitCommandWithStallTimeout(
      { baseDir: process.cwd(), timeoutMs: 5_000 },
      ["-c", "alias.pipe-leak=!sh -c '(sleep 1) & printf done'", "pipe-leak"],
    );

    const elapsedMs = performance.now() - startedAt;
    // Let the fixture descendant exit even when the assertion fails.
    await Bun.sleep(Math.max(0, 1_100 - elapsedMs));
    expect(stdout).toBe("done");
    expect(elapsedMs).toBeLessThan(500);
  });

  it("kills a silent child and throws GitStallError", async () => {
    const outcome = await runGitCommandWithStallTimeout(
      { baseDir: process.cwd(), timeoutMs: 150 },
      SILENT_CHILD,
    ).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(outcome).toBeInstanceOf(GitStallError);
  });

  it("kills the child and rejects with the abort reason", async () => {
    const controller = new AbortController();
    const reason = new Error("caller cancelled");
    const outcome = runGitCommandWithStallTimeout(
      { baseDir: process.cwd(), timeoutMs: 10_000 },
      SILENT_CHILD,
      controller.signal,
    ).then(
      () => undefined,
      (error: unknown) => error,
    );
    controller.abort(reason);
    expect(await outcome).toBe(reason);
  });

  it("redacts embedded credentials from failure messages", async () => {
    const outcome = await runGitCommandWithStallTimeout(
      { baseDir: process.cwd(), timeoutMs: 10_000 },
      ["ls-remote", "https://x-access-token:secret123@127.0.0.1:1/repo.git"],
    ).then(
      () => undefined,
      (error: unknown) => String(error),
    );
    expect(outcome).toContain("//<redacted>@");
    expect(outcome).not.toContain("secret123");
  });

  it("surfaces the exit code and stderr of a failing command", async () => {
    const outcome = await runGitCommandWithStallTimeout(
      { baseDir: process.cwd(), timeoutMs: 10_000 },
      ["rev-parse", "--verify", "definitely-missing-ref"],
    ).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(String(outcome)).toContain("exited with");
  });
});
