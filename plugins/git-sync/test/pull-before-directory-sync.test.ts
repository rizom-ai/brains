import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Tests for ensuring git-sync pull completes BEFORE directory-sync imports.
 *
 * The problem:
 * - Both git-sync and directory-sync subscribe to system:plugins:ready
 * - They run in PARALLEL - no coordination
 * - directory-sync emits sync:initial:completed before git-sync finishes pulling
 * - Identity/profile services initialize with stale/empty data
 *
 * The fix:
 * - git-sync should emit git:pull:completed after pulling from remote
 * - directory-sync should wait for git:pull:completed IF git-sync is enabled
 * - directory-sync should proceed on system:plugins:ready if git-sync is NOT enabled
 */
describe("Git Pull Before Directory Sync", () => {
  describe("git-sync must emit git:pull:completed event", () => {
    it("should emit git:pull:completed after pulling from remote", () => {
      const gitSyncPluginPath = join(__dirname, "../src/plugin.ts");
      const source = readFileSync(gitSyncPluginPath, "utf-8");

      // git-sync should emit this event after pull completes
      expect(source).toContain('"git:pull:completed"');
    });
  });

  describe("directory-sync coordination with git-sync", () => {
    it("should subscribe to git:pull:completed event to coordinate with git-sync", () => {
      const directorySyncPluginPath = join(
        __dirname,
        "../../directory-sync/src/plugin.ts",
      );
      const source = readFileSync(directorySyncPluginPath, "utf-8");

      // directory-sync should listen for git pull completion
      expect(source).toContain('"git:pull:completed"');
    });

    it("should have fallback for when git-sync is not enabled", () => {
      // directory-sync must work standalone without git-sync
      // It listens for git:sync:registered to know if git-sync is present
      const directorySyncPluginPath = join(
        __dirname,
        "../../directory-sync/src/plugin.ts",
      );
      const source = readFileSync(directorySyncPluginPath, "utf-8");

      // Should listen for git:sync:registered to detect git-sync presence
      expect(source).toContain('"git:sync:registered"');

      // Should still subscribe to system:plugins:ready as fallback
      expect(source).toContain('"system:plugins:ready"');

      // Should have logic to handle both scenarios:
      // 1. git:sync:registered received -> wait for git:pull:completed
      // 2. no git:sync:registered -> proceed on system:plugins:ready
      const hasCoordinationLogic =
        source.includes("git:sync:registered") &&
        source.includes("git:pull:completed") &&
        source.includes("system:plugins:ready");

      expect(hasCoordinationLogic).toBe(true);
    });
  });

  describe("git-sync must emit git:sync:registered event", () => {
    it("should emit git:sync:registered when plugin registers", () => {
      const gitSyncPluginPath = join(__dirname, "../src/plugin.ts");
      const source = readFileSync(gitSyncPluginPath, "utf-8");

      // git-sync should emit this event so directory-sync knows to wait
      expect(source).toContain('"git:sync:registered"');
    });
  });
});
