import { randomUUID } from "node:crypto";

/** What a sync client is told changed since its cursor. */
export type ChangesAnswer =
  | { cursor: string; types: string[] }
  /** The cursor is from another run or too old: compare everything. */
  | { cursor: string; reset: true };

/** How many changes the feed keeps for an asker to catch up on. */
const DEFAULT_KEEP = 500;

/**
 * Which entity types changed, in order, for sync clients that ask "what
 * changed since my cursor?". It lives with the process: a cursor from
 * another run, or from before what is still kept, cannot be placed, and its
 * asker is told to compare everything. Only type names are kept, which a
 * sync client sees as the drive's folders anyway.
 */
export class ChangeFeed {
  /** Told apart from every other run's cursors. */
  private readonly run = randomUUID().slice(0, 8);
  private readonly keep: number;
  private sequence = 0;
  private recent: { sequence: number; type: string }[] = [];
  private waiting = new Set<() => void>();
  private closed = false;

  constructor(options: { keep?: number } = {}) {
    this.keep = options.keep ?? DEFAULT_KEEP;
  }

  /** The cursor after everything recorded so far. */
  cursor(): string {
    return `${this.run}:${this.sequence}`;
  }

  /** An entity of a type was created, changed, renamed or deleted. */
  record(type: string): void {
    this.sequence += 1;
    this.recent = [
      ...this.recent.slice(-(this.keep - 1)),
      { sequence: this.sequence, type },
    ];
    const waiting = [...this.waiting];
    this.waiting.clear();
    for (const wake of waiting) wake();
  }

  /**
   * The brain is stopping: every waiting asker is answered now, and none is
   * held from here on, so no held request keeps the brain from stopping.
   */
  close(): void {
    this.closed = true;
    const waiting = [...this.waiting];
    this.waiting.clear();
    for (const wake of waiting) wake();
  }

  /** The types changed since a cursor, each once, in the order they first changed. */
  since(cursor: string | null): ChangesAnswer {
    if (cursor === null) return { cursor: this.cursor(), types: [] };
    const [run, at] = cursor.split(":");
    const from = Number(at);
    const oldest = this.recent[0]?.sequence ?? this.sequence + 1;
    if (
      run !== this.run ||
      !Number.isInteger(from) ||
      from > this.sequence ||
      from < oldest - 1
    ) {
      return { cursor: this.cursor(), reset: true };
    }
    return {
      cursor: this.cursor(),
      types: [
        ...new Set(
          this.recent
            .filter((change) => change.sequence > from)
            .map((change) => change.type),
        ),
      ],
    };
  }

  /**
   * The answer for a cursor, as soon as there is something to tell, or after
   * the wait with nothing. An asker that gives up is let go.
   */
  async wait(
    cursor: string | null,
    milliseconds: number,
    signal?: AbortSignal,
  ): Promise<ChangesAnswer> {
    const now = this.since(cursor);
    if ("reset" in now || now.types.length > 0 || cursor === null) return now;
    if (milliseconds <= 0 || this.closed) return now;
    await new Promise<void>((resolve) => {
      const done = (): void => {
        clearTimeout(timer);
        this.waiting.delete(done);
        signal?.removeEventListener("abort", done);
        resolve();
      };
      const timer = setTimeout(done, milliseconds);
      this.waiting.add(done);
      signal?.addEventListener("abort", done, { once: true });
    });
    return this.since(cursor);
  }
}
