import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createSilentLogger, waitUntil } from "@brains/test-utils";
import type {
  IJobProgressMonitor,
  ProgressReporter,
} from "@brains/utils/progress";
import { createMockProgressReporter } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { JobQueueService } from "../src/job-queue-service";
import { JobQueueWorker } from "../src/job-queue-worker";
import type { JobHandler, JobOptions, JobQueueDbConfig } from "../src/types";
import { createTestJobQueueDatabase } from "./helpers/test-job-queue-db";

const OLD = "0.2.0-alpha.612";
const NEW = "0.2.0-alpha.613";

const progressMonitor: IJobProgressMonitor = {
  start: () => undefined,
  stop: async () => undefined,
  createProgressReporter: (): ProgressReporter => createMockProgressReporter(),
  emitJobCompletion: async () => undefined,
  emitJobFailure: async () => undefined,
  handleJobStatusChange: async () => undefined,
};

const payloadSchema = z.object({ name: z.string() });

interface Brain {
  service: JobQueueService;
  worker: JobQueueWorker;
  ran: string[];
  unhealthy: string[];
}

/** Holds named jobs open until the test releases them. */
class Gates {
  private readonly open = new Map<string, () => void>();
  private readonly waiting = new Map<string, Promise<void>>();

  public wait(name: string): Promise<void> {
    const existing = this.waiting.get(name);
    if (existing) return existing;
    const gate = new Promise<void>((resolve) => this.open.set(name, resolve));
    this.waiting.set(name, gate);
    return gate;
  }

  public release(name: string): void {
    this.open.get(name)?.();
  }
}

describe("rolling deploy overlap on one queue database", () => {
  let config: JobQueueDbConfig;
  let cleanup: () => Promise<void>;
  const brains: Brain[] = [];
  const gates = new Gates();
  const held = new Set(["in-flight", "exclusive-in-flight"]);

  function startBrain(version: string): Brain {
    const service = JobQueueService.createFresh(
      { ...config, brainVersion: version },
      createSilentLogger(),
    );
    const ran: string[] = [];
    const unhealthy: string[] = [];
    const handler: JobHandler<"test:job", { name: string }> = {
      validateAndParse: (data) => {
        const parsed = payloadSchema.safeParse(data);
        return parsed.success ? parsed.data : null;
      },
      process: async ({ name }) => {
        ran.push(name);
        if (held.has(name)) await gates.wait(name);
      },
    };
    service.registerHandler("test:job", handler);
    service.registerHandler("test:exclusive", { ...handler, exclusive: true });
    // Both containers run the default slot, as the fleet does.
    const worker = JobQueueWorker.createFresh(
      service,
      progressMonitor,
      createSilentLogger(),
      {
        workerSlotId: "default",
        concurrency: 2,
        pollInterval: 10,
        workerHeartbeatIntervalMs: 10,
        onUnhealthy: (reason) => unhealthy.push(reason),
      },
    );
    const brain = { service, worker, ran, unhealthy };
    brains.push(brain);
    return brain;
  }

  function enqueue(
    brain: Brain,
    name: string,
    type: "test:job" | "test:exclusive" = "test:job",
    options: Partial<JobOptions> = {},
  ): Promise<string> {
    return brain.service.enqueue({
      type,
      data: { name },
      options: {
        source: "test",
        metadata: { operationType: "data_processing" },
        ...options,
      },
    });
  }

  async function statusOf(brain: Brain, jobId: string): Promise<string> {
    return (await brain.service.getStatus(jobId))?.status ?? "missing";
  }

  beforeEach(async () => {
    const testDb = await createTestJobQueueDatabase();
    config = testDb.config;
    cleanup = testDb.cleanup;
  });

  afterEach(async () => {
    held.forEach((name) => gates.release(name));
    await Promise.all(
      brains.map(async ({ worker }) => {
        if (worker.isWorkerRunning()) await worker.stop();
      }),
    );
    brains.forEach(({ service }) => service.close());
    brains.length = 0;
    await cleanup();
  });

  it("runs the new brain's jobs on the new worker only and lets the old worker drain", async () => {
    const old = startBrain(OLD);
    await old.worker.start();
    const inFlight = await enqueue(old, "in-flight");
    await waitUntil(
      () => old.ran.includes("in-flight"),
      "the old worker to start its job",
    );

    // The new web process queues its startup work before its worker runs.
    const next = startBrain(NEW);
    const startup = await enqueue(next, "startup-import");
    await Bun.sleep(100);
    expect(await statusOf(next, startup)).toBe("pending");

    await next.worker.start();
    await waitUntil(
      async () => (await statusOf(next, startup)) === "completed",
      "the new worker to run the startup job",
    );

    // Work the old web process still queues goes to the newer worker too.
    const late = await enqueue(old, "late-old-request");
    await waitUntil(
      async () => (await statusOf(next, late)) === "completed",
      "the new worker to run the old brain's late job",
    );

    gates.release("in-flight");
    await waitUntil(
      async () => (await statusOf(old, inFlight)) === "completed",
      "the old worker to finish its in-flight job",
    );

    expect(old.ran).toEqual(["in-flight"]);
    expect(next.ran).toEqual(["startup-import", "late-old-request"]);
    expect(old.unhealthy).toEqual([]);
    expect(next.unhealthy).toEqual([]);
    expect(old.worker.getStats().isHealthy).toBe(true);
  });

  it("lets the old container drain a same-version redeploy while the new one takes new work", async () => {
    const old = startBrain(NEW);
    await old.worker.start();
    const inFlight = await enqueue(
      old,
      "exclusive-in-flight",
      "test:exclusive",
    );
    await waitUntil(
      () => old.ran.includes("exclusive-in-flight"),
      "the old worker to start its job",
    );

    const next = startBrain(NEW);
    await next.worker.start();
    const startup = await enqueue(next, "startup-import");
    await waitUntil(
      async () => (await statusOf(next, startup)) === "completed",
      "the new worker to run new work",
    );

    // Both web processes ask for the same singleton; it runs once. The
    // second asks a moment later, as a loaded runner may: a skip only joins
    // a job still pending, and an exclusive singleton stays pending behind
    // the old container's exclusive job however long that moment is.
    const singleton: Partial<JobOptions> = {
      deduplication: "skip",
      deduplicationKey: "sync",
    };
    const firstAsk = await enqueue(
      old,
      "singleton",
      "test:exclusive",
      singleton,
    );
    await Bun.sleep(100);
    const asked = [
      firstAsk,
      await enqueue(next, "singleton", "test:exclusive", singleton),
    ];
    expect(new Set(asked).size).toBe(1);
    // An exclusive type stays exclusive across both containers.
    const exclusive = await enqueue(next, "exclusive-next", "test:exclusive");
    expect(await statusOf(next, firstAsk)).toBe("pending");
    expect(await statusOf(next, exclusive)).toBe("pending");

    // The old worker keeps its session across many heartbeats.
    await Bun.sleep(100);
    expect(old.worker.getStats().isHealthy).toBe(true);
    gates.release("exclusive-in-flight");
    await waitUntil(
      async () => (await statusOf(old, inFlight)) === "completed",
      "the old worker to finish its in-flight job",
    );
    await waitUntil(
      async () =>
        (await statusOf(next, firstAsk)) === "completed" &&
        (await statusOf(next, exclusive)) === "completed",
      "the new worker to run the exclusive jobs once the old one settled",
    );
    await old.worker.stop();

    const ran = [...old.ran, ...next.ran];
    expect(old.ran).toEqual(["exclusive-in-flight"]);
    expect(ran.filter((name) => name === "singleton")).toHaveLength(1);
    expect(next.ran).toEqual(["startup-import", "singleton", "exclusive-next"]);
    expect(old.unhealthy).toEqual([]);
    expect(next.unhealthy).toEqual([]);
    expect((await next.service.getDiagnostics()).workerSessions).toMatchObject({
      total: 1,
      active: 1,
    });
  });

  it("rejects a brain version that is not semver", () => {
    expect(() =>
      JobQueueService.createFresh(
        { ...config, brainVersion: "latest" },
        createSilentLogger(),
      ),
    ).toThrow();
  });
});
