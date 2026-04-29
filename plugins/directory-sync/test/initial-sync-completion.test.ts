import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { SYSTEM_CHANNELS } from "@brains/plugins";
import { DirectorySyncPlugin } from "../src/plugin";
import { createPluginHarness } from "@brains/plugins/test";
import { baseEntitySchema } from "@brains/plugins/test";
import { join } from "path";
import { tmpdir } from "os";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { MockEntityAdapter } from "./fixtures";

describe("DirectorySyncPlugin - Initial Sync Completion", () => {
  let harness: ReturnType<typeof createPluginHarness<DirectorySyncPlugin>>;
  let syncPath: string;
  let seedContentPath: string;

  beforeEach(async () => {
    syncPath = join(tmpdir(), `test-directory-sync-${Date.now()}`);
    seedContentPath = join(syncPath, "..", "seed-content");
    mkdirSync(seedContentPath, { recursive: true });
    mkdirSync(join(seedContentPath, "base"), { recursive: true });

    harness = createPluginHarness<DirectorySyncPlugin>({ dataDir: syncPath });

    const entityRegistry = harness.getEntityRegistry();
    entityRegistry.registerEntityType(
      "base",
      baseEntitySchema,
      new MockEntityAdapter(),
    );
  });

  afterEach(() => {
    harness.reset();
    if (existsSync(syncPath)) {
      rmSync(syncPath, { recursive: true, force: true });
    }
    if (existsSync(seedContentPath)) {
      rmSync(seedContentPath, { recursive: true, force: true });
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
      join(seedContentPath, "base", "test.md"),
      "# Test\n\nTest content",
    );

    const events = await installAndTriggerInitialSync({ seedContent: true });

    expect(events).toContain(SYSTEM_CHANNELS.initialSyncCompleted);
  });

  it("should handle empty sync (no seed content)", async () => {
    const events = await installAndTriggerInitialSync({ seedContent: false });

    expect(events).toContain(SYSTEM_CHANNELS.initialSyncCompleted);
  });
});
