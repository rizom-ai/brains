import { createTestEntity } from "@brains/entity-service/test";
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { JOB_CHANNELS } from "@brains/contracts";
import { SYSTEM_CHANNELS } from "@brains/plugins";
import type { Plugin } from "@brains/plugins";
import { instantiate } from "./helpers/install";
import { baseEntitySchema, createPluginHarness } from "@brains/plugins/test";
import { join } from "path";
import { tmpdir } from "os";
import { existsSync, rmSync, mkdirSync, writeFileSync, mkdtempSync } from "fs";
import { MockEntityAdapter } from "./fixtures";

describe("Plugin - Initial Sync Completion", () => {
  let harness: ReturnType<typeof createPluginHarness<Plugin>>;
  let testRoot: string;
  let syncPath: string;

  beforeEach(async () => {
    testRoot = mkdtempSync(join(tmpdir(), "test-directory-sync-"));
    syncPath = join(testRoot, "brain-data");
    mkdirSync(syncPath, { recursive: true });

    harness = createPluginHarness({ dataDir: syncPath });

    const entityRegistry = harness.getEntityRegistry();
    entityRegistry.registerEntityType(
      "note",
      baseEntitySchema,
      new MockEntityAdapter(),
    );
  });

  afterEach(async () => {
    await harness.reset();
    if (existsSync(testRoot)) {
      rmSync(testRoot, { recursive: true, force: true });
    }
  });

  /**
   * Subscribe to sync:initial:completed, install plugin, send the internal
   * all-plugins-registered signal, and return the plugin and the collected
   * events array. This harness has no worker; settling explicitly marks its
   * queued children terminal and publishes the corresponding progress.
   */
  async function installAndTriggerInitialSync(): Promise<{
    plugin: Plugin;
    events: string[];
    settle(): Promise<void>;
  }> {
    const events: string[] = [];

    harness.subscribe(SYSTEM_CHANNELS.initialSyncCompleted, async () => {
      events.push(SYSTEM_CHANNELS.initialSyncCompleted);
      return { success: true };
    });

    const { plugin } = instantiate({
      syncPath,
      initialSync: true,
      autoSync: false,
    });

    await harness.installPlugin(plugin);

    await harness.sendMessage(SYSTEM_CHANNELS.pluginsRegistered, {
      timestamp: new Date().toISOString(),
      pluginCount: 1,
    });
    const settle = async (): Promise<void> => {
      const jobs = await harness
        .getMockShell()
        .getJobQueueService()
        .getActiveJobs();
      const roots = new Set<string>();
      for (const job of jobs) {
        job.status = "completed";
        roots.add(job.metadata.rootJobId);
      }
      for (const id of roots) {
        await harness.sendMessage(
          JOB_CHANNELS.progress,
          { id, type: "batch", status: "completed" },
          "queue",
          true,
        );
      }
    };
    return { plugin, events, settle };
  }

  it("queues the content's import instead of importing it, and completes with its batch", async () => {
    mkdirSync(join(syncPath, "note"), { recursive: true });
    writeFileSync(join(syncPath, "note", "test.md"), "# Test\n\nTest content");

    const { events, settle } = await installAndTriggerInitialSync();
    expect(events).toEqual([]);
    await settle();
    expect(events).toContain(SYSTEM_CHANNELS.initialSyncCompleted);
    expect(
      await harness
        .getEntityService()
        .getEntity({ entityType: "note", id: "test" }),
    ).toBeNull();
  });

  it("should handle empty sync (no seed content)", async () => {
    const { events, settle } = await installAndTriggerInitialSync();
    await settle();
    expect(events).toContain(SYSTEM_CHANNELS.initialSyncCompleted);
  });

  it("exports a service-created entity whose lifecycle event was previously lost", async () => {
    const entityService = harness.getEntityService();
    const entity = createTestEntity("note", {
      id: "service-created-before-directory-sync",
      content: "This durable entity must reach Git before cleanup.",
    });
    await entityService.createEntity({ entity });
    expect(await entityService.listPendingEntityExports()).toHaveLength(1);

    const { plugin, events, settle } = await installAndTriggerInitialSync();
    await plugin.ready?.();
    await settle();

    expect(events).toContain(SYSTEM_CHANNELS.initialSyncCompleted);
    expect(existsSync(join(syncPath, `${entity.id}.md`))).toBe(true);
    expect(await entityService.listPendingEntityExports()).toEqual([]);
  });
});
