import { describe, expect, it } from "bun:test";
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
import type { Logger } from "@brains/utils/logger";
import {
  RECURRING_CHECK_JOB_TYPE,
  RecurringCheckService,
  createRecurringCheckSchedule,
  getPreviousOccurrence,
} from "../src";

class MemoryRuntimeState implements IRuntimeStateNamespace {
  private readonly values = new Map<string, unknown>();

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
  private readonly handlers = new Map<string, JobHandler>();

  registerHandler(type: string, handler: JobHandler): void {
    this.handlers.set(type, handler);
  }

  enqueue(request: JobQueueEnqueueRequest): Promise<string> {
    this.enqueued.push(request);
    return Promise.resolve(`job-${this.enqueued.length}`);
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

const logger = {
  child: (): Logger => logger,
  debug: (): void => {},
  error: (): void => {},
} as unknown as Logger;

function createService(options?: {
  now?: Date;
  delivery?: (body: string) => Promise<void>;
}): {
  service: RecurringCheckService;
  scheduler: TestSchedulerBackend;
  queue: TestJobQueue;
  delivered: string[];
} {
  const now = options?.now ?? new Date("2026-07-14T12:00:00.000Z");
  const scheduler = new TestSchedulerBackend({ now });
  const queue = new TestJobQueue();
  const delivered: string[] = [];
  const service = new RecurringCheckService({
    brainId: "brain.example",
    scheduler,
    runtimeState: new MemoryRuntimeState(),
    jobQueue: queue as unknown as IJobQueueService,
    logger,
    now: (): Date => new Date(now),
    delivery: {
      deliver: async (alert): Promise<void> => {
        if (options?.delivery) await options.delivery(alert.body);
        delivered.push(alert.body);
      },
    },
  });
  return { service, scheduler, queue, delivered };
}

describe("RecurringCheckService", () => {
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
