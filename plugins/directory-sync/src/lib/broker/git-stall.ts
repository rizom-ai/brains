import { readdir, readFile } from "fs/promises";
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

/**
 * How much of a command's output is kept.
 *
 * Output is diagnostic; a bounded tail of it answers every question the
 * broker asks of it, and an unbounded one is a way for a misbehaving
 * command to exhaust the owner.
 */
const MAX_RETAINED_OUTPUT = 256 * 1024;

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
    // Deliberately not detached. A detached child leads a process group of its
    // own, which is invisible to the supervisor probing the broker group — it
    // would see ESRCH, call the checkout unowned, and start a replacement
    // beside a push still writing to it. Staying in the broker group is what
    // makes "every Git descendant is gone" provable.
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
  /**
   * Kill this child and anything it started.
   *
   * Signalling the group is not available here: the group is the broker
   * group, and signalling that would take the broker down with it. But Git
   * forks — a daemon runs its listener in a child, transports run in helpers
   * — so killing only the direct child leaves work alive that nobody is
   * watching.
   */
  const kill = (): void => {
    if (child.exitCode !== null) return;
    // The direct child dies now, synchronously. Sweeping its descendants
    // needs procfs and therefore a turn of the event loop, and a process
    // that exits in the meantime would leave the command itself running —
    // which is how a stalled `git daemon` survived the test that killed it.
    const root = child.pid;
    try {
      process.kill(root, "SIGKILL");
    } catch {
      // Already gone, which is the outcome being asked for.
    }
    void killSubtree(root);
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
      // Retained while reading, so the ceiling has to apply while reading:
      // a command that writes without end would otherwise be held whole in
      // the one process that must stay alive to own the checkout.
      if (output.length > MAX_RETAINED_OUTPUT) {
        output = `${output.slice(0, MAX_RETAINED_OUTPUT)}\n[output truncated at ${MAX_RETAINED_OUTPUT} characters]`;
        kill();
        return output;
      }
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

/** Every transitive child of `pid`, read from procfs. */
async function descendantsOf(pid: number): Promise<number[]> {
  const parents = new Map<number, number>();
  const entries = await readdir("/proc").catch(() => []);
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    const stat = await readFile(`/proc/${entry}/stat`, "utf-8").catch(
      () => undefined,
    );
    if (!stat) continue;
    // The command may contain spaces and parentheses, so fields are counted
    // from the closing paren; ppid is the second of them.
    const ppid = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
    if (Number.isFinite(ppid)) parents.set(Number(entry), ppid);
  }

  const found: number[] = [];
  const collect = (parent: number): void => {
    for (const [candidate, ppid] of parents) {
      if (ppid !== parent || found.includes(candidate)) continue;
      found.push(candidate);
      collect(candidate);
    }
  };
  collect(pid);
  return found;
}

async function killSubtree(pid: number): Promise<void> {
  // The root is already being killed; this is for whatever it started.
  // Reparenting means some of it may no longer be traceable, which is why
  // the broker's process group is the backstop rather than this sweep.
  const descendants = await descendantsOf(pid);
  for (const target of descendants) {
    try {
      process.kill(target, "SIGKILL");
    } catch {
      // Already gone, which is the outcome being asked for.
    }
  }
}
