import type { Logger } from "@brains/utils/logger";

/** The timers a supervised daemon waits on; tests pass a manual clock. */
export interface DaemonTimers {
  /** Run `callback` after `delayMs`; the returned function cancels it. */
  schedule(callback: () => void, delayMs: number): () => void;
}

const liveDaemonTimers: DaemonTimers = {
  schedule(callback, delayMs) {
    const timer = setTimeout(callback, delayMs);
    return (): void => clearTimeout(timer);
  },
};

/** What the runtime gives a daemon it supervises: a log and, in tests, a clock. */
export interface DaemonSupervision {
  readonly logger: Pick<Logger, "error">;
  readonly timers?: DaemonTimers | undefined;
  /** Jitter source in [0, 1). Defaults to `Math.random`. */
  readonly random?: (() => number) | undefined;
}

const DAEMON_RESTART_FIRST_DELAY_MS = 1_000;
const DAEMON_RESTART_MAX_DELAY_MS = 300_000;
/** The largest share of a wait that jitter takes off, so restarts spread out. */
const DAEMON_RESTART_JITTER = 0.2;

export function daemonTimers(supervision: DaemonSupervision): DaemonTimers {
  return supervision.timers ?? liveDaemonTimers;
}

/**
 * The wait before each restart of a daemon that keeps failing: a second,
 * doubling to five minutes, less up to a fifth in jitter. Readiness resets it.
 */
export interface RestartBackoff {
  next(): number;
  reset(): void;
}

export function createRestartBackoff(
  random: () => number = Math.random,
): RestartBackoff {
  let failures = 0;
  return {
    next(): number {
      const base = Math.min(
        DAEMON_RESTART_FIRST_DELAY_MS * 2 ** failures,
        DAEMON_RESTART_MAX_DELAY_MS,
      );
      failures++;
      return Math.round(base * (1 - DAEMON_RESTART_JITTER * random()));
    },
    reset(): void {
      failures = 0;
    },
  };
}

/** Settle with `promise`, or reject with `message` once `timeoutMs` passes. */
export function withDaemonTimeout<T>(
  promise: Promise<T>,
  timers: DaemonTimers,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let cancel: (() => void) | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    cancel = timers.schedule(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, expired]).finally(() => cancel?.());
}
