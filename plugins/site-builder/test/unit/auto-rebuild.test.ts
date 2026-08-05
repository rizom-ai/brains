import { describe, test, expect, mock, beforeEach } from "bun:test";
import { RebuildManager } from "../../src/lib/auto-rebuild";
import { createTestConfig } from "../test-helpers";
import type { ServicePluginContext } from "@brains/plugins";

function createMockContext(): ServicePluginContext {
  return {
    messaging: {
      subscribeExecution: mock(() => () => {}),
      send: mock(() => Promise.resolve()),
    },
    jobs: {
      enqueue: mock(() => Promise.resolve("job-1")),
    },
    logger: {
      debug: mock(() => {}),
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
    },
  } as unknown as ServicePluginContext;
}

describe("RebuildManager", () => {
  let context: ServicePluginContext;

  beforeEach(() => {
    context = createMockContext();
  });

  test("successful projection waves enqueue a build before acknowledgment", async () => {
    let waveReadyHandler:
      | ((message: {
          payload: {
            waveId: string;
            sourceTypes: string[];
            changedTargetTypes: string[];
          };
        }) => Promise<{ success: boolean }>)
      | undefined;
    context.messaging.subscribeExecution = mock(
      (_type, handler): (() => void) => {
        waveReadyHandler = handler as typeof waveReadyHandler;
        return () => {};
      },
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
    let waveReadyHandler:
      | ((message: {
          payload: {
            waveId: string;
            sourceTypes: string[];
            changedTargetTypes: string[];
          };
        }) => Promise<{ success: boolean }>)
      | undefined;
    context.messaging.subscribeExecution = mock(
      (_type, handler): (() => void) => {
        waveReadyHandler = handler as typeof waveReadyHandler;
        return () => {};
      },
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
    let waveReadyHandler:
      | ((message: {
          payload: {
            waveId: string;
            sourceTypes: string[];
            changedTargetTypes: string[];
          };
        }) => Promise<{ success: boolean }>)
      | undefined;
    context.messaging.subscribeExecution = mock(
      (_type, handler): (() => void) => {
        waveReadyHandler = handler as typeof waveReadyHandler;
        return () => {};
      },
    );
    let nextJob = 0;
    context.jobs.enqueue = mock(async () => {
      nextJob += 1;
      return `job-${nextJob}`;
    });
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

    const enqueue = context.jobs.enqueue as ReturnType<typeof mock>;
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(enqueue.mock.calls[0]?.[0]?.data.inputGeneration).toBe(1);
    expect(enqueue.mock.calls[1]?.[0]?.data.inputGeneration).toBe(3);
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

    const enqueue = context.jobs.enqueue as ReturnType<typeof mock>;
    expect(enqueue.mock.calls[0]?.[0]?.options.deduplicationKey).toBe(
      "site-build:preview",
    );
    expect(enqueue.mock.calls[1]?.[0]?.options.deduplicationKey).toBe(
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

    // The debounce fires immediately on first trigger (leading edge).
    // Wait a tick for the async enqueue call.
    await new Promise((r) => setTimeout(r, 10));

    const enqueue = context.jobs.enqueue as ReturnType<typeof mock>;
    expect(enqueue).toHaveBeenCalled();
    const call = enqueue.mock.calls[0];
    const data = call?.[0]?.data;
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

    await new Promise((r) => setTimeout(r, 10));

    const enqueue = context.jobs.enqueue as ReturnType<typeof mock>;
    expect(enqueue).toHaveBeenCalled();
    const data = enqueue.mock.calls[0]?.[0]?.data;
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

    await new Promise((r) => setTimeout(r, 10));

    const enqueue = context.jobs.enqueue as ReturnType<typeof mock>;
    expect(enqueue).toHaveBeenCalled();
    const data = enqueue.mock.calls[0]?.[0]?.data;
    expect(data.environment).toBe("production");
    expect(data.outputDir).toBe("./dist/site-production");

    await manager.dispose();
  });
});
