import { createTestEntity } from "@brains/entity-service/test";
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { SYSTEM_CHANNELS } from "@brains/plugins";
import { DirectorySyncPlugin } from "../src/plugin";
import { baseEntitySchema, createPluginHarness } from "@brains/plugins/test";
import { join } from "path";
import { tmpdir } from "os";
import { existsSync, rmSync, mkdirSync, writeFileSync, mkdtempSync } from "fs";
import { MockEntityAdapter } from "./fixtures";

describe("DirectorySyncPlugin - Initial Sync Completion", () => {
  let harness: ReturnType<typeof createPluginHarness<DirectorySyncPlugin>>;
  let testRoot: string;
  let syncPath: string;

  beforeEach(async () => {
    testRoot = mkdtempSync(join(tmpdir(), "test-directory-sync-"));
    syncPath = join(testRoot, "brain-data");
    mkdirSync(syncPath, { recursive: true });

    harness = createPluginHarness<DirectorySyncPlugin>({ dataDir: syncPath });

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
   * events array. The harness's batches report as completed when asked.
   */
  async function installAndTriggerInitialSync(): Promise<{
    plugin: DirectorySyncPlugin;
    events: string[];
  }> {
    const events: string[] = [];

    harness.subscribe(SYSTEM_CHANNELS.initialSyncCompleted, async () => {
      events.push(SYSTEM_CHANNELS.initialSyncCompleted);
      return { success: true };
    });

    const plugin = new DirectorySyncPlugin({
      syncPath,
      initialSync: true,
      autoSync: false,
    });

    await harness.installPlugin(plugin);

    await harness.sendMessage(SYSTEM_CHANNELS.pluginsRegistered, {
      timestamp: new Date().toISOString(),
      pluginCount: 1,
    });
    await Bun.sleep(0);

    return { plugin, events };
  }

  it("queues the content's import instead of importing it, and completes with its batch", async () => {
    mkdirSync(join(syncPath, "note"), { recursive: true });
    writeFileSync(join(syncPath, "note", "test.md"), "# Test\n\nTest content");

    const { events } = await installAndTriggerInitialSync();

    expect(events).toContain(SYSTEM_CHANNELS.initialSyncCompleted);
    expect(
      await harness
        .getEntityService()
        .getEntity({ entityType: "note", id: "test" }),
    ).toBeNull();
  });

  it("should handle empty sync (no seed content)", async () => {
    const { events } = await installAndTriggerInitialSync();

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

    const { plugin, events } = await installAndTriggerInitialSync();
    await plugin.ready();

    expect(events).toContain(SYSTEM_CHANNELS.initialSyncCompleted);
    expect(existsSync(join(syncPath, `${entity.id}.md`))).toBe(true);
    expect(await entityService.listPendingEntityExports()).toEqual([]);
  });
});
