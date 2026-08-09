import { describe, expect, it } from "bun:test";
import {
  GitStallError,
  runGitCommandWithStallTimeout,
} from "../../src/lib/git-stall";

describe("runGitCommandWithStallTimeout", () => {
  it("returns stdout for a completing command", async () => {
    const stdout = await runGitCommandWithStallTimeout(
      { baseDir: process.cwd(), timeoutMs: 10_000 },
      ["version"],
    );
    expect(stdout).toContain("git version");
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
    // `git daemon` listens silently until killed, independent of stdin.
    const outcome = await runGitCommandWithStallTimeout(
      { baseDir: process.cwd(), timeoutMs: 150 },
      ["daemon", "--listen=127.0.0.1", "--port=0", "--base-path=."],
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
      ["daemon", "--listen=127.0.0.1", "--port=0", "--base-path=."],
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
