import { describe, expect, it, mock } from "bun:test";
import { TestSchedulerBackend } from "@brains/scheduler/test";
import { deferred } from "@brains/utils/deferred";
import { createSilentLogger } from "@brains/test-utils";
import { createScheduledMaintenanceDaemon } from "../../src/manager/scheduled-maintenance";

describe("scheduled maintenance lifecycle", () => {
  it("does no work at registration, starts once, reports health and supports restart", async () => {
    const scheduler = new TestSchedulerBackend();
    const run = mock(async () => {});
    const daemon = createScheduledMaintenanceDaemon({
      scheduler,
      intervalMs: 60000,
      run,
      logger: createSilentLogger(),
    });
    await scheduler.tickIntervals();
    expect(run).not.toHaveBeenCalled();
    expect((await daemon.healthCheck()).status).toBe("unknown");
    await daemon.start();
    await daemon.start();
    await scheduler.advanceBy(60000);
    expect(run).toHaveBeenCalledTimes(1);
    expect((await daemon.healthCheck()).status).toBe("healthy");
    await daemon.stop();
    await scheduler.tickIntervals();
    expect(run).toHaveBeenCalledTimes(1);
    await daemon.start();
    await scheduler.tickIntervals();
    expect(run).toHaveBeenCalledTimes(2);
    await daemon.stop();
  });

  it("drains active work before stop or restart, without overlapping callbacks", async () => {
    const scheduler = new TestSchedulerBackend();
    const entered = deferred();
    const release = deferred();
    const run = mock(async () => {
      entered.resolve();
      await release.promise;
    });
    let now = 0;
    const daemon = createScheduledMaintenanceDaemon({
      scheduler,
      intervalMs: 60000,
      run,
      logger: createSilentLogger(),
      now: () => now,
    });
    await daemon.start();
    const ticking = scheduler.tickIntervals();
    await entered.promise;
    await scheduler.tickIntervals();
    expect(run).toHaveBeenCalledTimes(1);
    now = 120001;
    expect((await daemon.healthCheck()).status).toBe("warning");
    const stopped = mock(() => {});
    const stopping = daemon.stop().then(stopped);
    const restarting = daemon.start();
    await scheduler.tickIntervals();
    expect(run).toHaveBeenCalledTimes(1);
    expect(stopped).not.toHaveBeenCalled();
    release.resolve();
    await Promise.all([ticking, stopping, restarting]);
    await scheduler.tickIntervals();
    expect(run).toHaveBeenCalledTimes(2);
    await daemon.stop();
  });

  it("reports failures without retaining private errors and recovers on a later cycle", async () => {
    const scheduler = new TestSchedulerBackend();
    const logger = { ...createSilentLogger(), warn: mock(() => {}) };
    const run = mock(async () => {}).mockImplementationOnce(async () => {
      throw new Error("PRIVATE transcript / credential");
    });
    const daemon = createScheduledMaintenanceDaemon({
      scheduler,
      intervalMs: 60000,
      run,
      logger,
    });
    await daemon.start();
    await scheduler.tickIntervals();
    const health = await daemon.healthCheck();
    expect(health.status).toBe("warning");
    expect(JSON.stringify([health, logger.warn.mock.calls])).not.toContain(
      "PRIVATE",
    );
    await scheduler.tickIntervals();
    expect((await daemon.healthCheck()).status).toBe("healthy");
    await daemon.stop();
  });
});
