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

/**
 * Coalesces concurrent callers onto one run of the work.
 *
 * The opposite of the queues above: they admit every call and run each one in
 * turn, while this admits the first and hands everyone else its result. Use it
 * where a second identical request must not become a second effect — creating
 * one invitation per idempotency key, recovering an interrupted delivery once.
 *
 * The slot is released once the work settles, so a later call starts fresh
 * rather than replaying a stale result. A rejection is reported to every
 * caller that joined, and also releases.
 */
export class SingleFlight<T> {
  private active: Promise<T> | undefined;

  public run(operation: () => Promise<T>): Promise<T> {
    if (this.active) return this.active;

    const current = operation().finally(() => {
      // Only the run that still owns the slot may clear it. Without this a
      // finishing call could evict a later one that has already taken over.
      if (this.active === current) this.active = undefined;
    });
    this.active = current;
    return current;
  }
}

/** {@link SingleFlight}, one flight per key. */
export class KeyedSingleFlight<T> {
  private readonly active = new Map<string, Promise<T>>();

  public run(key: string, operation: () => Promise<T>): Promise<T> {
    const existing = this.active.get(key);
    if (existing) return existing;

    const current = operation().finally(() => {
      if (this.active.get(key) === current) this.active.delete(key);
    });
    this.active.set(key, current);
    return current;
  }
}
