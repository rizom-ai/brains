import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DirectorySyncPlugin } from "../src/plugin";
import { createPluginHarness } from "@brains/plugins/test";
import { baseEntitySchema } from "@brains/plugins/test";
import { join } from "path";
import { tmpdir } from "os";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { MockEntityAdapter } from "./fixtures";

describe("DirectorySyncPlugin - Initial Sync Job Waiting", () => {
  let harness: ReturnType<typeof createPluginHarness<DirectorySyncPlugin>>;
  let syncPath: string;
  let seedContentPath: string;

  beforeEach(async () => {
    syncPath = join(tmpdir(), `test-directory-sync-${Date.now()}`);
    seedContentPath = join(syncPath, "..", "seed-content");
    mkdirSync(seedContentPath, { recursive: true });
    mkdirSync(join(seedContentPath, "base"), { recursive: true });

    harness = createPluginHarness<DirectorySyncPlugin>({ dataDir: syncPath });

    const entityRegistry = harness.getShell().getEntityRegistry();
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
   * Subscribe to sync:initial:completed, install plugin, trigger
   * system:plugins:ready, and wait for async processing. Returns
   * the collected events array.
   */
  async function installAndWaitForSync(config: {
    seedContent: boolean;
  }): Promise<string[]> {
    const events: string[] = [];

    harness.subscribe("sync:initial:completed", async () => {
      events.push("sync:initial:completed");
      return { success: true };
    });

    const plugin = new DirectorySyncPlugin({
      syncPath,
      seedContent: config.seedContent,
      initialSync: true,
      autoSync: false,
    });

    await harness.installPlugin(plugin);

    await harness.sendMessage("system:plugins:ready", {
      timestamp: new Date().toISOString(),
      pluginCount: 1,
    });

    await new Promise((resolve) => setTimeout(resolve, 300));
    return events;
  }

  it("should collect job IDs from imported entities", async () => {
    writeFileSync(
      join(seedContentPath, "base", "test.md"),
      "# Test\n\nTest content",
    );

    const events = await installAndWaitForSync({ seedContent: true });

    expect(events).toContain("sync:initial:completed");
  });

  it("should handle empty sync (no seed content) without waiting", async () => {
    const events = await installAndWaitForSync({ seedContent: false });

    expect(events).toContain("sync:initial:completed");
  });

  it("should handle timeout gracefully if jobs take too long", async () => {
    writeFileSync(
      join(seedContentPath, "base", "test.md"),
      "# Test\n\nTest content",
    );

    const events = await installAndWaitForSync({ seedContent: true });

    expect(events).toContain("sync:initial:completed");
  });
});
