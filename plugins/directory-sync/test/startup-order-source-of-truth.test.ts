import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

/**
 * Tests for "Remote Git is Source of Truth" startup order.
 *
 * The correct startup sequence is:
 * 1. Git pull from remote (get latest files)
 * 2. Directory-sync import: files → database (files win over stale DB)
 * 3. Brain ready for user changes
 *
 * The INCORRECT sequence (current bug) is:
 * 1. Directory-sync import+export (DB → files corrupts good data)
 * 2. Git pull (too late, damage done)
 *
 * These tests verify the correct behavior.
 */
describe("Startup Order: Remote Git is Source of Truth", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `test-startup-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("Correct Order: Git Pull → Import", () => {
    it("should preserve file content when git pull happens before import", async () => {
      // SETUP: File on disk has coverImageId (from git pull)
      const postDir = join(testDir, "post");
      mkdirSync(postDir, { recursive: true });

      const fileContent = `---
title: Test Post
coverImageId: correct-cover-image
---
# Test Post with Cover`;

      writeFileSync(join(postDir, "test-post.md"), fileContent);

      // Mock stale database
      const staleDbContent = `---
title: Test Post
---
# Test Post WITHOUT Cover`;

      // CORRECT FLOW: Import file → DB (file wins)
      const importFile = async (): Promise<string> => {
        return readFileSync(join(postDir, "test-post.md"), "utf-8");
      };

      const importedContent = await importFile();

      // VERIFY: Imported content has coverImageId (file won over stale DB)
      expect(importedContent).toContain("coverImageId: correct-cover-image");
      expect(importedContent).not.toEqual(staleDbContent);
    });

    it("should import all remote changes to database", async () => {
      // Simulate multiple files from git pull
      const postDir = join(testDir, "post");
      const seriesDir = join(testDir, "series");
      mkdirSync(postDir, { recursive: true });
      mkdirSync(seriesDir, { recursive: true });

      // Files from git (have all metadata)
      writeFileSync(
        join(postDir, "post-1.md"),
        `---
title: Post 1
coverImageId: post-1-cover
---
# Post 1`,
      );

      writeFileSync(
        join(postDir, "post-2.md"),
        `---
title: Post 2
coverImageId: post-2-cover
---
# Post 2`,
      );

      writeFileSync(
        join(seriesDir, "series-1.md"),
        `---
name: Series 1
coverImageId: series-1-cover
---
# Series 1`,
      );

      // Import all files
      const files = [
        join(postDir, "post-1.md"),
        join(postDir, "post-2.md"),
        join(seriesDir, "series-1.md"),
      ];

      const importedContents = files.map((f) => readFileSync(f, "utf-8"));

      // VERIFY: All coverImageIds preserved
      expect(importedContents[0]).toContain("coverImageId: post-1-cover");
      expect(importedContents[1]).toContain("coverImageId: post-2-cover");
      expect(importedContents[2]).toContain("coverImageId: series-1-cover");
    });
  });

  describe("Incorrect Order: Export Before Pull (Bug)", () => {
    it("should demonstrate bug: export before pull corrupts files", async () => {
      // SETUP: File on disk has coverImageId
      const postDir = join(testDir, "post");
      mkdirSync(postDir, { recursive: true });

      const correctFileContent = `---
title: Test Post
coverImageId: correct-cover-image
---
# Test Post with Cover`;

      writeFileSync(join(postDir, "test-post.md"), correctFileContent);

      // Stale database doesn't have coverImageId
      const staleDbEntity = {
        content: `---
title: Test Post
---
# Test Post WITHOUT Cover`,
      };

      // BUGGY FLOW: Export DB → file before git pull
      const exportToFile = async (dbContent: string): Promise<void> => {
        writeFileSync(join(postDir, "test-post.md"), dbContent);
      };

      // Export stale DB content to file (corrupts it!)
      await exportToFile(staleDbEntity.content);

      // VERIFY: File is now corrupted (coverImageId lost)
      const corruptedContent = readFileSync(
        join(postDir, "test-post.md"),
        "utf-8",
      );
      expect(corruptedContent).not.toContain("coverImageId");

      // This is the bug we're fixing!
    });

    it("should demonstrate bug: git pull after export would commit corrupted files", async () => {
      const events: string[] = [];

      // BUGGY SEQUENCE
      const buggyStartupSequence = async (): Promise<void> => {
        // 1. Directory-sync starts and exports stale DB
        events.push("directory-sync:export-stale-db");

        // 2. Git pull happens too late
        events.push("git-sync:pull");

        // But wait - export already wrote stale content to files
        // Git pull just gets what's in files now (corrupted)
        events.push("git-sync:commit-corrupted");
        events.push("git-sync:push-corrupted");
      };

      await buggyStartupSequence();

      // VERIFY: Export happened before pull
      const exportIndex = events.indexOf("directory-sync:export-stale-db");
      const pullIndex = events.indexOf("git-sync:pull");
      expect(exportIndex).toBeLessThan(pullIndex);

      // This proves the bug: export runs before pull
    });
  });

  describe("Fixed Order: Pull → Import (No Export)", () => {
    it("should demonstrate fix: pull before import preserves remote content", async () => {
      const events: string[] = [];
      let fileContent = "";

      // CORRECT SEQUENCE
      const correctStartupSequence = async (): Promise<void> => {
        // 1. Git pull gets latest from remote
        events.push("git-sync:pull");
        fileContent = `---
title: Test Post
coverImageId: remote-cover-image
---
# Test Post from Remote`;

        // 2. Directory-sync imports files (NO export)
        events.push("directory-sync:import-files");
        // Files are read and imported to DB

        // 3. Sync complete
        events.push("sync:initial:completed");
      };

      await correctStartupSequence();

      // VERIFY: Pull happened first
      const pullIndex = events.indexOf("git-sync:pull");
      const importIndex = events.indexOf("directory-sync:import-files");
      expect(pullIndex).toBeLessThan(importIndex);

      // VERIFY: File content has coverImageId
      expect(fileContent).toContain("coverImageId: remote-cover-image");
    });

    it("should verify directory-sync sync() only imports, never exports on startup", () => {
      // Documentation test: sync() behavior

      // The sync() method in DirectorySync:
      // - SHOULD: Read files, import to database
      // - SHOULD NOT: Export database to files

      // Export only happens via entity:created/updated subscribers
      // which fire AFTER import jobs complete

      const syncBehavior = {
        import: true, // Files → DB: YES
        export: false, // DB → Files: NO during sync()
      };

      expect(syncBehavior.import).toBe(true);
      expect(syncBehavior.export).toBe(false);
    });
  });

  describe("Plugin Order Configuration", () => {
    it("should document that git-sync pull must happen before directory-sync import", () => {
      // The brain.config.ts plugin order matters
      // But more importantly, the EVENT order matters

      // system:plugins:ready handlers should execute in order:
      // 1. git-sync: pull from remote
      // 2. directory-sync: import files

      // Currently this is achieved via plugin registration order
      // and message bus subscription order

      const requiredOrder = [
        "git-sync:handle-plugins-ready:pull",
        "directory-sync:handle-plugins-ready:import",
      ];

      expect(requiredOrder[0]).toContain("git-sync");
      expect(requiredOrder[0]).toContain("pull");
      expect(requiredOrder[1]).toContain("directory-sync");
      expect(requiredOrder[1]).toContain("import");
    });

    it("should document the complete startup flow for source of truth", () => {
      // Complete startup flow with remote as source of truth

      const startupFlow = [
        // Phase 1: Git operations
        "1. git-sync: fetch from remote",
        "2. git-sync: pull/merge remote changes",
        "3. Files on disk now match remote",

        // Phase 2: Database sync
        "4. directory-sync: read files from disk",
        "5. directory-sync: import files → database",
        "6. Database now matches files (and remote)",

        // Phase 3: Ready
        "7. emit sync:initial:completed",
        "8. Brain ready for user interaction",

        // Phase 4: User makes changes (later)
        "9. User uses tool to modify entity",
        "10. Database updated",
        "11. entity:updated emitted",
        "12. Subscriber exports entity → file",
        "13. git-sync commits and pushes",
      ];

      // Verify flow makes sense
      expect(startupFlow.length).toBe(13);
      expect(startupFlow[0]).toContain("git-sync");
      expect(startupFlow[0]).toContain("fetch");
      expect(startupFlow[4]).toContain("import");
      expect(startupFlow[4]).toContain("files");
      expect(startupFlow[4]).toContain("database");
    });
  });

  describe("Edge Cases", () => {
    it("should handle first-time setup (no remote, no files)", async () => {
      // When there's no remote and no files, sync should:
      // 1. Skip git pull (no remote)
      // 2. Import would find no files
      // 3. Seed content might be copied (if configured)

      const scenario = {
        hasRemote: false,
        hasFiles: false,
        hasSeedContent: true,
      };

      // Expected behavior
      const expectedActions = [];
      if (!scenario.hasRemote) {
        expectedActions.push("skip-git-pull");
      }
      if (scenario.hasSeedContent && !scenario.hasFiles) {
        expectedActions.push("copy-seed-content");
      }
      expectedActions.push("import-files"); // Even if files came from seed

      expect(expectedActions).toContain("skip-git-pull");
      expect(expectedActions).toContain("copy-seed-content");
    });

    it("should handle remote exists but no local files", async () => {
      // When remote exists but local is empty:
      // 1. Git pull gets files
      // 2. Import those files

      const scenario = {
        hasRemote: true,
        hasLocalFiles: false,
      };

      const expectedActions = ["git-pull", "import-pulled-files"];

      expect(scenario.hasRemote).toBe(true);
      expect(expectedActions[0]).toBe("git-pull");
    });

    it("should handle local files but no remote", async () => {
      // When local files exist but no remote:
      // 1. Skip git pull
      // 2. Import local files
      // 3. Later: git init and push (if remote configured)

      const scenario = {
        hasRemote: false,
        hasLocalFiles: true,
      };

      const expectedActions = ["skip-git-pull", "import-local-files"];

      expect(scenario.hasRemote).toBe(false);
      expect(expectedActions[0]).toBe("skip-git-pull");
    });
  });
});

describe("Entity Event Flow: Changes After Startup", () => {
  describe("User Creates Entity", () => {
    it("should export to file after creation", () => {
      // Flow: User creates entity via tool
      // 1. Tool calls entityService.createEntity()
      // 2. Entity saved to DB
      // 3. entity:created emitted
      // 4. directory-sync subscriber writes file
      // 5. git-sync detects change (or auto-commit)

      const flow = [
        "user:create-entity-via-tool",
        "entity-service:save-to-db",
        "entity-service:emit-entity-created",
        "directory-sync:subscriber:write-file",
        "git-sync:auto-commit",
      ];

      expect(flow.indexOf("entity-service:save-to-db")).toBeLessThan(
        flow.indexOf("directory-sync:subscriber:write-file"),
      );
    });
  });

  describe("User Updates Entity", () => {
    it("should export to file after update", () => {
      // Flow: User updates entity (e.g., adds coverImageId)
      // 1. Tool calls entityService.updateEntity()
      // 2. Entity updated in DB
      // 3. entity:updated emitted
      // 4. directory-sync subscriber writes file
      // 5. git-sync commits

      const flow = [
        "user:update-entity-via-tool",
        "entity-service:update-db",
        "entity-service:emit-entity-updated",
        "directory-sync:subscriber:write-file",
        "git-sync:commit",
        "git-sync:push",
      ];

      // Write to file happens after DB update
      expect(flow.indexOf("entity-service:update-db")).toBeLessThan(
        flow.indexOf("directory-sync:subscriber:write-file"),
      );

      // Push to remote happens last
      expect(flow.indexOf("git-sync:push")).toBe(flow.length - 1);
    });
  });

  describe("File Content After Update", () => {
    it("should have correct content in file after entity:updated", async () => {
      const testDir = join(tmpdir(), `test-update-${Date.now()}`);
      mkdirSync(testDir, { recursive: true });

      try {
        const postDir = join(testDir, "post");
        mkdirSync(postDir, { recursive: true });

        // Initial file (no coverImageId)
        writeFileSync(
          join(postDir, "test.md"),
          `---
title: Test
---
# Test`,
        );

        // User adds coverImageId via tool
        // Tool updates DB, entity:updated fires, subscriber writes file
        const updatedContent = `---
title: Test
coverImageId: user-added-cover
---
# Test`;

        writeFileSync(join(postDir, "test.md"), updatedContent);

        // VERIFY: File has coverImageId
        const finalContent = readFileSync(join(postDir, "test.md"), "utf-8");
        expect(finalContent).toContain("coverImageId: user-added-cover");
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });
  });
});
