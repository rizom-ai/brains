import {
  createMockServicePluginContext,
  type MockServicePluginContext,
} from "@brains/plugins/test";
import { describe, test, expect, mock, beforeEach, spyOn } from "bun:test";
import { RebuildManager } from "../../src/lib/auto-rebuild";
import { z } from "@brains/utils/zod";
import { createTestConfig } from "../test-helpers";
import { genericSpy, waitUntil } from "@brains/test-utils";

/** The build payload these tests read off an enqueued job. */
const buildJobDataSchema = z.looseObject({
  inputGeneration: z.number().optional(),
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

  test("enqueues one dirty-generation successor after an active build", async () => {
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
    let nextJob = 0;
    enqueue.mockImplementation(
      mock(async () => {
        nextJob += 1;
        return `job-${nextJob}`;
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
        changedTargetTypes: [],
      },
    });
    manager.markBuildStarted("preview", "job-1", 1);

    await waveReadyHandler({
      payload: {
        waveId: "wave-2",
        sourceTypes: ["post"],
        changedTargetTypes: [],
      },
    });
    await waveReadyHandler({
      payload: {
        waveId: "wave-3",
        sourceTypes: ["page"],
        changedTargetTypes: [],
      },
    });
    await manager.markBuildFinished("preview", "job-1", 1);

    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(
      buildJobDataSchema.parse(enqueue.mock.calls[0]?.[0]?.data)
        .inputGeneration,
    ).toBe(1);
    expect(
      buildJobDataSchema.parse(enqueue.mock.calls[1]?.[0]?.data)
        .inputGeneration,
    ).toBe(3);
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
