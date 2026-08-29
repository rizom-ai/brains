import { Effect, Exit, Fiber, FiberMap, Scope } from "@brains/utils/effect";
import type { Clock } from "@brains/utils/effect";
import { nextCronOccurrence, validateCronExpression } from "./cron";

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

export interface BunSchedulerBackendOptions {
  clock?: Clock.Clock | undefined;
  onOverlapSkipped?: ((jobKey: string) => void) | undefined;
  onCallbackError?: ((jobKey: string, error: unknown) => void) | undefined;
}

/** Production scheduler backed by Bun and supervised Effect fibers. */
export class BunSchedulerBackend implements SchedulerBackend {
  private readonly options: BunSchedulerBackendOptions;
  private nextJobId = 0;

  constructor(options: BunSchedulerBackendOptions = {}) {
    this.options = options;
  }

  scheduleCron(
    expression: string,
    callback: SchedulerCallback,
    options: CronScheduleOptions = {},
  ): ScheduledJob {
    nextCronOccurrence(expression, Date.now(), options.timezone);
    const key = `cron:${this.nextJobId++}:${expression}`;
    const cronRef: { current?: Bun.CronJob } = {};
    const scheduledJob = new SupervisedScheduledJob(
      key,
      callback,
      this.options,
      () => cronRef.current?.stop(),
    );
    cronRef.current = Bun.cron(
      expression,
      () => {
        scheduledJob.trigger();
      },
      options.timezone ? { tz: options.timezone } : undefined,
    );
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
    validateCronExpression(expression);
  }
}

class SupervisedScheduledJob implements ScheduledJob {
  private readonly key: string;
  private readonly callback: SchedulerCallback;
  private readonly options: BunSchedulerBackendOptions;
  private readonly stopTrigger: () => void;
  private readonly scope: Scope.CloseableScope;
  private readonly cycles: FiberMap.FiberMap<string, void, never>;
  private intervalFiber: Fiber.RuntimeFiber<unknown, never> | null = null;
  private stopPromise: Promise<void> | null = null;
  private stopped = false;

  constructor(
    key: string,
    callback: SchedulerCallback,
    options: BunSchedulerBackendOptions,
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

export function assertValidInterval(intervalMs: number): void {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new Error("Scheduler interval must be a positive finite number");
  }
}
