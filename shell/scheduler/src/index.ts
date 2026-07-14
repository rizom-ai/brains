import { Cron } from "croner";

/** A scheduled job that can be stopped. */
export interface ScheduledJob {
  stop(): void;
}

/** Callback invoked by a scheduler backend. */
export type SchedulerCallback = () => void | Promise<void>;

export interface CronScheduleOptions {
  timezone?: string | undefined;
}

/** Generic backend contract for cron and fixed-interval schedules. */
export interface SchedulerBackend {
  scheduleCron(
    expression: string,
    callback: SchedulerCallback,
    options?: CronScheduleOptions,
  ): ScheduledJob;
  scheduleInterval(
    intervalMs: number,
    callback: SchedulerCallback,
  ): ScheduledJob;
  validateCron(expression: string): void;
}

/** Production scheduler backed by Croner and the process timer API. */
export class CronerBackend implements SchedulerBackend {
  scheduleCron(
    expression: string,
    callback: SchedulerCallback,
    options: CronScheduleOptions = {},
  ): ScheduledJob {
    const cronOptions = options.timezone
      ? { timezone: options.timezone }
      : undefined;
    const job = new Cron(expression, cronOptions, () => {
      void callback();
    });
    return { stop: (): void => job.stop() };
  }

  scheduleInterval(
    intervalMs: number,
    callback: SchedulerCallback,
  ): ScheduledJob {
    assertValidInterval(intervalMs);
    const id = setInterval(() => {
      void callback();
    }, intervalMs);
    return { stop: (): void => clearInterval(id) };
  }

  validateCron(expression: string): void {
    const job = new Cron(expression, { paused: true });
    job.stop();
  }
}

export interface TestSchedulerBackendOptions {
  /** Initial clock value. Defaults to the Unix epoch. */
  now?: Date | undefined;
}

interface TestCronJob {
  id: number;
  expression: string;
  callback: SchedulerCallback;
  cron: Cron;
  nextRun: Date | null;
}

interface TestIntervalJob {
  id: number;
  intervalMs: number;
  callback: SchedulerCallback;
  nextRun: Date;
}

interface DueCallback {
  id: number;
  callback: SchedulerCallback;
}

/**
 * Deterministic scheduler backend.
 *
 * Tests can retain the legacy manual `tick*` controls or advance the injected
 * clock to exercise actual cron and interval cadence without wall-time sleeps.
 */
export class TestSchedulerBackend implements SchedulerBackend {
  private cronJobs: TestCronJob[] = [];
  private intervalJobs: TestIntervalJob[] = [];
  private nextId = 0;
  private currentTime: Date;
  private readonly initialTime: Date;

  constructor(options: TestSchedulerBackendOptions = {}) {
    const initialTime = options.now ?? new Date(0);
    assertValidDate(initialTime);
    this.initialTime = new Date(initialTime);
    this.currentTime = new Date(initialTime);
  }

  scheduleCron(
    expression: string,
    callback: SchedulerCallback,
    options: CronScheduleOptions = {},
  ): ScheduledJob {
    const cron = new Cron(expression, {
      paused: true,
      ...(options.timezone ? { timezone: options.timezone } : {}),
    });
    const entry: TestCronJob = {
      id: this.nextId++,
      expression,
      callback,
      cron,
      nextRun: cron.nextRun(this.currentTime),
    };
    this.cronJobs.push(entry);

    return {
      stop: (): void => {
        cron.stop();
        this.cronJobs = this.cronJobs.filter((job) => job.id !== entry.id);
      },
    };
  }

  scheduleInterval(
    intervalMs: number,
    callback: SchedulerCallback,
  ): ScheduledJob {
    assertValidInterval(intervalMs);
    const entry: TestIntervalJob = {
      id: this.nextId++,
      intervalMs,
      callback,
      nextRun: new Date(this.currentTime.getTime() + intervalMs),
    };
    this.intervalJobs.push(entry);

    return {
      stop: (): void => {
        this.intervalJobs = this.intervalJobs.filter(
          (job) => job.id !== entry.id,
        );
      },
    };
  }

  validateCron(expression: string): void {
    const job = new Cron(expression, { paused: true });
    job.stop();
  }

  /** Return the current injected clock value. */
  now(): Date {
    return new Date(this.currentTime);
  }

  /** Advance the clock by a duration and run every callback that becomes due. */
  async advanceBy(durationMs: number): Promise<void> {
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      throw new Error(
        "Scheduler duration must be a non-negative finite number",
      );
    }
    await this.advanceTo(new Date(this.currentTime.getTime() + durationMs));
  }

  /** Advance the clock to a timestamp and run callbacks in cadence order. */
  async advanceTo(targetTime: Date): Promise<void> {
    assertValidDate(targetTime);
    if (targetTime < this.currentTime) {
      throw new Error("Scheduler clock cannot move backwards");
    }

    const failures: unknown[] = [];
    let dueTime = this.nextDueTime(targetTime);
    while (dueTime !== null) {
      this.currentTime = dueTime;
      const callbacks = this.takeDueCallbacks(dueTime);
      failures.push(...(await settleCallbacks(callbacks)));
      dueTime = this.nextDueTime(targetTime);
    }

    this.currentTime = new Date(targetTime);
    throwFailures(failures);
  }

  /** Trigger every registered callback once without changing the clock. */
  async tick(cronExpression?: string): Promise<void> {
    const callbacks: DueCallback[] = [];
    for (const job of this.cronJobs) {
      if (cronExpression === undefined || job.expression === cronExpression) {
        callbacks.push({ id: job.id, callback: job.callback });
      }
    }
    if (cronExpression === undefined) {
      callbacks.push(
        ...this.intervalJobs.map((job) => ({
          id: job.id,
          callback: job.callback,
        })),
      );
    }

    throwFailures(await settleCallbacks(callbacks));
  }

  /** Trigger every registered interval callback once. */
  async tickIntervals(): Promise<void> {
    const callbacks = this.intervalJobs.map((job) => ({
      id: job.id,
      callback: job.callback,
    }));
    throwFailures(await settleCallbacks(callbacks));
  }

  /** Trigger every registered cron callback once. */
  async tickCrons(): Promise<void> {
    const callbacks = this.cronJobs.map((job) => ({
      id: job.id,
      callback: job.callback,
    }));
    throwFailures(await settleCallbacks(callbacks));
  }

  /** Remove all jobs and restore the injected clock. */
  reset(now: Date = this.initialTime): void {
    assertValidDate(now);
    for (const job of this.cronJobs) job.cron.stop();
    this.cronJobs = [];
    this.intervalJobs = [];
    this.nextId = 0;
    this.currentTime = new Date(now);
  }

  getCronExpressions(): string[] {
    return this.cronJobs.map((job) => job.expression);
  }

  hasCron(expression: string): boolean {
    return this.cronJobs.some((job) => job.expression === expression);
  }

  getIntervalCount(): number {
    return this.intervalJobs.length;
  }

  private nextDueTime(targetTime: Date): Date | null {
    let next: Date | null = null;
    for (const job of this.cronJobs) {
      if (job.nextRun && job.nextRun <= targetTime) {
        if (!next || job.nextRun < next) next = job.nextRun;
      }
    }
    for (const job of this.intervalJobs) {
      if (job.nextRun <= targetTime) {
        if (!next || job.nextRun < next) next = job.nextRun;
      }
    }
    return next ? new Date(next) : null;
  }

  private takeDueCallbacks(dueTime: Date): DueCallback[] {
    const callbacks: DueCallback[] = [];
    const dueTimestamp = dueTime.getTime();

    for (const job of this.cronJobs) {
      if (job.nextRun?.getTime() !== dueTimestamp) continue;
      callbacks.push({ id: job.id, callback: job.callback });
      job.nextRun = job.cron.nextRun(dueTime);
    }
    for (const job of this.intervalJobs) {
      if (job.nextRun.getTime() !== dueTimestamp) continue;
      callbacks.push({ id: job.id, callback: job.callback });
      job.nextRun = new Date(dueTimestamp + job.intervalMs);
    }

    return callbacks.sort((left, right) => left.id - right.id);
  }
}

function assertValidDate(value: Date): void {
  if (Number.isNaN(value.getTime())) {
    throw new Error("Scheduler time must be a valid date");
  }
}

function assertValidInterval(intervalMs: number): void {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new Error("Scheduler interval must be a positive finite number");
  }
}

async function settleCallbacks(callbacks: DueCallback[]): Promise<unknown[]> {
  const results = await Promise.allSettled(
    callbacks.map(async ({ callback }) => callback()),
  );
  return results.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : [],
  );
}

function throwFailures(failures: unknown[]): void {
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(failures, "Multiple scheduled callbacks failed");
  }
}
