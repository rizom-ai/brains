import { expect, it } from "bun:test";
import { PROJECTION_CHANNELS } from "@brains/contracts";
import { JobQueueService } from "@brains/job-queue";
import { migrateJobQueue } from "@brains/job-queue/migrate";
import { createPluginHarness } from "@brains/plugins/test";
import type { Plugin, PluginCapabilities } from "@brains/plugins";
import { createSilentLogger, createTestDatabase } from "@brains/test-utils";
import { expectDefined } from "@brains/utils/expect-defined";
import { instantiate, SITE_BUILDER_PLUGIN_ID } from "./helpers/install";

it.each([false, true])(
  "uses durable pending-only deduplication without worker lifecycle callbacks (worker=%s)",
  async (executionOnly) => {
    const logger = createSilentLogger();
    const database = await createTestDatabase({
      prefix: "site-rebuild-queue-",
      filename: "jobs.db",
      migrate: (url) => migrateJobQueue({ url }, logger),
    });
    const scheduler = JobQueueService.createFresh(
      { url: database.url },
      logger,
    );
    const worker = JobQueueService.createFresh({ url: database.url }, logger);
    const harness = createPluginHarness<Plugin>();
    harness.getMockShell().getJobQueueService = (): JobQueueService =>
      scheduler;
    const type = `${SITE_BUILDER_PLUGIN_ID}:site-build`;

    try {
      const plugin = instantiate({ autoRebuild: true });
      const register = plugin.register.bind(plugin);
      plugin.register = (shell, registration): Promise<PluginCapabilities> =>
        register(shell, { ...registration, executionOnly });
      await harness.installPlugin(plugin);
      await harness.finalizeRegistration();
      worker.registerHandler(type, expectDefined(scheduler.getHandler(type)));
      const wave = async (waveId: string): Promise<void> => {
        await harness.sendMessage(PROJECTION_CHANNELS.waveReady, {
          waveId,
          sourceTypes: ["post"],
          changedTargetTypes: [],
        });
      };

      await wave("first");
      await wave("still-pending");
      expect(await scheduler.getActiveJobs([type])).toHaveLength(1);
      const first = expectDefined(await worker.dequeue());
      expect(first.type).toBe(type);
      expect(first.status).toBe("processing");

      await wave("during-build");
      await wave("coalesced-successor");
      const active = await scheduler.getActiveJobs([type]);
      expect(active.map((job) => job.status).sort()).toEqual([
        "pending",
        "processing",
      ]);
      expect(active.every((job) => job.source === SITE_BUILDER_PLUGIN_ID)).toBe(
        true,
      );

      // Advance queue state on a separate SQLite connection, never invoking
      // scheduler-local start/finish callbacks. Rendering is tested elsewhere.
      expect(
        await worker.complete(first.id, {}, expectDefined(first.attemptId)),
      ).toBe(true);
      const second = expectDefined(await worker.dequeue());
      expect(second.id).not.toBe(first.id);
      expect(
        await worker.complete(second.id, {}, expectDefined(second.attemptId)),
      ).toBe(true);
      await wave("after-worker-completed");
      const third = expectDefined(await worker.dequeue());
      expect(third.id).not.toBe(second.id);
      expect(
        await worker.complete(third.id, {}, expectDefined(third.attemptId)),
      ).toBe(true);
      expect(await scheduler.getActiveJobs([type])).toEqual([]);
    } finally {
      await harness.reset();
      worker.close();
      scheduler.close();
      await database.cleanup();
    }
  },
);
