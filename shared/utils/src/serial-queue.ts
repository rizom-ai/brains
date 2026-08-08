/**
 * Serialization primitives for async critical sections.
 *
 * Both queues admit operations strictly in submission order, one at a time,
 * and keep serving after a rejected operation.
 */

/** Runs async operations one at a time in submission order. */
export class SerialQueue {
  private tail: Promise<void> = Promise.resolve();

  /**
   * Run `operation` after every previously submitted operation has settled.
   *
   * With a `signal`: aborting before the operation is admitted rejects with
   * the abort reason and the queued slot self-cancels when its turn arrives;
   * aborting after admission has no effect.
   */
  public run<T>(
    operation: () => Promise<T> | T,
    signal?: AbortSignal,
  ): Promise<T> {
    if (signal?.aborted) return Promise.reject(signal.reason);

    const previous = this.tail;
    let release = (): void => {};
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });

    let admitted = false;
    const turn = previous.then(async () => {
      try {
        admitted = true;
        signal?.throwIfAborted();
        return await operation();
      } finally {
        release();
      }
    });
    return waitForTurn(turn, () => admitted, signal);
  }

  /** Resolves once every operation submitted so far has settled. */
  public async idle(): Promise<void> {
    await this.tail;
  }
}

/**
 * Independent serial queues keyed by string, created on first use and
 * discarded once a key's last operation settles.
 */
export class KeyedSerialQueue {
  private readonly tails = new Map<string, Promise<void>>();

  /** Run `operation` after every prior operation submitted for `key`. */
  public async run<T>(
    key: string,
    operation: () => Promise<T> | T,
  ): Promise<T> {
    const previous = this.tails.get(key);
    let release = (): void => {};
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.tails.set(key, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.tails.get(key) === current) {
        this.tails.delete(key);
      }
    }
  }
}

function waitForTurn<T>(
  turn: Promise<T>,
  isAdmitted: () => boolean,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return turn;

  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      if (!isAdmitted()) reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });

    void turn.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}
