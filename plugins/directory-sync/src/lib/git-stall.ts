import { Effect, Fiber } from "@brains/utils/effect";
import type { Clock } from "@brains/utils/effect";
import type { SimpleGit } from "simple-git";
import simpleGit from "simple-git";

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

/**
 * Run one network git operation on a throwaway simple-git instance.
 *
 * The output-sensitive stall delay resets on every chunk. Caller cancellation
 * and no-output stalls both abort simple-git, while retaining distinct error
 * identity at the Promise boundary.
 */
export async function runGitWithStallTimeout<T>(
  net: GitNetwork,
  run: (git: SimpleGit) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  signal?.throwIfAborted();

  const { baseDir, timeoutMs } = net;
  const controller = new AbortController();
  let timerFiber: Fiber.RuntimeFiber<void, never> | null = null;
  let onStall = (): void => {};
  let onAbort = (): void => {};
  let closed = false;

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

  const git = simpleGit(baseDir, {
    abort: controller.signal,
    timeout: { block: timeoutMs },
  }).outputHandler((_command, stdout, stderr) => {
    stdout.on("data", armStall);
    stderr.on("data", armStall);
  });

  const stalled = new Promise<never>((_resolve, reject) => {
    onStall = (): void => {
      const error = new GitStallError(timeoutMs);
      reject(error);
      controller.abort(error);
    };
  });
  const cancelled = new Promise<never>((_resolve, reject) => {
    onAbort = (): void => {
      const reason = signal?.reason;
      reject(reason);
      controller.abort(reason);
    };
  });
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) onAbort();

  armStall();
  try {
    return await Promise.race([run(git), stalled, cancelled]);
  } finally {
    closed = true;
    signal?.removeEventListener("abort", onAbort);
    await settleStallTimer();
  }
}
