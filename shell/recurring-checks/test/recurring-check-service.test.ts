import { describe, expect, it } from "bun:test";
import { Effect } from "@brains/utils/effect";
import type { Clock } from "@brains/utils/effect";
import { TestClock, TestContext } from "@brains/utils/effect/test";
import type {
  IJobQueueService,
  JobHandler,
  JobQueueEnqueueRequest,
} from "@brains/job-queue";
import type {
  IRuntimeStateNamespace,
  IRuntimeStateStore,
  RuntimeStateRecordValue,
  RuntimeStateScopeOptions,
} from "@brains/runtime-state";
import { TestSchedulerBackend } from "@brains/scheduler";
import type {
  ScheduledJob,
  SchedulerBackend,
  SchedulerCallback,
} from "@brains/scheduler";
import type { Logger } from "@brains/utils/logger";
import {
  RECURRING_CHECK_JOB_TYPE,
  RecurringCheckService,
  createRecurringCheckSchedule,
  getPreviousOccurrence,
} from "../src";

class MemoryRuntimeState implements IRuntimeStateNamespace {
  private readonly values = new Map<string, unknown>();

  snapshot(): unknown[] {
    return [...this.values.values()];
  }

  scoped<T>(options: RuntimeStateScopeOptions<T>): IRuntimeStateStore<T> {
    const prefix = `${options.namespace}:`;
    return {
      get: async (key): Promise<T | null> => {
        const value = this.values.get(`${prefix}${key}`);
        return value === undefined ? null : options.schema.parse(value);
      },
      has: async (key): Promise<boolean> => this.values.has(`${prefix}${key}`),
      set: async (key, value): Promise<void> => {
        this.values.set(`${prefix}${key}`, options.schema.parse(value));
      },
      setIfNotExists: async (key, value): Promise<boolean> => {
        const fullKey = `${prefix}${key}`;
        if (this.values.has(fullKey)) return false;
        this.values.set(fullKey, options.schema.parse(value));
        return true;
      },
      delete: async (key): Promise<boolean> =>
        this.values.delete(`${prefix}${key}`),
      list: async (listOptions = {}): Promise<RuntimeStateRecordValue<T>[]> => {
        const records: RuntimeStateRecordValue<T>[] = [];
        for (const [key, value] of this.values) {
          if (!key.startsWith(prefix)) continue;
          const localKey = key.slice(prefix.length);
          if (
            listOptions.keyPrefix !== undefined &&
            !localKey.startsWith(listOptions.keyPrefix)
          ) {
            continue;
          }
          records.push({
            key: localKey,
            value: options.schema.parse(value),
            createdAt: new Date(0),
            updatedAt: new Date(0),
          });
        }
        return records;
      },
      clear: async (): Promise<number> => {
        const keys = [...this.values.keys()].filter((key) =>
          key.startsWith(prefix),
        );
        for (const key of keys) this.values.delete(key);
        return keys.length;
      },
    };
  }
}

class TestJobQueue {
  readonly enqueued: JobQueueEnqueueRequest[] = [];
  readonly unregistered: string[] = [];
  enqueueHook:
    ((request: JobQueueEnqueueRequest) => Promise<string>) | undefined;
  private readonly handlers = new Map<string, JobHandler>();

  registerHandler(type: string, handler: JobHandler): void {
    this.handlers.set(type, handler);
  }

  unregisterHandler(type: string): void {
    this.handlers.delete(type);
    this.unregistered.push(type);
  }

  hasHandler(type: string): boolean {
    return this.handlers.has(type);
  }

  enqueue(request: JobQueueEnqueueRequest): Promise<string> {
    this.enqueued.push(request);
    return (
      this.enqueueHook?.(request) ??
      Promise.resolve(`job-${this.enqueued.length}`)
    );
  }

  async processLatest(): Promise<void> {
    const request = this.enqueued.at(-1);
    if (!request) throw new Error("No queued job");
    const handler = this.handlers.get(request.type);
    if (!handler) throw new Error(`No handler for ${request.type}`);
    const data = handler.validateAndParse(request.data);
    if (data === null) throw new Error("Invalid test job");
    await handler.process(data, "job", {} as never);
  }
}

class DrainingSchedulerBackend implements SchedulerBackend {
  private stopResolver: (() => void) | undefined;

  scheduleCron(
    _expression: string,
    _callback: SchedulerCallback,
  ): ScheduledJob {
    return {
      stop: (): Promise<void> =>
        new Promise<void>((resolve) => {
          this.stopResolver = resolve;
        }),
    };
  }

  scheduleInterval(): ScheduledJob {
    throw new Error("Unexpected interval schedule");
  }

  validateCron(): void {}

  resolveStop(): void {
    this.stopResolver?.();
  }
}

const logger = {
  child: (): Logger => logger,
  debug: (): void => {},
  error: (): void => {},
} as unknown as Logger;

interface CreateServiceOptions {
  now?: Date;
  clock?: Clock.Clock;
  delivery?: (body: string) => Promise<void>;
}

interface ServiceFixture<TScheduler extends SchedulerBackend> {
  service: RecurringCheckService;
  scheduler: TScheduler;
  queue: TestJobQueue;
  state: MemoryRuntimeState;
  delivered: string[];
}

function createService<TScheduler extends SchedulerBackend>(
  options: CreateServiceOptions & { scheduler: TScheduler },
): ServiceFixture<TScheduler>;
function createService(
  options?: CreateServiceOptions,
): ServiceFixture<TestSchedulerBackend>;
function createService(
  options: CreateServiceOptions & { scheduler?: SchedulerBackend } = {},
): ServiceFixture<SchedulerBackend> {
  const now = options.now ?? new Date("2026-07-14T12:00:00.000Z");
  const scheduler =
    options.scheduler ??
    new TestSchedulerBackend({
      ...(options.clock ? { clock: options.clock } : { now }),
    });
  const queue = new TestJobQueue();
  const state = new MemoryRuntimeState();
  const delivered: string[] = [];
  const service = new RecurringCheckService({
    brainId: "brain.example",
    scheduler,
    runtimeState: state,
    jobQueue: queue as unknown as IJobQueueService,
    logger,
    ...(options.clock
      ? { clock: options.clock }
      : { now: (): Date => new Date(now) }),
    delivery: {
      deliver: async (alert): Promise<void> => {
        if (options.delivery) await options.delivery(alert.body);
        delivered.push(alert.body);
      },
    },
  });
  return { service, scheduler, queue, state, delivered };
}

describe("RecurringCheckService", () => {
  it("abandons its unused durable handler exactly once", () => {
    const { service, queue } = createService();

    expect(queue.hasHandler(RECURRING_CHECK_JOB_TYPE)).toBe(true);
    service.abandon();
    service.abandon();

    expect(queue.hasHandler(RECURRING_CHECK_JOB_TYPE)).toBe(false);
    expect(queue.unregistered).toEqual([RECURRING_CHECK_JOB_TYPE]);
  });

  it("refuses synchronous abandonment while running", async () => {
    const { service, queue } = createService();
    await service.start();

    expect(() => service.abandon()).toThrow(
      "Cannot abandon a running recurring check service",
    );

    await service.stop();
    service.abandon();
    expect(queue.hasHandler(RECURRING_CHECK_JOB_TYPE)).toBe(false);
  });

  it("creates stable, staggered UTC schedules", () => {
    const first = createRecurringCheckSchedule(
      "brain.example",
      "agent:directory-scan",
      "daily",
    );
    const repeat = createRecurringCheckSchedule(
      "brain.example",
      "agent:directory-scan",
      "daily",
    );
    const otherBrain = createRecurringCheckSchedule(
      "other.example",
      "agent:directory-scan",
      "daily",
    );

    expect(first).toEqual(repeat);
    expect(first.offsetMs).toBeLessThan(first.periodMs);
    expect(otherBrain.offsetMs).not.toBe(first.offsetMs);
  });

  it("aligns weekly occurrences to a Sunday-start UTC week", () => {
    const schedule = {
      expression: "0 9 * * 1",
      offsetMs: 33 * 60 * 60 * 1_000,
      periodMs: 7 * 24 * 60 * 60 * 1_000,
      anchorMs: 3 * 24 * 60 * 60 * 1_000,
    };

    expect(
      getPreviousOccurrence(
        new Date("2026-07-14T12:00:00.000Z"),
        schedule,
      ).toISOString(),
    ).toBe("2026-07-13T09:00:00.000Z");
  });

  it("enqueues one catch-up job on first startup", async () => {
    const { service, scheduler, queue } = createService();
    service.namespace("agent").register({
      id: "directory-scan",
      cadence: "daily",
      run: async () => ({}),
    });

    await service.start();

    expect(queue.enqueued).toHaveLength(1);
    expect(queue.enqueued[0]?.type).toBe(RECURRING_CHECK_JOB_TYPE);
    expect(queue.enqueued[0]?.options).toMatchObject({
      maxRetries: 3,
      deduplication: "skip",
      deduplicationKey: "agent:directory-scan",
    });
    expect(scheduler.getCronExpressions()).toHaveLength(1);
  });

  it("does not enqueue another catch-up after a successful occurrence", async () => {
    const { service, queue } = createService();
    service.namespace("agent").register({
      id: "directory-scan",
      cadence: "daily",
      run: async () => ({}),
    });
    await service.start();
    await queue.processLatest();
    await service.stop();

    await service.start();

    expect(queue.enqueued).toHaveLength(1);
  });

  it("shares Effect TestClock time with the scheduler and persisted run state", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const { service, scheduler, queue, state } = createService({ clock });
        service.namespace("agent").register({
          id: "directory-scan",
          cadence: "daily",
          run: async () => ({}),
        });
        yield* Effect.promise(() => service.start());
        yield* Effect.promise(() => queue.processLatest());

        const schedule = createRecurringCheckSchedule(
          "brain.example",
          "agent:directory-scan",
          "daily",
        );
        const start = clock.unsafeCurrentTimeMillis();
        const previous = getPreviousOccurrence(new Date(start), schedule);
        const next = previous.getTime() + schedule.periodMs;
        yield* TestClock.adjust(next - start);
        yield* Effect.promise(() => scheduler.runDue());
        yield* Effect.promise(() => queue.processLatest());

        expect(queue.enqueued).toHaveLength(2);
        expect(state.snapshot()).toContainEqual({
          kind: "last-success",
          checkId: "agent:directory-scan",
          at: new Date(next).toISOString(),
        });
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  it("waits for scheduled callbacks to drain when the service stops", async () => {
    const scheduler = new DrainingSchedulerBackend();
    const { service } = createService({ scheduler });
    service.namespace("agent").register({
      id: "directory-scan",
      cadence: "daily",
      run: async () => ({}),
    });
    await service.start();

    let stopSettled = false;
    const stopping = service.stop().then(() => {
      stopSettled = true;
    });
    await Promise.resolve();
    expect(stopSettled).toBe(false);

    scheduler.resolveStop();
    await stopping;
    expect(stopSettled).toBe(true);
  });

  it("aborts an active check when the service stops", async () => {
    const { service } = createService();
    let observedSignal: AbortSignal | undefined;
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    service.namespace("agent").register({
      id: "directory-scan",
      cadence: "daily",
      run: async ({ signal }) => {
        observedSignal = signal;
        markStarted?.();
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      },
    });
    const run = service
      .runNow("agent:directory-scan")
      .catch((error: unknown) => error);
    await started;

    await service.stop();

    expect(observedSignal?.aborted).toBe(true);
    expect(await run).toEqual(new Error("Recurring check service stopped"));
  });

  it("aborts an active check when it is unregistered", async () => {
    const { service } = createService();
    let observedSignal: AbortSignal | undefined;
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const unregister = service.namespace("agent").register({
      id: "directory-scan",
      cadence: "daily",
      run: async ({ signal }) => {
        observedSignal = signal;
        markStarted?.();
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      },
    });
    const run = service
      .runNow("agent:directory-scan")
      .catch((error: unknown) => error);
    await started;

    unregister();
    await Promise.resolve();
    expect(observedSignal?.aborted).toBe(true);
    expect(await run).toEqual(
      new Error("Recurring check unregistered: agent:directory-scan"),
    );
    await service.stop();
  });

  it("waits for active plugin checks to settle during unregister", async () => {
    const { service } = createService();
    let observedSignal: AbortSignal | undefined;
    let markStarted: (() => void) | undefined;
    let releaseRun: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      releaseRun = resolve;
    });
    service.namespace("agent").register({
      id: "directory-scan",
      cadence: "daily",
      run: async ({ signal }) => {
        observedSignal = signal;
        markStarted?.();
        await blocked;
        return {};
      },
    });
    const run = service
      .runNow("agent:directory-scan")
      .catch((error: unknown) => error);
    await started;

    let unregisterSettled = false;
    const unregistering = service.unregisterPlugin("agent").then(() => {
      unregisterSettled = true;
    });
    await Promise.resolve();
    expect(observedSignal?.aborted).toBe(true);
    expect(unregisterSettled).toBe(false);

    releaseRun?.();
    await unregistering;
    expect(await run).toEqual(
      new Error("Recurring check plugin unregistered: agent"),
    );
  });

  it("keeps unrelated plugin checks available during unregister", async () => {
    const { service } = createService();
    let releaseRun: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      releaseRun = resolve;
    });
    service.namespace("agent").register({
      id: "directory-scan",
      cadence: "daily",
      run: async () => {
        await blocked;
        return {};
      },
    });
    service.namespace("monitoring").register({
      id: "health-check",
      cadence: "weekly",
      run: async () => ({}),
    });
    const activeRun = service
      .runNow("agent:directory-scan")
      .catch((error: unknown) => error);
    await Promise.resolve();

    const unregistering = service.unregisterPlugin("agent");
    expect(service.getRegisteredCheckIds()).toEqual([
      "monitoring:health-check",
    ]);
    expect(await service.runNow("monitoring:health-check")).toBe(true);

    releaseRun?.();
    await unregistering;
    await activeRun;
  });

  it("drains admitted catch-up enqueue work during plugin unregister", async () => {
    const { service, queue } = createService();
    await service.start();
    let releaseEnqueue: (() => void) | undefined;
    const blockedEnqueue = new Promise<void>((resolve) => {
      releaseEnqueue = resolve;
    });
    queue.enqueueHook = async (): Promise<string> => {
      await blockedEnqueue;
      return "job-catch-up";
    };
    service.namespace("agent").register({
      id: "directory-scan",
      cadence: "daily",
      run: async () => ({}),
    });
    await Promise.resolve();

    let unregisterSettled = false;
    const unregistering = service.unregisterPlugin("agent").then(() => {
      unregisterSettled = true;
    });
    await Promise.resolve();
    expect(unregisterSettled).toBe(false);

    releaseEnqueue?.();
    await unregistering;
    expect(queue.enqueued).toHaveLength(1);
  });

  it("does not overlap runs of the same check", async () => {
    const { service } = createService();
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    service.namespace("agent").register({
      id: "directory-scan",
      cadence: "daily",
      run: async () => {
        await blocked;
        return {};
      },
    });

    const first = service.runNow("agent:directory-scan");
    expect(await service.runNow("agent:directory-scan")).toBe(false);
    release?.();
    expect(await first).toBe(true);
  });

  it("dedupes an unchanged condition and delivers a changed episode", async () => {
    const { service, delivered } = createService();
    let episode = 1;
    service.namespace("agent").register({
      id: "directory-scan",
      cadence: "daily",
      run: async () => ({
        alerts: [
          {
            dedupeKey: `episode-${episode}`,
            title: "Sightings",
            body: episode === 1 ? "one" : "two",
          },
        ],
      }),
    });

    await service.runNow("agent:directory-scan");
    await service.runNow("agent:directory-scan");
    episode = 2;
    await service.runNow("agent:directory-scan");

    expect(delivered).toEqual(["one", "two"]);
  });

  it("discards pending alerts when alert delivery is disabled", async () => {
    let attempts = 0;
    const { service, state } = createService({
      delivery: async () => {
        attempts += 1;
        throw new Error("delivery failed");
      },
    });
    const checks = service.namespace("agent");
    const unregister = checks.register({
      id: "directory-scan",
      cadence: "daily",
      run: async () => ({
        alerts: [{ dedupeKey: "episode-1", title: "Sightings", body: "one" }],
      }),
    });
    const firstAttempt = service.runNow("agent:directory-scan");
    expect(firstAttempt).rejects.toThrow("delivery failed");
    await firstAttempt.catch(() => undefined);
    unregister();
    checks.register({
      id: "directory-scan",
      cadence: "daily",
      deliverAlerts: false,
      run: async () => ({
        alerts: [{ dedupeKey: "episode-2", title: "Sightings", body: "two" }],
      }),
    });

    expect(await service.runNow("agent:directory-scan")).toBe(true);
    expect(attempts).toBe(1);
    expect(state.snapshot()).not.toContainEqual(
      expect.objectContaining({ kind: "alert", status: "pending" }),
    );
  });

  it("retries pending delivery even when the domain result becomes empty", async () => {
    let attempts = 0;
    let runs = 0;
    const { service, queue, delivered } = createService({
      delivery: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("delivery failed");
      },
    });
    service.namespace("agent").register({
      id: "directory-scan",
      cadence: "daily",
      run: async () => {
        runs += 1;
        return runs === 1
          ? {
              alerts: [
                { dedupeKey: "episode-1", title: "Sightings", body: "one" },
              ],
            }
          : {};
      },
    });
    await service.start();

    const firstAttempt = queue.processLatest();
    expect(firstAttempt).rejects.toThrow("delivery failed");
    await firstAttempt.catch(() => undefined);
    await queue.processLatest();

    expect(attempts).toBe(2);
    expect(delivered).toEqual(["one"]);
    expect(runs).toBe(2);
  });
});
