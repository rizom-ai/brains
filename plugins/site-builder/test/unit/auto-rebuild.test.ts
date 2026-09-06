import { describe, test, expect, beforeEach } from "bun:test";
import { createSilentLogger, waitUntil } from "@brains/test-utils";
import { RebuildManager, type RebuildJobs } from "../../src/lib/auto-rebuild";
import { siteBuildJob } from "../../src/lib/site-build-job";
import { createTestConfig } from "../test-helpers";

interface BuildRequest {
  environment: "preview" | "production";
  outputDir: string;
  inputGeneration: number;
}

/** A queue that records what was asked of it and hands back job ids. */
function recordingJobs(): RebuildJobs & { readonly queued: BuildRequest[] } {
  const queued: BuildRequest[] = [];
  return {
    queued,
    enqueue: async (_definition, input): Promise<{ id: string }> => {
      queued.push({
        environment: input.environment,
        outputDir: input.outputDir,
        inputGeneration: input.inputGeneration,
      });
      return { id: `job-${queued.length}` };
    },
  };
}

describe("RebuildManager", () => {
  const logger = createSilentLogger("auto-rebuild-test");
  let jobs: ReturnType<typeof recordingJobs>;

  beforeEach(() => {
    jobs = recordingJobs();
  });

  test("a finished projection wave enqueues a build", async () => {
    const manager = new RebuildManager(
      createTestConfig({ autoRebuild: true, rebuildDebounce: 1 }),
      jobs,
      logger,
    );

    await manager.onProjectionWave({
      waveId: "wave-1",
      sourceTypes: ["post"],
      changedTargetTypes: ["topic"],
    });

    expect(jobs.queued).toHaveLength(1);
    await manager.dispose();
  });

  test("does not rebuild for note-only waves", async () => {
    const manager = new RebuildManager(
      createTestConfig({ autoRebuild: true }),
      jobs,
      logger,
    );

    await manager.onProjectionWave({
      waveId: "wave-note",
      sourceTypes: ["note"],
      changedTargetTypes: [],
    });

    expect(jobs.queued).toEqual([]);
    await manager.dispose();
  });

  test("enqueues one dirty-generation successor after an active build", async () => {
    const manager = new RebuildManager(
      createTestConfig({ autoRebuild: true, rebuildDebounce: 1 }),
      jobs,
      logger,
    );

    await manager.onProjectionWave({
      waveId: "wave-1",
      sourceTypes: ["post"],
      changedTargetTypes: [],
    });
    manager.markBuildStarted("preview", "job-1", 1);

    await manager.onProjectionWave({
      waveId: "wave-2",
      sourceTypes: ["post"],
      changedTargetTypes: [],
    });
    await manager.onProjectionWave({
      waveId: "wave-3",
      sourceTypes: ["page"],
      changedTargetTypes: [],
    });
    await manager.markBuildFinished("preview", "job-1", 1);

    expect(jobs.queued.map((request) => request.inputGeneration)).toEqual([
      1, 3,
    ]);
    await manager.dispose();
  });

  /**
   * The rule that a queued build is not queued twice belongs to the job, not
   * to the manager: the runtime reads it off the declaration when enqueuing.
   */
  test("the build declares one queued job per environment", () => {
    expect(
      siteBuildJob.oncePending?.({
        environment: "preview",
        outputDir: "./dist/site-preview",
      }),
    ).toBe("site-build:preview");
    expect(
      siteBuildJob.oncePending?.({
        environment: "production",
        outputDir: "./dist/site-production",
      }),
    ).toBe("site-build:production");
  });

  test("requestBuild defaults to preview when previewOutputDir is set", async () => {
    const manager = new RebuildManager(createTestConfig(), jobs, logger);

    manager.requestBuild();

    // The debounce fires immediately on first trigger (leading edge), so the
    // enqueue is what to wait for.
    await waitUntil(() => jobs.queued.length > 0, "the build to be enqueued");

    expect(jobs.queued[0]?.environment).toBe("preview");
    expect(jobs.queued[0]?.outputDir).toBe("./dist/site-preview");
    await manager.dispose();
  });

  test("requestBuild defaults to production when previewOutputDir is empty", async () => {
    const manager = new RebuildManager(
      createTestConfig({ previewOutputDir: "" }),
      jobs,
      logger,
    );

    manager.requestBuild();

    await waitUntil(() => jobs.queued.length > 0, "the build to be enqueued");

    expect(jobs.queued[0]?.environment).toBe("production");
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
    const gatedJobs: RebuildJobs = {
      enqueue: async () => {
        signalEnqueueStarted?.();
        await enqueueGate;
        return { id: "job-1" };
      },
    };
    const manager = new RebuildManager(createTestConfig(), gatedJobs, logger);
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
    const manager = new RebuildManager(createTestConfig(), jobs, logger);
    await manager.dispose();

    manager.requestBuild();
    await Promise.resolve();

    expect(jobs.queued).toEqual([]);
  });

  test("explicit environment overrides the default", async () => {
    const manager = new RebuildManager(createTestConfig(), jobs, logger);

    manager.requestBuild("production");

    await waitUntil(() => jobs.queued.length > 0, "the build to be enqueued");

    expect(jobs.queued[0]?.environment).toBe("production");
    expect(jobs.queued[0]?.outputDir).toBe("./dist/site-production");
    await manager.dispose();
  });
});
