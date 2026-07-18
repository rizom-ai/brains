/** Serializes git operations so commit/push/pull tasks do not race. */
export class GitOperationLock {
  private queue: Promise<void> = Promise.resolve();

  run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();

    const previous = this.queue;
    let release = (): void => {};
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.queue = next;

    let admitted = false;
    const turn = previous.then(async () => {
      try {
        admitted = true;
        signal?.throwIfAborted();
        return await fn();
      } finally {
        release();
      }
    });
    return waitForTurn(turn, () => admitted, signal);
  }
}

function waitForTurn<T>(
  turn: Promise<T>,
  isAdmitted: () => boolean,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return turn;
  if (signal.aborted) return Promise.reject(signal.reason);

  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      if (!isAdmitted()) reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();

    void turn.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}
