/**
 * Scheduler Backend - Abstraction for cron and interval scheduling
 *
 * This allows the ContentScheduler to be tested deterministically
 * by injecting a test backend that manually controls when jobs fire.
 */

import { Cron } from "croner";

/**
 * A scheduled job that can be stopped
 */
export interface ScheduledJob {
  stop(): void;
}

/**
 * Callback type for scheduled jobs - can return a promise for async work
 */
export type SchedulerCallback = () => void | Promise<void>;

/**
 * Backend interface for scheduling operations
 */
export interface SchedulerBackend {
  /**
   * Schedule a cron job
   * @param expression - Cron expression (5 or 6 fields)
   * @param callback - Function to call when cron fires (can be async)
   */
  scheduleCron(expression: string, callback: SchedulerCallback): ScheduledJob;

  /**
   * Schedule an interval
   * @param intervalMs - Interval in milliseconds
   * @param callback - Function to call on each interval (can be async)
   */
  scheduleInterval(
    intervalMs: number,
    callback: SchedulerCallback,
  ): ScheduledJob;

  /**
   * Validate a cron expression (throws if invalid)
   */
  validateCron(expression: string): void;
}

/**
 * Real scheduler backend using croner and setInterval
 */
export class CronerBackend implements SchedulerBackend {
  scheduleCron(expression: string, callback: SchedulerCallback): ScheduledJob {
    const job = new Cron(expression, () => {
      void callback();
    });
    return { stop: () => job.stop() };
  }

  scheduleInterval(
    intervalMs: number,
    callback: SchedulerCallback,
  ): ScheduledJob {
    const id = setInterval(() => {
      void callback();
    }, intervalMs);
    return { stop: () => clearInterval(id) };
  }

  validateCron(expression: string): void {
    // Create and immediately stop to validate
    const testCron = new Cron(expression);
    testCron.stop();
  }
}

/**
 * Test scheduler backend for deterministic testing
 *
 * Instead of relying on real timers, tests manually trigger
 * callbacks using the tick() method. The tick() method returns
 * a promise that resolves when all triggered async callbacks complete.
 */
export class TestSchedulerBackend implements SchedulerBackend {
  private cronJobs = new Map<string, SchedulerCallback>();
  private intervalJobs: Array<{ callback: SchedulerCallback; id: number }> = [];
  private nextId = 0;

  scheduleCron(expression: string, callback: SchedulerCallback): ScheduledJob {
    this.cronJobs.set(expression, callback);
    return {
      stop: (): void => {
        this.cronJobs.delete(expression);
      },
    };
  }

  scheduleInterval(
    _intervalMs: number,
    callback: SchedulerCallback,
  ): ScheduledJob {
    const id = this.nextId++;
    this.intervalJobs.push({ callback, id });
    return {
      stop: (): void => {
        this.intervalJobs = this.intervalJobs.filter((j) => j.id !== id);
      },
    };
  }

  validateCron(expression: string): void {
    // Use real Cron for validation even in tests
    const testCron = new Cron(expression);
    testCron.stop();
  }

  /**
   * Trigger scheduled callbacks manually and await their completion.
   *
   * @param cronExpression - If provided, only trigger this specific cron.
   *                         If omitted, trigger all crons and intervals.
   * @returns Promise that resolves when all triggered callbacks complete
   */
  async tick(cronExpression?: string): Promise<void> {
    const promises: Promise<void>[] = [];

    if (cronExpression) {
      const cb = this.cronJobs.get(cronExpression);
      if (cb) promises.push(Promise.resolve(cb()));
    } else {
      for (const cb of this.cronJobs.values()) {
        promises.push(Promise.resolve(cb()));
      }
      for (const job of this.intervalJobs) {
        promises.push(Promise.resolve(job.callback()));
      }
    }

    await Promise.all(promises);
  }

  /**
   * Trigger only interval callbacks and await their completion
   */
  async tickIntervals(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const job of this.intervalJobs) {
      promises.push(Promise.resolve(job.callback()));
    }
    await Promise.all(promises);
  }

  /**
   * Trigger only cron callbacks and await their completion
   */
  async tickCrons(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const cb of this.cronJobs.values()) {
      promises.push(Promise.resolve(cb()));
    }
    await Promise.all(promises);
  }

  /**
   * Get registered cron expressions (for assertions)
   */
  getCronExpressions(): string[] {
    return Array.from(this.cronJobs.keys());
  }

  /**
   * Check if a specific cron is registered
   */
  hasCron(expression: string): boolean {
    return this.cronJobs.has(expression);
  }

  /**
   * Get count of registered interval jobs
   */
  getIntervalCount(): number {
    return this.intervalJobs.length;
  }
}
