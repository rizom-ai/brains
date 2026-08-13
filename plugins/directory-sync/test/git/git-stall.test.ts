import { describe, expect, it } from "bun:test";
import {
  GitStallError,
  runGitCommandWithStallTimeout,
} from "../../src/lib/git-stall";
import type { OwnedGitChild } from "../../src/lib/git-stall";
import { SerialQueue } from "@brains/utils/serial-queue";

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let settle: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return {
    promise,
    resolve(value: T): void {
      if (!settle) throw new Error("Deferred promise is not initialized");
      settle(value);
    },
  };
}

function closedStream(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller): void {
      controller.close();
    },
  });
}

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

  it("kills and reaps an output-pipe descendant before returning", async () => {
    const stdout = await runGitCommandWithStallTimeout(
      { baseDir: process.cwd(), timeoutMs: 5_000 },
      ["-c", "alias.pipe-leak=!sh -c 'sleep 10 & printf \"$!\"'", "pipe-leak"],
    );
    const descendantPid = Number(stdout);
    let descendantExists = true;
    try {
      process.kill(descendantPid, 0);
    } catch {
      descendantExists = false;
    }

    expect(descendantPid).toBeGreaterThan(0);
    expect(descendantExists).toBe(false);
  });

  it("keeps the queue blocked until a killed child exits and its group is reaped", async () => {
    const exited = deferred<number>();
    const reaped = deferred<number>();
    const killed = deferred<void>();
    let exitCode: number | null = null;
    let killCount = 0;
    const child: OwnedGitChild = {
      pid: 123,
      get exitCode(): number | null {
        return exitCode;
      },
      stdout: closedStream(),
      stderr: closedStream(),
      exited: exited.promise.then((code) => {
        exitCode = code;
        return code;
      }),
      reaped: reaped.promise,
      killProcessGroup(): void {
        killCount++;
        killed.resolve();
      },
    };
    const queue = new SerialQueue();
    let firstSettled = false;
    let secondStarted = false;

    const first = queue
      .run(() =>
        runGitCommandWithStallTimeout(
          {
            baseDir: process.cwd(),
            timeoutMs: 5,
            spawn: () => child,
          },
          ["status"],
        ),
      )
      .then(
        () => {
          firstSettled = true;
          return undefined;
        },
        (error: unknown) => {
          firstSettled = true;
          return error;
        },
      );

    await killed.promise;
    const second = queue.run(async () => {
      secondStarted = true;
    });
    await Promise.resolve();

    expect(killCount).toBe(1);
    expect(firstSettled).toBe(false);
    expect(secondStarted).toBe(false);

    exited.resolve(137);
    await Promise.resolve();
    expect(firstSettled).toBe(false);
    expect(secondStarted).toBe(false);

    reaped.resolve(137);
    expect(await first).toBeInstanceOf(GitStallError);
    await second;
    expect(secondStarted).toBe(true);
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
