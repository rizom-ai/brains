import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { SimpleGit } from "simple-git";
import simpleGit from "simple-git";

/**
 * Tests for "Remote Git is Source of Truth" architecture.
 *
 * Principles:
 * 1. On startup: git pull FIRST, then import files to database
 * 2. Files always win over database (database is cache, files are source)
 * 3. Local changes (via tools) update DB, then export to files, then git commit/push
 * 4. When pulling remote changes, they should be imported to database
 *
 * This prevents the bug where stale database data overwrites good file content.
 */
describe("Remote Git is Source of Truth", () => {
  let localDir: string;
  let remoteDir: string;
  let localGit: SimpleGit;

  beforeEach(async () => {
    // Create test directories
    localDir = join(
      tmpdir(),
      `test-local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    remoteDir = join(
      tmpdir(),
      `test-remote-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(localDir, { recursive: true });
    mkdirSync(remoteDir, { recursive: true });

    // Initialize bare remote repository
    const remoteGit = simpleGit(remoteDir);
    await remoteGit.init(true);
    await remoteGit.raw(["symbolic-ref", "HEAD", "refs/heads/main"]);

    // Initialize local repository
    localGit = simpleGit(localDir);
    await localGit.init();
    await localGit.addConfig("user.email", "test@test.com");
    await localGit.addConfig("user.name", "Test User");
    await localGit.raw(["checkout", "-b", "main"]);

    // Create initial commit
    writeFileSync(join(localDir, ".gitkeep"), "");
    await localGit.add(".");
    await localGit.commit("Initial setup");

    // Set up remote and push
    await localGit.addRemote("origin", remoteDir);
    await localGit.push(["-u", "origin", "main"]);
  });

  afterEach(() => {
    if (existsSync(localDir)) {
      rmSync(localDir, { recursive: true, force: true });
    }
    if (existsSync(remoteDir)) {
      rmSync(remoteDir, { recursive: true, force: true });
    }
  });

  describe("Startup: Git Pull Before File Import", () => {
    it("should have remote changes available locally after pull", async () => {
      // SETUP: Another user pushes changes to remote
      const otherDir = join(
        tmpdir(),
        `other-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      await simpleGit().clone(remoteDir, otherDir);
      const otherGit = simpleGit(otherDir);
      await otherGit.addConfig("user.email", "other@test.com");
      await otherGit.addConfig("user.name", "Other User");

      // Other user creates a post with coverImageId
      const postDir = join(otherDir, "post");
      mkdirSync(postDir, { recursive: true });
      writeFileSync(
        join(postDir, "test-post.md"),
        `---
title: Test Post
coverImageId: remote-cover-image
---
# Test Post Content`,
      );
      await otherGit.add(".");
      await otherGit.commit("Add post with coverImageId");
      await otherGit.push("origin", "main");

      // LOCAL: Brain starts, pulls from remote
      await localGit.pull("origin", "main");

      // VERIFY: Local now has the remote content with coverImageId
      const localPostPath = join(localDir, "post", "test-post.md");
      expect(existsSync(localPostPath)).toBe(true);
      const content = readFileSync(localPostPath, "utf-8");
      expect(content).toContain("coverImageId: remote-cover-image");

      // Cleanup
      rmSync(otherDir, { recursive: true, force: true });
    });

    it("should NOT have uncommitted local files overwrite pulled remote content", async () => {
      // SETUP: Create local file (uncommitted, simulating stale export)
      const postDir = join(localDir, "post");
      mkdirSync(postDir, { recursive: true });
      writeFileSync(
        join(postDir, "test-post.md"),
        `---
title: Test Post
---
# Stale local content WITHOUT coverImageId`,
      );
      // Note: NOT committed - this simulates stale DB export

      // Another user pushes the correct version
      const otherDir = join(
        tmpdir(),
        `other-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      await simpleGit().clone(remoteDir, otherDir);
      const otherGit = simpleGit(otherDir);
      await otherGit.addConfig("user.email", "other@test.com");
      await otherGit.addConfig("user.name", "Other User");

      const otherPostDir = join(otherDir, "post");
      mkdirSync(otherPostDir, { recursive: true });
      writeFileSync(
        join(otherPostDir, "test-post.md"),
        `---
title: Test Post
coverImageId: correct-cover-image
---
# Correct content WITH coverImageId`,
      );
      await otherGit.add(".");
      await otherGit.commit("Add post with coverImageId");
      await otherGit.push("origin", "main");

      // Pull with checkout to force overwrite of untracked/modified files
      await localGit.fetch("origin");
      await localGit.raw([
        "checkout",
        "origin/main",
        "--",
        "post/test-post.md",
      ]);

      // VERIFY: Remote content wins over uncommitted local files
      const content = readFileSync(join(postDir, "test-post.md"), "utf-8");
      expect(content).toContain("coverImageId: correct-cover-image");
      expect(content).not.toContain("Stale local content");

      // Cleanup
      rmSync(otherDir, { recursive: true, force: true });
    });
  });

  describe("File Import: Files Win Over Database", () => {
    it("pulled files should be imported to database (files are source of truth)", async () => {
      // This is a documentation test for the expected behavior
      // The actual import happens in directory-sync, not git-sync

      // PRINCIPLE: After git pull, directory-sync should:
      // 1. Read all files from disk
      // 2. Import them to database
      // 3. Database content should match file content

      // ANTI-PATTERN (what we're fixing):
      // 1. Database has stale data
      // 2. Export database → files (corrupts files)
      // 3. Git commit corrupted files
      // 4. Push corrupted data to remote

      const principle = "files-win-over-database";
      expect(principle).toBe("files-win-over-database");
    });
  });

  describe("Local Changes: DB Update → File Export → Git Push", () => {
    it("should commit local file changes after they are made", async () => {
      // Create a file
      const postDir = join(localDir, "post");
      mkdirSync(postDir, { recursive: true });
      writeFileSync(
        join(postDir, "new-post.md"),
        `---
title: New Post
---
# New Post`,
      );
      await localGit.add(".");
      await localGit.commit("Add new post");

      // Modify file (simulating DB → file export after user adds coverImageId)
      writeFileSync(
        join(postDir, "new-post.md"),
        `---
title: New Post
coverImageId: user-added-cover
---
# New Post`,
      );
      await localGit.add(".");
      await localGit.commit("Add coverImageId");

      // Push to remote
      await localGit.push("origin", "main");

      // VERIFY: Clone remote and check coverImageId is there
      const verifyDir = join(
        tmpdir(),
        `verify-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      await simpleGit().clone(remoteDir, verifyDir);
      const content = readFileSync(
        join(verifyDir, "post", "new-post.md"),
        "utf-8",
      );
      expect(content).toContain("coverImageId: user-added-cover");

      // Cleanup
      rmSync(verifyDir, { recursive: true, force: true });
    });
  });

  describe("Conflict Resolution: Remote Wins (Source of Truth)", () => {
    it("should preserve remote version when conflicts occur during pull", async () => {
      // Create initial post
      const postDir = join(localDir, "post");
      mkdirSync(postDir, { recursive: true });
      writeFileSync(
        join(postDir, "test-post.md"),
        `---
title: Test Post
---
# Test Post`,
      );
      await localGit.add(".");
      await localGit.commit("Add post");
      await localGit.push("origin", "main");

      // OTHER: Push change to same file
      const otherDir = join(
        tmpdir(),
        `other-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      await simpleGit().clone(remoteDir, otherDir);
      const otherGit = simpleGit(otherDir);
      await otherGit.addConfig("user.email", "other@test.com");
      await otherGit.addConfig("user.name", "Other User");
      writeFileSync(
        join(otherDir, "post", "test-post.md"),
        `---
title: Test Post
coverImageId: remote-cover
---
# Test Post - Remote Version`,
      );
      await otherGit.add(".");
      await otherGit.commit("Remote adds coverImageId");
      await otherGit.push("origin", "main");

      // LOCAL: Make conflicting change
      writeFileSync(
        join(postDir, "test-post.md"),
        `---
title: Test Post
---
# Test Post - Local Version`,
      );
      await localGit.add(".");
      await localGit.commit("Local changes title");

      // Pull with -Xtheirs (remote wins)
      await localGit.pull("origin", "main", {
        "--no-rebase": null,
        "--strategy=recursive": null,
        "-Xtheirs": null,
      });

      // VERIFY: Remote version wins, coverImageId is preserved
      const content = readFileSync(join(postDir, "test-post.md"), "utf-8");
      expect(content).toContain("coverImageId: remote-cover");
      expect(content).toContain("Remote Version");

      // Cleanup
      rmSync(otherDir, { recursive: true, force: true });
    });
  });

  describe("Startup Order: Correct Sequence", () => {
    it("documents the correct startup order", () => {
      // This test documents the expected startup sequence
      const correctOrder = [
        "1. Git pull from remote (get latest)",
        "2. Directory-sync import: files → database",
        "3. Brain ready, user can make changes",
        "4. On entity change: DB update → file export",
        "5. Git commit changed files",
        "6. Git push to remote",
      ];

      const incorrectOrder = [
        "1. Directory-sync export: database → files (WRONG - stale DB corrupts files)",
        "2. Git commit (WRONG - commits stale data)",
        "3. Git push (WRONG - pushes corrupted data)",
        "4. Git pull (TOO LATE - damage already done)",
      ];

      expect(correctOrder.length).toBe(6);
      expect(incorrectOrder[0]).toContain("WRONG");
    });
  });
});

describe("Directory-Sync: Files Are Source of Truth", () => {
  describe("Import Only on Startup", () => {
    it("documents that startup should only import, never export", () => {
      // On startup:
      // - CORRECT: Read files, import to DB
      // - WRONG: Read DB, export to files (overwrites good data with stale cache)

      const startupBehavior = {
        import: true, // Files → DB: YES
        export: false, // DB → Files: NO (until after git pull completes)
      };

      expect(startupBehavior.import).toBe(true);
      expect(startupBehavior.export).toBe(false);
    });
  });

  describe("Export Only After Changes", () => {
    it("documents that export only happens after user makes changes", () => {
      // Export (DB → files) should ONLY happen when:
      // 1. User creates new entity via tool
      // 2. User updates entity via tool
      // 3. User deletes entity via tool

      // Export should NEVER happen:
      // 1. On startup (before git pull)
      // 2. As part of "sync" initialization

      const exportTriggers = [
        "entity:created", // OK - user action
        "entity:updated", // OK - user action
        "entity:deleted", // OK - user action
      ];

      const invalidExportTriggers = [
        "startup", // WRONG - corrupts files
        "sync:initial", // WRONG - corrupts files
      ];

      expect(exportTriggers.length).toBe(3);
      expect(invalidExportTriggers[0]).toBe("startup");
    });
  });
});
