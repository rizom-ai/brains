import {
  createMockServicePluginContext,
  type MockServicePluginContext,
} from "@brains/plugins/test";
import { describe, test, expect, mock, beforeEach, spyOn } from "bun:test";
import {
  createEnqueueJobFn,
  JobQueueService,
  type EnqueueJobRequest,
} from "@brains/job-queue";
import { migrateJobQueue } from "@brains/job-queue/migrate";
import { createClient } from "@libsql/client";
import { RebuildManager } from "../../src/lib/auto-rebuild";
import { z } from "@brains/utils/zod";
import { createTestConfig } from "../test-helpers";
import {
  createSilentLogger,
  createTestDatabase,
  genericSpy,
  waitUntil,
} from "@brains/test-utils";

/** The build payload these tests read off an enqueued job. */
const buildJobDataSchema = z.looseObject({
  environment: z.string().optional(),
  outputDir: z.string().optional(),
});

/** The projection-wave handler these tests capture from the subscription. */
type WaveReadyHandler = (message: {
  payload: {
    waveId: string;
    sourceTypes: string[];
    changedTargetTypes: string[];
  };
}) => Promise<{ success: boolean }>;

describe("RebuildManager", () => {
  let context: MockServicePluginContext;
  // Spied once per test, so the recorded arguments are typed by the member
  // rather than reached for through an assertion afterwards.
  let enqueue: ReturnType<
    typeof spyOn<MockServicePluginContext["jobs"], "enqueue">
  >;

  beforeEach(() => {
    context = createMockServicePluginContext({
      returns: { jobsEnqueue: "job-1" },
    });
    enqueue = spyOn(context.jobs, "enqueue");
  });

  test("successful projection waves enqueue a build before acknowledgment", async () => {
    let waveReadyHandler: WaveReadyHandler | undefined;
    // mock() erases the type parameters subscribeExecution declares;
    // genericSpy names that as the only reason.
    context.messaging.subscribeExecution = genericSpy<
      typeof context.messaging.subscribeExecution
    >(
      mock((_type: string, handler: WaveReadyHandler): (() => void) => {
        waveReadyHandler = handler;
        return () => {};
      }),
    );
    const manager = new RebuildManager(
      createTestConfig({ rebuildDebounce: 1 }),
      context,
      "site-builder",
      context.logger,
    );
    manager.setupAutoRebuild();
    if (!waveReadyHandler) throw new Error("Expected wave subscription");

    await waveReadyHandler({
      payload: {
        waveId: "wave-1",
        sourceTypes: ["post"],
        changedTargetTypes: ["topic"],
      },
    });

    expect(context.jobs.enqueue).toHaveBeenCalledTimes(1);
    await manager.dispose();
  });

  test("does not rebuild for note-only waves", async () => {
    let waveReadyHandler: WaveReadyHandler | undefined;
    // mock() erases the type parameters subscribeExecution declares;
    // genericSpy names that as the only reason.
    context.messaging.subscribeExecution = genericSpy<
      typeof context.messaging.subscribeExecution
    >(
      mock((_type: string, handler: WaveReadyHandler): (() => void) => {
        waveReadyHandler = handler;
        return () => {};
      }),
    );
    const manager = new RebuildManager(
      createTestConfig(),
      context,
      "site-builder",
      context.logger,
    );
    manager.setupAutoRebuild();
    if (!waveReadyHandler) throw new Error("Expected wave subscription");

    await waveReadyHandler({
      payload: {
        waveId: "wave-note",
        sourceTypes: ["note"],
        changedTargetTypes: [],
      },
    });

    expect(context.jobs.enqueue).not.toHaveBeenCalled();
    await manager.dispose();
  });

  test("every site wave enqueues, whichever process runs the builds", async () => {
    // The web process schedules waves and the worker runs builds, so this
    // manager never hears a build start or finish. The queue keeps at most one
    // pending build per environment; a wave during a running build leaves one
    // pending behind it.
    let waveReadyHandler: WaveReadyHandler | undefined;
    // mock() erases the type parameters subscribeExecution declares;
    // genericSpy names that as the only reason.
    context.messaging.subscribeExecution = genericSpy<
      typeof context.messaging.subscribeExecution
    >(
      mock((_type: string, handler: WaveReadyHandler): (() => void) => {
        waveReadyHandler = handler;
        return () => {};
      }),
    );
    const manager = new RebuildManager(
      createTestConfig({ rebuildDebounce: 1 }),
      context,
      "site-builder",
      context.logger,
    );
    manager.setupAutoRebuild();
    if (!waveReadyHandler) throw new Error("Expected wave subscription");

    for (const waveId of ["wave-1", "wave-2"]) {
      await waveReadyHandler({
        payload: { waveId, sourceTypes: ["book"], changedTargetTypes: [] },
      });
    }

    expect(enqueue).toHaveBeenCalledTimes(2);
    for (const [request] of enqueue.mock.calls) {
      expect(request.options).toMatchObject({
        deduplication: "skip",
        deduplicationKey: "site-build:preview",
      });
    }
    await manager.dispose();
  });

  test("a build goes ahead of the work queued at the default priority", async () => {
    // The queue claims the lowest priority first, and embeddings and
    // projections queue at the default, 0: a new brain's first import must
    // not keep its site unbuilt until every section is embedded and read.
    const manager = new RebuildManager(
      createTestConfig(),
      context,
      "site-builder",
      context.logger,
    );

    manager.requestBuild("preview");
    manager.requestBuild("production");
    await Promise.resolve();

    expect(enqueue).toHaveBeenCalledTimes(2);
    for (const [request] of enqueue.mock.calls) {
      expect(request.options?.priority).toBeLessThan(0);
    }
    await manager.dispose();
  });

  test("uses environment-specific job deduplication keys", async () => {
    const manager = new RebuildManager(
      createTestConfig(),
      context,
      "site-builder",
      context.logger,
    );

    manager.requestBuild("preview");
    manager.requestBuild("production");
    await Promise.resolve();

    expect(enqueue.mock.calls[0]?.[0]?.options?.deduplicationKey).toBe(
      "site-build:preview",
    );
    expect(enqueue.mock.calls[1]?.[0]?.options?.deduplicationKey).toBe(
      "site-build:production",
    );
    await manager.dispose();
  });

  test("requestBuild defaults to preview when previewOutputDir is set", async () => {
    const config = createTestConfig();
    const manager = new RebuildManager(
      config,
      context,
      "site-builder",
      context.logger,
    );

    manager.requestBuild();

    // The debounce fires immediately on first trigger (leading edge), so the
    // enqueue is what to wait for — not ten milliseconds, which only had to
    // be longer than the enqueue usually takes.
    await waitUntil(
      () => enqueue.mock.calls.length > 0,
      "the build to be enqueued",
    );

    const data = buildJobDataSchema.parse(enqueue.mock.calls[0]?.[0]?.data);
    expect(data.environment).toBe("preview");
    expect(data.outputDir).toBe("./dist/site-preview");

    await manager.dispose();
  });

  test("requestBuild defaults to production when previewOutputDir is empty", async () => {
    const config = createTestConfig({ previewOutputDir: "" });
    const manager = new RebuildManager(
      config,
      context,
      "site-builder",
      context.logger,
    );

    manager.requestBuild();

    await waitUntil(
      () => enqueue.mock.calls.length > 0,
      "the build to be enqueued",
    );

    const data = buildJobDataSchema.parse(enqueue.mock.calls[0]?.[0]?.data);
    expect(data.environment).toBe("production");

    await manager.dispose();
  });

  test("waits for an admitted enqueue during dispose", async () => {
    let signalEnqueueStarted: (() => void) | undefined;
    const enqueueStarted = new Promise<void>((resolve) => {
      signalEnqueueStarted = resolve;
    });
    let releaseEnqueue: (() => void) | undefined;
    const enqueueGate = new Promise<void>((resolve) => {
      releaseEnqueue = resolve;
    });
    context.jobs.enqueue = mock(async () => {
      signalEnqueueStarted?.();
      await enqueueGate;
      return "job-1";
    });
    const manager = new RebuildManager(
      createTestConfig(),
      context,
      "site-builder",
      context.logger,
    );
    manager.requestBuild();
    await enqueueStarted;

    let disposeSettled = false;
    const disposing = manager.dispose().then(() => {
      disposeSettled = true;
    });
    await Promise.resolve();
    expect(disposeSettled).toBe(false);

    releaseEnqueue?.();
    await disposing;
    expect(disposeSettled).toBe(true);
  });

  test("does not admit builds after disposal", async () => {
    const manager = new RebuildManager(
      createTestConfig(),
      context,
      "site-builder",
      context.logger,
    );
    await manager.dispose();

    manager.requestBuild();
    await Promise.resolve();

    expect(context.jobs.enqueue).not.toHaveBeenCalled();
  });

  test("queues a requested build after another process holds the queue past the enqueue budget", async () => {
    const logger = createSilentLogger();
    const database = await createTestDatabase({
      prefix: "site-builder-rebuild-contention-",
      filename: "brain-jobs.db",
      migrate: (url) => migrateJobQueue({ url }, logger),
    });
    const queue = JobQueueService.createFresh({ url: database.url }, logger);
    // The worker process's own connection to the same queue file.
    const worker = database.track(createClient({ url: database.url }));
    let manager: RebuildManager | undefined;
    try {
      await queue.initialize();
      queue.registerHandler("site-builder:site-build", {
        process: async () => undefined,
        validateAndParse: (data) => data,
      });
      const enqueueThroughQueue = createEnqueueJobFn(
        queue,
        "site-builder",
        true,
      );
      const failures: unknown[] = [];
      context.jobs.enqueue = mock(
        (request: EnqueueJobRequest): Promise<string> =>
          enqueueThroughQueue(request).catch((error: unknown) => {
            failures.push(error);
            throw error;
          }),
      );
      manager = new RebuildManager(
        createTestConfig({ rebuildDebounce: 100 }),
        context,
        "site-builder",
        logger,
      );

      // Held past the queue's whole enqueue budget, as a stalled commit in
      // the worker can; the request is refused rather than queued.
      const held = await worker.transaction("write");
      try {
        manager.requestBuild("preview");
        await waitUntil(
          () => failures.length > 0,
          "the enqueue budget to run out",
          { timeoutMs: 5_000 },
        );
      } finally {
        await held.rollback();
        held.close();
      }
      expect(failures[0]).toHaveProperty(
        "message",
        expect.stringContaining(
          'Failed to acquire atomic enqueue transaction for type "site-builder:site-build"',
        ),
      );

      await waitUntil(
        async () =>
          (await queue.getActiveJobs(["site-builder:site-build"])).length === 1,
        "the requested build to be queued",
        { timeoutMs: 5_000 },
      );
    } finally {
      await manager?.dispose();
      queue.close();
      await database.cleanup();
    }
  }, 15_000);

  test("stops retrying a refused build once disposed", async () => {
    const refusingEnqueue = mock(async (): Promise<string> => {
      throw new Error("queue refused");
    });
    context.jobs.enqueue = refusingEnqueue;
    const manager = new RebuildManager(
      createTestConfig({ rebuildDebounce: 10 }),
      context,
      "site-builder",
      context.logger,
    );

    manager.requestBuild("preview");
    await waitUntil(
      () => refusingEnqueue.mock.calls.length >= 2,
      "the refused build to be retried",
    );
    await manager.dispose();
    const attempts = refusingEnqueue.mock.calls.length;
    await Bun.sleep(100);

    expect(refusingEnqueue).toHaveBeenCalledTimes(attempts);
  });

  test("explicit environment overrides the default", async () => {
    const config = createTestConfig();
    const manager = new RebuildManager(
      config,
      context,
      "site-builder",
      context.logger,
    );

    manager.requestBuild("production");

    await waitUntil(
      () => enqueue.mock.calls.length > 0,
      "the build to be enqueued",
    );

    const data = buildJobDataSchema.parse(enqueue.mock.calls[0]?.[0]?.data);
    expect(data.environment).toBe("production");
    expect(data.outputDir).toBe("./dist/site-production");

    await manager.dispose();
  });
});
