import { describe, test, expect, mock, beforeEach } from "bun:test";
import { RebuildManager } from "../../src/lib/auto-rebuild";
import type { MessageHandler } from "@brains/plugins";
import { createTestConfig } from "../test-helpers";
import {
  createMockServicePluginContext,
  type MockServicePluginContext,
} from "@brains/test-utils";
import { z } from "@brains/utils/zod";

interface WavePayload {
  waveId: string;
  sourceTypes: string[];
  changedTargetTypes: string[];
}

/** The envelope every delivered message carries, around the payload. */
const envelope = {
  id: "message-1",
  timestamp: "2026-01-01T00:00:00.000Z",
  type: "projection:wave-ready",
  source: "projection-runtime",
};

/**
 * What a site-build enqueue carries, parsed from the recorded call.
 *
 * The job payload is `unknown` at the enqueue boundary, so the fields these
 * tests read are checked here rather than declared at each assertion.
 */
const enqueuedBuildSchema = z.object({
  environment: z.string().optional(),
  outputDir: z.string().optional(),
  inputGeneration: z.number().optional(),
});

type EnqueueSpy = MockServicePluginContext["jobs"]["enqueue"];

function enqueuedBuild(
  enqueue: EnqueueSpy,
  index: number,
): z.output<typeof enqueuedBuildSchema> {
  const call = enqueue.mock.calls[index];
  if (!call?.[0]) throw new Error(`No enqueue recorded at index ${index}`);
  return enqueuedBuildSchema.parse(call[0].data);
}

function inputGenerationOf(
  enqueue: EnqueueSpy,
  index: number,
): number | undefined {
  return enqueuedBuild(enqueue, index).inputGeneration;
}

function deduplicationKeyOf(
  enqueue: EnqueueSpy,
  index: number,
): string | undefined {
  const call = enqueue.mock.calls[index];
  if (!call?.[0]) throw new Error(`No enqueue recorded at index ${index}`);
  return call[0].options?.deduplicationKey;
}

describe("RebuildManager", () => {
  let context: MockServicePluginContext;

  beforeEach(() => {
    context = createMockServicePluginContext({
      returns: { jobsEnqueue: "job-1" },
    });
  });

  test("successful projection waves enqueue a build before acknowledgment", async () => {
    let waveReadyHandler: MessageHandler<WavePayload> | undefined;
    context.messaging.subscribeExecution = mock(
      (_type, handler): (() => void) => {
        waveReadyHandler = handler;
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
      ...envelope,
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
    let waveReadyHandler: MessageHandler<WavePayload> | undefined;
    context.messaging.subscribeExecution = mock(
      (_type, handler): (() => void) => {
        waveReadyHandler = handler;
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
      ...envelope,
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
    let waveReadyHandler: MessageHandler<WavePayload> | undefined;
    context.messaging.subscribeExecution = mock(
      (_type, handler): (() => void) => {
        waveReadyHandler = handler;
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
      ...envelope,
      payload: {
        waveId: "wave-1",
        sourceTypes: ["post"],
        changedTargetTypes: [],
      },
    });
    manager.markBuildStarted("preview", "job-1", 1);

    await waveReadyHandler({
      ...envelope,
      payload: {
        waveId: "wave-2",
        sourceTypes: ["post"],
        changedTargetTypes: [],
      },
    });
    await waveReadyHandler({
      ...envelope,
      payload: {
        waveId: "wave-3",
        sourceTypes: ["page"],
        changedTargetTypes: [],
      },
    });
    await manager.markBuildFinished("preview", "job-1", 1);

    const enqueue = context.jobs.enqueue;
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(inputGenerationOf(enqueue, 0)).toBe(1);
    expect(inputGenerationOf(enqueue, 1)).toBe(3);
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

    const enqueue = context.jobs.enqueue;
    expect(deduplicationKeyOf(enqueue, 0)).toBe("site-build:preview");
    expect(deduplicationKeyOf(enqueue, 1)).toBe("site-build:production");
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

    const enqueue = context.jobs.enqueue;
    expect(enqueue).toHaveBeenCalled();
    const data = enqueuedBuild(enqueue, 0);
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

    const enqueue = context.jobs.enqueue;
    expect(enqueue).toHaveBeenCalled();
    const data = enqueuedBuild(enqueue, 0);
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

    const enqueue = context.jobs.enqueue;
    expect(enqueue).toHaveBeenCalled();
    const data = enqueuedBuild(enqueue, 0);
    expect(data.environment).toBe("production");
    expect(data.outputDir).toBe("./dist/site-production");

    await manager.dispose();
  });
});
