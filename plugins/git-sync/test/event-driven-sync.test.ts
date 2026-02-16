import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { GitSyncPlugin } from "../src/plugin";
import { createServicePluginHarness } from "@brains/plugins/test";
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import simpleGit from "simple-git";

/**
 * Tests for event-driven commit/push behavior.
 *
 * When entity events (entity:created, entity:updated, entity:deleted) fire,
 * git-sync should debounce and then commit + push changes automatically.
 */
describe("Event-Driven Commit/Push", () => {
  let harness: ReturnType<typeof createServicePluginHarness>;
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

    harness = createServicePluginHarness({ dataDir: testDir });

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

  describe("Debounced commit on entity:created", () => {
    it("should commit changes after debounce when entity:created fires", async () => {
      const git = simpleGit(testDir);

      // Create a file (simulating directory-sync writing an entity)
      mkdirSync(join(testDir, "post"), { recursive: true });
      writeFileSync(
        join(testDir, "post", "test-post.md"),
        "---\ntitle: Test Post\n---\n\nContent",
      );

      // Fire entity:created event
      await harness.sendMessage("entity:created", {
        entityType: "post",
        entityId: "test-post",
      });

      // Wait for debounce (100ms) + processing time
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify file was committed
      const status = await git.status();
      expect(status.isClean()).toBe(true);

      // Verify commit exists
      const log = await git.log();
      expect(log.all.length).toBeGreaterThan(1); // Initial commit + auto-commit
    });
  });

  describe("Debounced commit on entity:updated", () => {
    it("should commit changes after debounce when entity:updated fires", async () => {
      const git = simpleGit(testDir);

      // Create and commit a file first
      mkdirSync(join(testDir, "post"), { recursive: true });
      writeFileSync(
        join(testDir, "post", "existing.md"),
        "---\ntitle: Old\n---\n\nOld content",
      );
      await git.add("-A");
      await git.commit("seed file");

      // Modify the file (simulating directory-sync updating an entity)
      writeFileSync(
        join(testDir, "post", "existing.md"),
        "---\ntitle: Updated\n---\n\nNew content",
      );

      // Fire entity:updated event
      await harness.sendMessage("entity:updated", {
        entityType: "post",
        entityId: "existing",
      });

      // Wait for debounce + processing
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify file was committed
      const status = await git.status();
      expect(status.isClean()).toBe(true);
    });
  });

  describe("Debounced commit on entity:deleted", () => {
    it("should commit deletions after debounce when entity:deleted fires", async () => {
      const git = simpleGit(testDir);

      // Create and commit a file first
      mkdirSync(join(testDir, "note"), { recursive: true });
      writeFileSync(
        join(testDir, "note", "to-delete.md"),
        "---\ntitle: Delete Me\n---\n",
      );
      await git.add("-A");
      await git.commit("seed file for deletion");

      // Delete the file (simulating directory-sync deleting an entity)
      rmSync(join(testDir, "note", "to-delete.md"));

      // Fire entity:deleted event
      await harness.sendMessage("entity:deleted", {
        entityType: "note",
        entityId: "to-delete",
      });

      // Wait for debounce + processing
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify deletion was committed
      const status = await git.status();
      expect(status.isClean()).toBe(true);
    });
  });

  describe("Debounce batching", () => {
    it("should batch multiple entity events into a single commit", async () => {
      const git = simpleGit(testDir);

      // Get commit count before
      const logBefore = await git.log();
      const commitCountBefore = logBefore.all.length;

      // Create multiple files rapidly
      mkdirSync(join(testDir, "post"), { recursive: true });
      writeFileSync(
        join(testDir, "post", "post-1.md"),
        "---\ntitle: Post 1\n---\n",
      );
      await harness.sendMessage("entity:created", {
        entityType: "post",
        entityId: "post-1",
      });

      writeFileSync(
        join(testDir, "post", "post-2.md"),
        "---\ntitle: Post 2\n---\n",
      );
      await harness.sendMessage("entity:created", {
        entityType: "post",
        entityId: "post-2",
      });

      writeFileSync(
        join(testDir, "post", "post-3.md"),
        "---\ntitle: Post 3\n---\n",
      );
      await harness.sendMessage("entity:created", {
        entityType: "post",
        entityId: "post-3",
      });

      // Wait for single debounced commit
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Should have exactly one new commit (not three)
      const logAfter = await git.log();
      expect(logAfter.all.length).toBe(commitCountBefore + 1);

      // All three files should be in that commit
      const status = await git.status();
      expect(status.isClean()).toBe(true);
    });
  });

  describe("Auto-push after commit", () => {
    it("should push to remote after committing", async () => {
      // Create a file and trigger event
      mkdirSync(join(testDir, "note"), { recursive: true });
      writeFileSync(
        join(testDir, "note", "pushed.md"),
        "---\ntitle: Pushed\n---\n",
      );

      await harness.sendMessage("entity:created", {
        entityType: "note",
        entityId: "pushed",
      });

      // Wait for debounce + commit + push
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Verify pushed to remote by cloning into a new directory
      const verifyDir = join(tmpdir(), `verify-push-${Date.now()}`);
      mkdirSync(verifyDir, { recursive: true });
      await simpleGit(verifyDir).clone(remoteDir, ".", ["--branch", "main"]);

      expect(existsSync(join(verifyDir, "note", "pushed.md"))).toBe(true);

      // Cleanup
      rmSync(verifyDir, { recursive: true, force: true });
    });
  });

  describe("No-op when no changes", () => {
    it("should not commit when there are no actual file changes", async () => {
      const git = simpleGit(testDir);

      const logBefore = await git.log();
      const commitCountBefore = logBefore.all.length;

      // Fire entity event without any file changes
      await harness.sendMessage("entity:updated", {
        entityType: "post",
        entityId: "nonexistent",
      });

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Should NOT have created a new commit
      const logAfter = await git.log();
      expect(logAfter.all.length).toBe(commitCountBefore);
    });
  });

  describe("Concurrency guard", () => {
    it("should have a syncing guard in the implementation", () => {
      const source = readFileSync(join(__dirname, "../src/plugin.ts"), "utf-8");

      // Should have a syncing flag
      expect(source).toContain("syncing");
    });
  });

  describe("Cleanup on unregister", () => {
    it("should have cleanup logic for commit timeout", () => {
      const source = readFileSync(join(__dirname, "../src/plugin.ts"), "utf-8");

      // onUnregister should clear the commit timeout
      expect(source).toContain("commitTimeout");
      expect(source).toContain("clearTimeout");
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
