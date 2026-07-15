import { Effect, Exit, Fiber, FiberMap, Scope } from "@brains/utils/effect";
import type { Clock } from "@brains/utils/effect";
import { Cron } from "croner";

/** A scheduled job that prevents future cycles and drains active callbacks. */
export interface ScheduledJob {
  stop(): Promise<void>;
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

export interface CronerBackendOptions {
  clock?: Clock.Clock | undefined;
  onOverlapSkipped?: ((jobKey: string) => void) | undefined;
  onCallbackError?: ((jobKey: string, error: unknown) => void) | undefined;
}

/** Production scheduler backed by Croner and supervised Effect fibers. */
export class CronerBackend implements SchedulerBackend {
  private readonly options: CronerBackendOptions;
  private nextJobId = 0;

  constructor(options: CronerBackendOptions = {}) {
    this.options = options;
  }

  scheduleCron(
    expression: string,
    callback: SchedulerCallback,
    options: CronScheduleOptions = {},
  ): ScheduledJob {
    const key = `cron:${this.nextJobId++}:${expression}`;
    const cronRef: { current?: Cron } = {};
    const scheduledJob = new SupervisedScheduledJob(
      key,
      callback,
      this.options,
      () => cronRef.current?.stop(),
    );
    const cron = new Cron(
      expression,
      options.timezone ? { timezone: options.timezone } : undefined,
      () => {
        scheduledJob.trigger();
      },
    );
    cronRef.current = cron;
    return scheduledJob;
  }

  scheduleInterval(
    intervalMs: number,
    callback: SchedulerCallback,
  ): ScheduledJob {
    assertValidInterval(intervalMs);
    const key = `interval:${this.nextJobId++}:${intervalMs}`;
    const scheduledJob = new SupervisedScheduledJob(
      key,
      callback,
      this.options,
    );
    scheduledJob.startInterval(intervalMs);
    return scheduledJob;
  }

  validateCron(expression: string): void {
    const job = new Cron(expression, { paused: true });
    job.stop();
  }
}

class SupervisedScheduledJob implements ScheduledJob {
  private readonly key: string;
  private readonly callback: SchedulerCallback;
  private readonly options: CronerBackendOptions;
  private readonly stopTrigger: () => void;
  private readonly scope: Scope.CloseableScope;
  private readonly cycles: FiberMap.FiberMap<string, void, never>;
  private intervalFiber: Fiber.RuntimeFiber<unknown, never> | null = null;
  private stopPromise: Promise<void> | null = null;
  private stopped = false;

  constructor(
    key: string,
    callback: SchedulerCallback,
    options: CronerBackendOptions,
    stopTrigger: () => void = () => {},
  ) {
    this.key = key;
    this.callback = callback;
    this.options = options;
    this.stopTrigger = stopTrigger;
    this.scope = Effect.runSync(Scope.make());
    this.cycles = Effect.runSync(
      Scope.extend(FiberMap.make<string, void, never>(), this.scope),
    );
  }

  startInterval(intervalMs: number): void {
    const schedule = Effect.sleep(intervalMs).pipe(
      Effect.andThen(
        Effect.sync(() => {
          this.trigger();
        }),
      ),
      Effect.forever,
    );
    const ownedSchedule = this.options.clock
      ? Effect.withClock(schedule, this.options.clock)
      : schedule;
    this.intervalFiber = Effect.runFork(ownedSchedule);
  }

  trigger(): void {
    if (this.stopped) return;
    if (FiberMap.unsafeHas(this.cycles, this.key)) {
      this.options.onOverlapSkipped?.(this.key);
      return;
    }

    const callbackEffect = Effect.tryPromise({
      try: async () => {
        await this.callback();
      },
      catch: (error) => error,
    }).pipe(
      Effect.catchAll((error) =>
        Effect.sync(() => {
          this.options.onCallbackError?.(this.key, error);
        }),
      ),
    );
    const fiber = Effect.runFork(callbackEffect);
    FiberMap.unsafeSet(this.cycles, this.key, fiber, { onlyIfMissing: true });
  }

  stop(): Promise<void> {
    this.stopPromise ??= this.stopScheduledJob();
    return this.stopPromise;
  }

  private async stopScheduledJob(): Promise<void> {
    this.stopped = true;
    this.stopTrigger();

    const intervalFiber = this.intervalFiber;
    this.intervalFiber = null;
    if (intervalFiber) {
      await Effect.runPromise(Fiber.interrupt(intervalFiber));
    }

    await Effect.runPromise(FiberMap.awaitEmpty(this.cycles));
    await Effect.runPromise(Scope.close(this.scope, Exit.void));
  }
}

export interface TestSchedulerBackendOptions {
  /** Initial clock value. Defaults to the Unix epoch. */
  now?: Date | undefined;
  /** Effect clock shared with the service under test. */
  clock?: Clock.Clock | undefined;
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
  private readonly clock: Clock.Clock | undefined;
  private readonly activeCallbacks = new Map<number, Set<Promise<void>>>();

  constructor(options: TestSchedulerBackendOptions = {}) {
    this.clock = options.clock;
    const initialTime = options.clock
      ? new Date(options.clock.unsafeCurrentTimeMillis())
      : (options.now ?? new Date(0));
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
      stop: async (): Promise<void> => {
        cron.stop();
        this.cronJobs = this.cronJobs.filter((job) => job.id !== entry.id);
        await this.drainCallbacks(entry.id);
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
      stop: async (): Promise<void> => {
        this.intervalJobs = this.intervalJobs.filter(
          (job) => job.id !== entry.id,
        );
        await this.drainCallbacks(entry.id);
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

  /** Run callbacks due at the shared Effect clock's current time. */
  async runDue(): Promise<void> {
    if (!this.clock) {
      throw new Error("runDue requires an injected Effect clock");
    }
    await this.processTo(new Date(this.clock.unsafeCurrentTimeMillis()));
  }

  /** Advance the standalone clock and run every callback that becomes due. */
  async advanceBy(durationMs: number): Promise<void> {
    if (this.clock) {
      throw new Error("Use TestClock.adjust with an injected Effect clock");
    }
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      throw new Error(
        "Scheduler duration must be a non-negative finite number",
      );
    }
    await this.advanceTo(new Date(this.currentTime.getTime() + durationMs));
  }

  /** Advance the standalone clock to a timestamp and run callbacks in cadence order. */
  async advanceTo(targetTime: Date): Promise<void> {
    if (this.clock) {
      throw new Error("Use TestClock.adjust with an injected Effect clock");
    }
    await this.processTo(targetTime);
  }

  private async processTo(targetTime: Date): Promise<void> {
    assertValidDate(targetTime);
    if (targetTime < this.currentTime) {
      throw new Error("Scheduler clock cannot move backwards");
    }

    const failures: unknown[] = [];
    let dueTime = this.nextDueTime(targetTime);
    while (dueTime !== null) {
      this.currentTime = dueTime;
      const callbacks = this.takeDueCallbacks(dueTime);
      failures.push(...(await this.settleCallbacks(callbacks)));
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

    throwFailures(await this.settleCallbacks(callbacks));
  }

  /** Trigger every registered interval callback once. */
  async tickIntervals(): Promise<void> {
    const callbacks = this.intervalJobs.map((job) => ({
      id: job.id,
      callback: job.callback,
    }));
    throwFailures(await this.settleCallbacks(callbacks));
  }

  /** Trigger every registered cron callback once. */
  async tickCrons(): Promise<void> {
    const callbacks = this.cronJobs.map((job) => ({
      id: job.id,
      callback: job.callback,
    }));
    throwFailures(await this.settleCallbacks(callbacks));
  }

  /** Remove all jobs and restore the injected clock. */
  reset(now: Date = this.initialTime): void {
    if (this.clock) {
      throw new Error("Reset the injected Effect clock through TestClock");
    }
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

  private async settleCallbacks(callbacks: DueCallback[]): Promise<unknown[]> {
    const results = await Promise.allSettled(
      callbacks.map((callback) => this.runCallback(callback)),
    );
    return results.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    );
  }

  private runCallback({ id, callback }: DueCallback): Promise<void> {
    const active = Promise.resolve()
      .then(() => callback())
      .then(() => undefined);
    const callbacks = this.activeCallbacks.get(id) ?? new Set<Promise<void>>();
    callbacks.add(active);
    this.activeCallbacks.set(id, callbacks);
    void active.then(
      () => this.removeActiveCallback(id, active),
      () => this.removeActiveCallback(id, active),
    );
    return active;
  }

  private removeActiveCallback(id: number, active: Promise<void>): void {
    const callbacks = this.activeCallbacks.get(id);
    callbacks?.delete(active);
    if (callbacks?.size === 0) this.activeCallbacks.delete(id);
  }

  private async drainCallbacks(id: number): Promise<void> {
    await Promise.allSettled(Array.from(this.activeCallbacks.get(id) ?? []));
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

function throwFailures(failures: unknown[]): void {
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(failures, "Multiple scheduled callbacks failed");
  }
}
