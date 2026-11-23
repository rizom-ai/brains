import { DriveAuthError, type DriveClient } from "./drive-client";

export type WatchState =
  | "idle"
  /** Asking the brain, which answers when something changes. */
  | "watching"
  /** The brain cannot be reached or is not answering: asking again, more slowly. */
  | "retrying"
  /** This brain has no change feed: the timed sync is all there is. */
  | "unsupported"
  | "stopped";

export interface ChangeWatcherOptions {
  drive: DriveClient;
  /** How long the brain may hold an ask before answering "nothing". */
  waitSeconds?: number;
  /** The first wait before asking again after a failure; it doubles to a minute. */
  retryMilliseconds?: number;
  /** Entity types changed in the brain, as the vault's folders ("note" is the root). */
  onChange: (types: string[]) => void;
  /** Changes may have been missed: compare everything. */
  onReset: () => void;
}

const MAX_RETRY_MS = 60_000;
/** An ask answered "nothing" sooner than this was not held: slow down. */
const UNHELD_MS = 500;
const UNHELD_PAUSE_MS = 2_000;

/**
 * Waits on the brain for changes. Each ask is held by the brain until
 * something changes, so a change reaches the vault within a moment and an
 * idle vault costs one quiet request. After a gap in asking (the brain away,
 * the device asleep) it asks again from the cursor it had, so the brain
 * tells what happened meanwhile, or to compare everything when it cannot
 * place the cursor.
 */
export class ChangeWatcher {
  private readonly options: ChangeWatcherOptions;
  private current: WatchState = "idle";
  private running = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private retry: number;

  constructor(options: ChangeWatcherOptions) {
    this.options = options;
    this.retry = options.retryMilliseconds ?? 5_000;
  }

  state(): WatchState {
    return this.current;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.current = "watching";
    void this.ask(undefined, false);
  }

  stop(): void {
    this.running = false;
    this.current = "stopped";
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  /** Whether the watcher was stopped, asked afresh after every wait. */
  private halted(): boolean {
    return !this.running;
  }

  private later(milliseconds: number, work: () => void): void {
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (this.running) work();
    }, milliseconds);
  }

  /** One ask, then the next: with its cursor, or from scratch after a failure. */
  private async ask(
    cursor: string | undefined,
    afterGap: boolean,
  ): Promise<void> {
    if (this.halted()) return;
    const waitSeconds = this.options.waitSeconds ?? 25;
    const started = Date.now();
    try {
      // The first ask only fetches a cursor to ask from.
      const answer = await this.options.drive.changes(
        cursor,
        cursor === undefined ? 0 : waitSeconds,
      );
      if (this.halted()) return;
      if (answer === undefined) {
        this.current = "unsupported";
        this.running = false;
        return;
      }
      this.current = "watching";
      // Only a held ask that was answered shows the brain can hold one: a
      // cursor fetched between failures does not shorten the wait.
      if (cursor !== undefined) {
        this.retry = this.options.retryMilliseconds ?? 5_000;
      }
      const quiet = !("reset" in answer) && answer.types.length === 0;
      if ("reset" in answer || afterGap) this.options.onReset();
      else if (!quiet) this.options.onChange(answer.types);
      const next = (): void => void this.ask(answer.cursor, false);
      if (
        quiet &&
        cursor !== undefined &&
        waitSeconds > 0 &&
        Date.now() - started < UNHELD_MS
      ) {
        this.later(UNHELD_PAUSE_MS, next);
      } else {
        // Off this call's stack, so a long watch never deepens it.
        this.later(0, next);
      }
    } catch (error) {
      if (this.halted()) return;
      if (error instanceof DriveAuthError) {
        // The sync says "sign in again"; asking on would only repeat it.
        this.current = "stopped";
        this.running = false;
        return;
      }
      this.current = "retrying";
      const wait = this.retry;
      this.retry = Math.min(this.retry * 2, MAX_RETRY_MS);
      // From the cursor it had: the brain then tells what changed during
      // the gap, or to compare everything if it cannot place the cursor.
      // With no cursor yet, changes before the first one are not in any
      // answer, so the first cursor after a failure compares everything.
      this.later(wait, () => void this.ask(cursor, cursor === undefined));
    }
  }
}
