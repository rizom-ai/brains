import type {
  ProgressCallback,
  ProgressNotification,
  ProgressReporter,
} from "@brains/utils/progress";

/** A deadline that a job's progress can push back. */
export interface RenewableDeadline {
  /** Resolves once the deadline passes without a renewal. */
  readonly expired: Promise<{ kind: "timeout" }>;
  /** Start the full window again from now; no effect once expired. */
  renew(): void;
  cancel(): void;
}

export function createRenewableDeadline(timeoutMs: number): RenewableDeadline {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expire: () => void = () => undefined;
  let done = false;
  const expired = new Promise<{ kind: "timeout" }>((resolve) => {
    expire = (): void => {
      done = true;
      resolve({ kind: "timeout" });
    };
  });
  const arm = (): void => {
    if (done) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(expire, Math.max(1, timeoutMs));
  };
  arm();
  return {
    expired,
    renew: arm,
    cancel: (): void => {
      done = true;
      if (timer) clearTimeout(timer);
    },
  };
}

/**
 * Wrap a job's reporter so each report that advances the job renews its
 * deadline. A report identical to the one before it is not progress — a
 * timer repeating the same notification would otherwise keep a stuck job
 * alive — and neither is a heartbeat the reporter sends on its own.
 */
export function renewOnAdvance(
  reporter: ProgressReporter,
  renew: () => void,
): ProgressReporter {
  let last: string | undefined;
  const observe = (notification: ProgressNotification): void => {
    const key = JSON.stringify([
      notification.progress,
      notification.total,
      notification.message,
    ]);
    if (key === last) return;
    last = key;
    renew();
  };
  const wrap = (inner: ProgressReporter): ProgressReporter => ({
    createSub: (options) => wrap(inner.createSub(options)),
    report: async (notification): Promise<void> => {
      observe(notification);
      await inner.report(notification);
    },
    startHeartbeat: (message, intervalMs) =>
      inner.startHeartbeat(message, intervalMs),
    stopHeartbeat: () => inner.stopHeartbeat(),
    toCallback: (): ProgressCallback => {
      const callback = inner.toCallback();
      return async (notification): Promise<void> => {
        observe(notification);
        await callback(notification);
      };
    },
  });
  return wrap(reporter);
}
