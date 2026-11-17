import type { DaemonTimers } from "../../src/interface/daemon-restart";

interface Scheduled {
  readonly at: number;
  readonly callback: () => void;
}

/** Let every queued callback and promise reaction settle, without waiting on time. */
export const settle = (): Promise<void> =>
  new Promise<void>((resolve) => setImmediate(resolve));

/** Daemon timers that fire only when a test advances them. */
export class ManualDaemonTimers implements DaemonTimers {
  private now = 0;
  private readonly scheduled = new Set<Scheduled>();

  schedule(callback: () => void, delayMs: number): () => void {
    const entry = { at: this.now + delayMs, callback };
    this.scheduled.add(entry);
    return (): void => {
      this.scheduled.delete(entry);
    };
  }

  /** How many callbacks are still waiting to fire. */
  get pending(): number {
    return this.scheduled.size;
  }

  /** Move the clock forward, firing what falls due in order. */
  async advance(ms: number): Promise<void> {
    const target = this.now + ms;
    const due = [...this.scheduled]
      .filter((entry) => entry.at <= target)
      .sort((left, right) => left.at - right.at)[0];
    if (!due) {
      this.now = target;
      await settle();
      return;
    }
    this.scheduled.delete(due);
    this.now = due.at;
    due.callback();
    await settle();
    await this.advance(target - this.now);
  }
}
