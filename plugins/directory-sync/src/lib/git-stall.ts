import { Effect, Fiber } from "@brains/utils/effect";
import type { Clock } from "@brains/utils/effect";
import type { GitCommandOptions, GitCommandRunner } from "./owned-git";

export interface OwnedGitChild {
  readonly pid: number;
  readonly exitCode: number | null;
  readonly stdout: ReadableStream<Uint8Array>;
  readonly stderr: ReadableStream<Uint8Array>;
  readonly exited: Promise<number>;
  /** Resolves only after the direct child and its process group are gone. */
  readonly reaped: Promise<number>;
  killProcessGroup(): void;
}

export type SpawnOwnedGitProcess = (
  baseDir: string,
  args: readonly string[],
) => OwnedGitChild;

/** Identifies the working directory and stall policy for an owned Git command. */
export interface GitProcessOptions {
  baseDir: string;
  timeoutMs: number;
  /** Injectable timing service for deterministic stall tests. */
  clock?: Clock.Clock | undefined;
  /** Credential-free progress signal; receives no command output. */
  onProgress?: (() => void) | undefined;
  /** Injectable child boundary for process-ownership tests. */
  spawn?: SpawnOwnedGitProcess | undefined;
}

/** Thrown when an owned Git operation produces no output for too long. */
export class GitStallError extends Error {
  constructor(stallMs: number) {
    super(`Git operation stalled: no output for ${stallMs}ms`);
    this.name = "GitStallError";
  }
}

/**
 * Runs every command through the same owned, abortable Bun subprocess boundary.
 * A caller-visible timeout or cancellation settles only after the subprocess
 * completion settles, so serialized checkout ownership is never released while
 * that process may still be alive.
 */
export class OwnedGitProcessRunner implements GitCommandRunner {
  private readonly processOptions: GitProcessOptions;
  private readonly lifecycleSignal: AbortSignal | undefined;

  constructor(
    processOptions: GitProcessOptions,
    lifecycleSignal?: AbortSignal,
  ) {
    this.processOptions = processOptions;
    this.lifecycleSignal = lifecycleSignal;
  }

  run(args: readonly string[], options?: GitCommandOptions): Promise<string> {
    const signals = [this.lifecycleSignal, options?.signal].filter(
      (signal): signal is AbortSignal => signal !== undefined,
    );
    const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];
    return runGitCommandWithStallTimeout(
      {
        ...this.processOptions,
        ...(options?.onProgress ? { onProgress: options.onProgress } : {}),
      },
      args,
      signal,
    );
  }
}

function processGroupExists(pid: number): boolean {
  if (process.platform === "win32") return false;
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function reapProcessGroup(pid: number): Promise<void> {
  if (!processGroupExists(pid)) return;
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    return;
  }
  while (processGroupExists(pid)) {
    await Bun.sleep(10);
  }
}

function spawnOwnedGitProcess(
  baseDir: string,
  args: readonly string[],
): OwnedGitChild {
  // Detached mode gives the command and any descendants one process group.
  // Automatic maintenance is disabled so Git cannot leave a pipe-owning
  // background process after the serialized checkout command exits.
  const child = Bun.spawn(["git", "-c", "maintenance.auto=false", ...args], {
    cwd: baseDir,
    stdout: "pipe",
    stderr: "pipe",
    detached: true,
  });

  return {
    pid: child.pid,
    get exitCode(): number | null {
      return child.exitCode;
    },
    stdout: child.stdout,
    stderr: child.stderr,
    exited: child.exited,
    reaped: child.exited.then(async (exitCode) => {
      await reapProcessGroup(child.pid);
      return exitCode;
    }),
    killProcessGroup(): void {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    },
  };
}

/** Run one Git command through Bun's owned subprocess API. */
export async function runGitCommandWithStallTimeout(
  processOptions: GitProcessOptions,
  args: readonly string[],
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();

  const { baseDir, timeoutMs } = processOptions;
  let timerFiber: Fiber.RuntimeFiber<void, never> | null = null;
  let onStall = (): void => {};
  let onAbort = (): void => {};
  let closed = false;
  let processExited = false;

  const child = (processOptions.spawn ?? spawnOwnedGitProcess)(baseDir, args);
  const cancelStallTimer = (): void => {
    if (!timerFiber) return;
    Effect.runSync(Fiber.interruptFork(timerFiber));
    timerFiber = null;
  };
  const armStall = (): void => {
    if (closed || processExited) return;
    cancelStallTimer();
    const delay = Effect.sleep(timeoutMs).pipe(
      Effect.andThen(Effect.sync(() => onStall())),
    );
    const ownedDelay = processOptions.clock
      ? Effect.withClock(delay, processOptions.clock)
      : delay;
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
    child.killProcessGroup();
  };
  const captureOutput = (
    stream: ReadableStream<Uint8Array>,
  ): {
    done: Promise<string>;
    closeAfterExit(): Promise<string>;
  } => {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let output = "";
    let doneReading = false;
    const readToEnd = async (): Promise<string> => {
      const chunk = await reader.read();
      if (chunk.done) return output + decoder.decode();
      armStall();
      processOptions.onProgress?.();
      output += decoder.decode(chunk.value, { stream: true });
      return readToEnd();
    };
    const done = readToEnd().finally(() => {
      doneReading = true;
      reader.releaseLock();
    });
    // The operation awaits this after process exit; observe earlier stream errors now.
    void done.catch(() => undefined);

    return {
      done,
      async closeAfterExit(): Promise<string> {
        // Detached Git maintenance can inherit these pipes after the Git
        // command itself exits. Keep final output, then stop waiting on it.
        if (!doneReading) {
          await Promise.race([done.then(() => undefined), Bun.sleep(25)]);
        }
        if (!doneReading) await reader.cancel();
        return done;
      },
    };
  };

  const stdoutCapture = captureOutput(child.stdout);
  const stderrCapture = captureOutput(child.stderr);
  const exited = child.exited.then(() => {
    processExited = true;
    cancelStallTimer();
  });
  void exited.catch(() => undefined);
  const operation = child.reaped.then(async (exitCode) => {
    processOptions.onProgress?.();
    const [stdout, stderr] = await Promise.all([
      stdoutCapture.closeAfterExit(),
      stderrCapture.closeAfterExit(),
    ]);
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
      if (processExited) return;
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
