import { Effect, Fiber } from "@brains/utils/effect";
import type { Clock } from "@brains/utils/effect";

/** Identifies the baseDir + stall timeout for a network git operation. */
export interface GitNetwork {
  baseDir: string;
  timeoutMs: number;
  /** Injectable timing service for deterministic stall tests. */
  clock?: Clock.Clock | undefined;
}

/** Thrown when a git network operation produces no output for too long. */
export class GitStallError extends Error {
  constructor(stallMs: number) {
    super(`Git operation stalled: no output for ${stallMs}ms`);
    this.name = "GitStallError";
  }
}

/** Run a network Git command through Bun's owned subprocess API. */
export async function runGitCommandWithStallTimeout(
  net: GitNetwork,
  args: readonly string[],
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();

  const { baseDir, timeoutMs } = net;
  let timerFiber: Fiber.RuntimeFiber<void, never> | null = null;
  let onStall = (): void => {};
  let onAbort = (): void => {};
  let closed = false;

  const child = Bun.spawn(["git", ...args], {
    cwd: baseDir,
    stdout: "pipe",
    stderr: "pipe",
    detached: true,
  });
  const cancelStallTimer = (): void => {
    if (!timerFiber) return;
    Effect.runSync(Fiber.interruptFork(timerFiber));
    timerFiber = null;
  };
  const armStall = (): void => {
    if (closed) return;
    cancelStallTimer();
    const delay = Effect.sleep(timeoutMs).pipe(
      Effect.andThen(Effect.sync(() => onStall())),
    );
    const ownedDelay = net.clock ? Effect.withClock(delay, net.clock) : delay;
    timerFiber = Effect.runFork(ownedDelay);
  };
  const settleStallTimer = async (): Promise<void> => {
    const activeTimer = timerFiber;
    timerFiber = null;
    if (activeTimer) {
      await Effect.runPromise(Fiber.interrupt(activeTimer));
    }
  };
  const kill = (): void => {
    if (child.exitCode !== null) return;
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  };
  const readOutput = (stream: ReadableStream<Uint8Array>): Promise<string> =>
    new Response(
      stream.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller): void {
            armStall();
            controller.enqueue(chunk);
          },
        }),
      ),
    ).text();

  const operation = Promise.all([
    child.exited,
    readOutput(child.stdout),
    readOutput(child.stderr),
  ]).then(([exitCode, stdout, stderr]) => {
    if (exitCode !== 0) {
      // Remote URLs may embed credentials; keep them out of errors and logs.
      const redact = (text: string): string =>
        text.replace(/\/\/[^@/\s]+@/g, "//<redacted>@");
      const detail = redact(stderr.trim() || stdout.trim());
      throw new Error(
        `git ${args.map(redact).join(" ")} exited with ${exitCode}${detail ? `: ${detail}` : ""}`,
      );
    }
    return stdout;
  });
  const stalled = new Promise<never>((_resolve, reject) => {
    onStall = (): void => {
      const error = new GitStallError(timeoutMs);
      reject(error);
      kill();
    };
  });
  const cancelled = new Promise<never>((_resolve, reject) => {
    onAbort = (): void => {
      reject(signal?.reason);
      kill();
    };
  });
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) onAbort();

  armStall();
  try {
    return await Promise.race([operation, stalled, cancelled]);
  } finally {
    closed = true;
    signal?.removeEventListener("abort", onAbort);
    await settleStallTimer();
    await operation.catch(() => undefined);
  }
}
