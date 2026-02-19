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
  private timeout: Timer | undefined;
  private pending = false;

  constructor(
    private readonly fn: () => void,
    private readonly delayMs: number,
  ) {}

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
