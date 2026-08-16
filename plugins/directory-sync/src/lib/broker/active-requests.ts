/**
 * Which request holds the checkout, and which are waiting for it.
 *
 * Supervision terminates a broker whose oldest progress is too old. That is
 * only meaningful for the operation actually running: a request queued behind
 * a long clone has made no progress because it has not started, and counting
 * its wait as staleness kills a broker that is working perfectly. Waiting is
 * what a queue is for.
 */

interface Accepted {
  checkoutPath: string;
  queuedAt: number;
  /** Set when the request acquires the checkout turn, not when it arrives. */
  startedAt: number | undefined;
  progressAt: number | undefined;
}

export interface ActivitySnapshot {
  /** Requests holding a checkout turn right now. */
  activeRequestIds: string[];
  /** Accepted, waiting for a turn, and contributing no progress age. */
  queuedRequestIds: string[];
  /** Oldest progress among executing requests, or null when none is. */
  oldestActiveProgressAt: number | null;
}

export class ActiveRequests {
  readonly #accepted = new Map<string, Accepted>();

  accept(requestId: string, checkoutPath: string, at: number): void {
    this.#accepted.set(requestId, {
      checkoutPath,
      queuedAt: at,
      startedAt: undefined,
      progressAt: undefined,
    });
  }

  /** The request acquired the turn; from here its silence is meaningful. */
  start(requestId: string, at: number): void {
    const entry = this.#accepted.get(requestId);
    if (!entry) return;
    entry.startedAt = at;
    entry.progressAt = at;
  }

  progress(requestId: string, at: number): void {
    const entry = this.#accepted.get(requestId);
    if (entry?.startedAt === undefined) return;
    entry.progressAt = at;
  }

  finish(requestId: string): void {
    this.#accepted.delete(requestId);
  }

  snapshot(): ActivitySnapshot {
    const entries = [...this.#accepted.entries()];
    const executing = entries.filter(
      ([, entry]) => entry.progressAt !== undefined,
    );
    const progress = executing
      .map(([, entry]) => entry.progressAt)
      .filter((at): at is number => at !== undefined);

    return {
      activeRequestIds: executing.map(([requestId]) => requestId).sort(),
      queuedRequestIds: entries
        .filter(([, entry]) => entry.progressAt === undefined)
        .map(([requestId]) => requestId)
        .sort(),
      oldestActiveProgressAt: progress.length ? Math.min(...progress) : null,
    };
  }
}
