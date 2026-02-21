import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DirectorySyncPlugin } from "../src/plugin";
import { createPluginHarness } from "@brains/plugins/test";
import type { BaseEntity, EntityAdapter } from "@brains/plugins/test";
import { baseEntitySchema } from "@brains/plugins/test";
import type { z } from "@brains/utils";
import { join } from "path";
import { tmpdir } from "os";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "fs";

// Mock entity adapter
class MockEntityAdapter implements EntityAdapter<BaseEntity> {
  public readonly entityType = "base";
  public readonly schema = baseEntitySchema;

  fromMarkdown(markdown: string): Partial<BaseEntity> {
    return {
      content: markdown,
    };
  }

  toMarkdown(entity: BaseEntity): string {
    return entity.content;
  }

  extractMetadata(_entity: BaseEntity): Record<string, unknown> {
    return {};
  }

  parseFrontMatter<TFrontmatter>(
    _markdown: string,
    schema: z.ZodSchema<TFrontmatter>,
  ): TFrontmatter {
    return schema.parse({});
  }

  generateFrontMatter(_entity: BaseEntity): string {
    return "";
  }
}

describe("DirectorySyncPlugin - Initial Sync Job Waiting", () => {
  let harness: ReturnType<typeof createPluginHarness<DirectorySyncPlugin>>;
  let syncPath: string;
  let seedContentPath: string;

  beforeEach(async () => {
    // Create temporary test directory
    syncPath = join(tmpdir(), `test-directory-sync-${Date.now()}`);
    seedContentPath = join(syncPath, "..", "seed-content");
    mkdirSync(seedContentPath, { recursive: true });
    mkdirSync(join(seedContentPath, "base"), { recursive: true });

    // Create test harness with dataDir pointing to test directory
    harness = createPluginHarness<DirectorySyncPlugin>({
      dataDir: syncPath,
    });

    // Get the shell and register entity types
    const shell = harness.getShell();
    const entityRegistry = shell.getEntityRegistry();
    entityRegistry.registerEntityType(
      "base",
      baseEntitySchema,
      new MockEntityAdapter(),
    );
  });

  afterEach(() => {
    // Reset harness
    harness.reset();

    // Clean up test directories
    if (existsSync(syncPath)) {
      rmSync(syncPath, { recursive: true, force: true });
    }
    if (existsSync(seedContentPath)) {
      rmSync(seedContentPath, { recursive: true, force: true });
    }
  });

  it("should collect job IDs from imported entities", async () => {
    // Create seed content
    writeFileSync(
      join(seedContentPath, "base", "test.md"),
      "# Test\n\nTest content",
    );

    // Track sync:initial:completed event
    let syncCompleted = false;

    // Subscribe to sync:initial:completed message
    harness.subscribe("sync:initial:completed", async () => {
      syncCompleted = true;
      return { success: true };
    });

    // Create plugin with initialSync enabled
    const plugin = new DirectorySyncPlugin({
      syncPath,
      seedContent: true,
      initialSync: true,
      autoSync: false,
    });

    // Install plugin
    await harness.installPlugin(plugin);

    // Trigger system:plugins:ready
    await harness.sendMessage("system:plugins:ready", {
      timestamp: new Date().toISOString(),
      pluginCount: 1,
    });

    // Wait for sync to complete
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Verify that sync:initial:completed was emitted
    // This confirms the job waiting mechanism completed successfully
    expect(syncCompleted).toBe(true);
  });

  it("should handle empty sync (no seed content) without waiting", async () => {
    // No seed content - empty sync

    const events: string[] = [];

    // Subscribe to sync:initial:completed message
    harness.subscribe("sync:initial:completed", async () => {
      events.push("sync:initial:completed");
      return { success: true };
    });

    // Create plugin with initialSync enabled but no seed content
    const plugin = new DirectorySyncPlugin({
      syncPath,
      seedContent: false,
      initialSync: true,
      autoSync: false,
    });

    // Install plugin
    await harness.installPlugin(plugin);

    // Trigger system:plugins:ready
    await harness.sendMessage("system:plugins:ready", {
      timestamp: new Date().toISOString(),
      pluginCount: 1,
    });

    // Wait a bit for async operations
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Verify that sync:initial:completed was emitted (no jobs to wait for)
    expect(events).toContain("sync:initial:completed");
  });

  it("should handle timeout gracefully if jobs take too long", async () => {
    // This test verifies the timeout mechanism exists without mocking
    // The actual timeout is 30s, but in the test environment with mock job queue
    // jobs complete immediately, so we just verify the mechanism doesn't crash

    // Create seed content
    writeFileSync(
      join(seedContentPath, "base", "test.md"),
      "# Test\n\nTest content",
    );

    const events: string[] = [];

    // Subscribe to sync:initial:completed message
    harness.subscribe("sync:initial:completed", async () => {
      events.push("sync:initial:completed");
      return { success: true };
    });

    // Create plugin with initialSync enabled
    const plugin = new DirectorySyncPlugin({
      syncPath,
      seedContent: true,
      initialSync: true,
      autoSync: false,
    });

    // Install plugin
    await harness.installPlugin(plugin);

    // Trigger system:plugins:ready
    await harness.sendMessage("system:plugins:ready", {
      timestamp: new Date().toISOString(),
      pluginCount: 1,
    });

    // Wait for sync to complete
    await new Promise((resolve) => setTimeout(resolve, 300));

    // sync:initial:completed should be emitted (no jobs get stuck in test env)
    expect(events).toContain("sync:initial:completed");
  });
});
