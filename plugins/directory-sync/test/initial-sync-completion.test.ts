import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { SYSTEM_CHANNELS } from "@brains/plugins";
import { DirectorySyncPlugin } from "../src/plugin";
import { createPluginHarness } from "@brains/plugins/test";
import { baseEntitySchema } from "@brains/plugins/test";
import { join } from "path";
import { tmpdir } from "os";
import { existsSync, rmSync, mkdirSync, writeFileSync, mkdtempSync } from "fs";
import { MockEntityAdapter } from "./fixtures";
import { createTestEntity } from "@brains/test-utils";

describe("DirectorySyncPlugin - Initial Sync Completion", () => {
  let harness: ReturnType<typeof createPluginHarness<DirectorySyncPlugin>>;
  let testRoot: string;
  let syncPath: string;
  let seedContentPath: string;

  beforeEach(async () => {
    testRoot = mkdtempSync(join(tmpdir(), "test-directory-sync-"));
    syncPath = join(testRoot, "brain-data");
    seedContentPath = join(testRoot, "seed-content");
    mkdirSync(syncPath, { recursive: true });
    mkdirSync(join(seedContentPath, "note"), { recursive: true });

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
   * all-plugins-registered signal, and return the collected events array.
   */
  async function installAndTriggerInitialSync(config: {
    seedContent: boolean;
  }): Promise<string[]> {
    const events: string[] = [];

    harness.subscribe(SYSTEM_CHANNELS.initialSyncCompleted, async () => {
      events.push(SYSTEM_CHANNELS.initialSyncCompleted);
      return { success: true };
    });

    const plugin = new DirectorySyncPlugin({
      syncPath,
      seedContent: config.seedContent,
      initialSync: true,
      autoSync: false,
    });

    await harness.installPlugin(plugin);

    await harness.sendMessage(SYSTEM_CHANNELS.pluginsRegistered, {
      timestamp: new Date().toISOString(),
      pluginCount: 1,
    });

    return events;
  }

  it("should emit completion after importing seed content", async () => {
    writeFileSync(
      join(seedContentPath, "note", "test.md"),
      "# Test\n\nTest content",
    );

    const events = await installAndTriggerInitialSync({ seedContent: true });

    expect(events).toContain(SYSTEM_CHANNELS.initialSyncCompleted);
  });

  it("should handle empty sync (no seed content)", async () => {
    const events = await installAndTriggerInitialSync({ seedContent: false });

    expect(events).toContain(SYSTEM_CHANNELS.initialSyncCompleted);
  });

  it("exports a service-created entity whose lifecycle event was previously lost before cleanup", async () => {
    const entityService = harness.getEntityService();
    const entity = createTestEntity("note", {
      id: "service-created-before-directory-sync",
      content: "This durable entity must reach Git before cleanup.",
    });
    await entityService.createEntity({ entity });
    expect(await entityService.listPendingEntityExports()).toHaveLength(1);

    const events = await installAndTriggerInitialSync({ seedContent: false });

    expect(events).toContain(SYSTEM_CHANNELS.initialSyncCompleted);
    expect(
      await entityService.getEntity({
        entityType: "note",
        id: entity.id,
      }),
    ).not.toBeNull();
    expect(existsSync(join(syncPath, `${entity.id}.md`))).toBe(true);
    expect(await entityService.listPendingEntityExports()).toEqual([]);
  });
});
