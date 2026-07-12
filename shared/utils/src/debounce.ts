/**
 * Leading + trailing debounce.
 *
 * - First call fires immediately (leading edge)
 * - Subsequent calls within the delay window are collapsed
 * - After the window settles, fires once more if there were extra calls (trailing edge)
 *
 * Result: N rapid calls within a window → at most 2 executions.
 */
export class LeadingTrailingDebounce {
  private readonly fn: () => void;
  private readonly delayMs: number;
  private timeout: Timer | undefined;
  private pending = false;

  constructor(fn: () => void, delayMs: number) {
    this.fn = fn;
    this.delayMs = delayMs;
  }

  trigger(): void {
    if (!this.timeout) {
      // No active window — fire immediately (leading edge)
      this.fn();
      // Start cooldown window
      this.timeout = setTimeout((): void => {
        this.timeout = undefined;
        if (this.pending) {
          this.pending = false;
          this.fn();
        }
      }, this.delayMs);
      return;
    }

    // Within active window — schedule trailing, reset timer
    this.pending = true;
    clearTimeout(this.timeout);
    this.timeout = setTimeout((): void => {
      this.timeout = undefined;
      if (this.pending) {
        this.pending = false;
        this.fn();
      }
    }, this.delayMs);
  }

  dispose(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }
    this.pending = false;
  }
}

/**
 * Trailing-only debounce.
 *
 * Fires once after the triggers go quiet for the delay window; every
 * trigger resets the window. Use this when the work must observe effects
 * that land *after* the trigger (e.g. committing files that an event
 * subscriber is still writing) — a leading edge would run too early.
 */
export class TrailingDebounce {
  private readonly fn: () => void;
  private readonly delayMs: number;
  private timeout: Timer | undefined;

  constructor(fn: () => void, delayMs: number) {
    this.fn = fn;
    this.delayMs = delayMs;
  }

  trigger(): void {
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = setTimeout((): void => {
      this.timeout = undefined;
      this.fn();
    }, this.delayMs);
  }

  dispose(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }
  }
}
