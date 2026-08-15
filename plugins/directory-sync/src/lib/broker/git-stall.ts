import { Effect, Fiber } from "@brains/utils/effect";
import type { Clock } from "@brains/utils/effect";

/** Identifies the baseDir + stall timeout for a network git operation. */
export interface GitNetwork {
  baseDir: string;
  timeoutMs: number;
  /** Injectable timing service for deterministic stall tests. */
  clock?: Clock.Clock | undefined;
  /** Credential-free progress signal; receives no command output. */
  onProgress?: (() => void) | undefined;
  /**
   * Git configuration supplied through the environment, which is where a
   * credential goes: not the remote URL, not argv, not `.git/config`.
   */
  credentialEnv?: Record<string, string> | undefined;
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
  let processExited = false;

  // Fetch/pull may detach maintenance while retaining this subprocess's pipes.
  // Disable it only for the owned network command; ordinary local Git commands
  // retain their normal automatic maintenance.
  const child = Bun.spawn(["git", "-c", "maintenance.auto=false", ...args], {
    cwd: baseDir,
    stdout: "pipe",
    stderr: "pipe",
    detached: true,
    ...(net.credentialEnv
      ? { env: { ...process.env, ...net.credentialEnv } }
      : {}),
  });
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
      net.onProgress?.();
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
  const operation = child.exited.then(async (exitCode) => {
    processExited = true;
    cancelStallTimer();
    net.onProgress?.();
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
