import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { GitSyncPlugin } from "../src/plugin";
import { createPluginHarness } from "@brains/plugins/test";
import { mkdirSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import simpleGit from "simple-git";

/**
 * Tests for event-driven sync behavior.
 *
 * When entity events (entity:created, entity:updated, entity:deleted) fire,
 * git-sync should debounce and then enqueue a sync job.
 */
describe("Event-Driven Commit/Push", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let testDir: string;
  let remoteDir: string;
  let plugin: GitSyncPlugin;

  beforeEach(async () => {
    testDir = join(tmpdir(), `test-event-sync-${Date.now()}`);
    remoteDir = join(tmpdir(), `test-event-remote-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    mkdirSync(remoteDir, { recursive: true });

    // Initialize bare remote
    await simpleGit(remoteDir).init(true);

    harness = createPluginHarness({ dataDir: testDir });

    // Mock directory-sync responses
    harness.subscribe("entity:import:request", async () => {
      return { success: true, data: { entityIds: [], errors: [] } };
    });

    plugin = new GitSyncPlugin({
      enabled: true,
      repo: "test/event-sync",
      gitUrl: remoteDir,
      branch: "main",
      autoSync: false,
      syncInterval: 30,
      commitDebounce: 100, // Short debounce for testing
    });

    await harness.installPlugin(plugin);
  });

  afterEach(() => {
    harness.reset();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    if (existsSync(remoteDir)) {
      rmSync(remoteDir, { recursive: true, force: true });
    }
  });

  describe("Entity event subscriptions", () => {
    it("should subscribe to entity:created, entity:updated, and entity:deleted", () => {
      const source = readFileSync(join(__dirname, "../src/plugin.ts"), "utf-8");

      expect(source).toContain('"entity:created"');
      expect(source).toContain('"entity:updated"');
      expect(source).toContain('"entity:deleted"');
    });
  });

  describe("Debounced sync on entity:created", () => {
    it("should trigger requestSync when entity:created fires", async () => {
      const spy = mock(() => {});
      const original = plugin.requestSync.bind(plugin);
      plugin.requestSync = (): void => {
        original();
        spy();
      };

      await harness.sendMessage("entity:created", {
        entityType: "post",
        entityId: "test-post",
      });

      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe("Debounced sync on entity:updated", () => {
    it("should trigger requestSync when entity:updated fires", async () => {
      const spy = mock(() => {});
      const original = plugin.requestSync.bind(plugin);
      plugin.requestSync = (): void => {
        original();
        spy();
      };

      await harness.sendMessage("entity:updated", {
        entityType: "post",
        entityId: "existing",
      });

      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe("Debounced sync on entity:deleted", () => {
    it("should trigger requestSync when entity:deleted fires", async () => {
      const spy = mock(() => {});
      const original = plugin.requestSync.bind(plugin);
      plugin.requestSync = (): void => {
        original();
        spy();
      };

      await harness.sendMessage("entity:deleted", {
        entityType: "note",
        entityId: "to-delete",
      });

      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe("Debounce batching", () => {
    it("should batch multiple entity events through the same debounce", async () => {
      const spy = mock(() => {});
      const original = plugin.requestSync.bind(plugin);
      plugin.requestSync = (): void => {
        original();
        spy();
      };

      // Fire 3 events rapidly
      await harness.sendMessage("entity:created", {
        entityType: "post",
        entityId: "post-1",
      });
      await harness.sendMessage("entity:created", {
        entityType: "post",
        entityId: "post-2",
      });
      await harness.sendMessage("entity:created", {
        entityType: "post",
        entityId: "post-3",
      });

      // All 3 events should call requestSync (the debounce inside handles batching)
      expect(spy).toHaveBeenCalledTimes(3);
    });
  });

  describe("No-op when no changes", () => {
    it("should still trigger requestSync even without file changes", async () => {
      const spy = mock(() => {});
      const original = plugin.requestSync.bind(plugin);
      plugin.requestSync = (): void => {
        original();
        spy();
      };

      // Fire entity event without any file changes
      await harness.sendMessage("entity:updated", {
        entityType: "post",
        entityId: "nonexistent",
      });

      // requestSync is called — the SyncJobHandler handles the no-op check
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe("Concurrency guard", () => {
    it("should use LeadingTrailingDebounce for sync deduplication", () => {
      const source = readFileSync(join(__dirname, "../src/plugin.ts"), "utf-8");

      expect(source).toContain("LeadingTrailingDebounce");
      expect(source).toContain("syncDebounce");
    });
  });

  describe("Cleanup on unregister", () => {
    it("should have cleanup logic for sync debounce", () => {
      const source = readFileSync(join(__dirname, "../src/plugin.ts"), "utf-8");

      expect(source).toContain("syncDebounce");
      expect(source).toContain("dispose");
    });
  });
});

describe("AutoSync Pull-Only", () => {
  it("should call pull() instead of sync() in startAutoSync", () => {
    const source = readFileSync(
      join(__dirname, "../src/lib/git-sync.ts"),
      "utf-8",
    );

    // The auto-sync timer should call pull, not sync
    // Look for the pattern: the setInterval callback should reference pull
    // and NOT call this.sync() inside the timer
    const autoSyncSection = source.substring(
      source.indexOf("startAutoSync"),
      source.indexOf("stopAutoSync"),
    );

    expect(autoSyncSection).toContain("pull");
    // Should not call full sync in the timer
    expect(autoSyncSection).not.toContain("this.sync()");
  });
});
