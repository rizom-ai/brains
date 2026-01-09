import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { SimpleGit } from "simple-git";
import simpleGit from "simple-git";

/**
 * Tests for merge strategy: remote should win conflicts.
 *
 * Scenario:
 * 1. Remote has file with coverImageId
 * 2. Local commits stale version (without coverImageId) - premature commit
 * 3. Pull from remote creates a conflict
 * 4. With -Xtheirs (remote wins): coverImageId PRESERVED ✓
 * 5. With -Xours (local wins): coverImageId LOST ✗
 *
 * Since remote is source of truth, we should use -Xtheirs.
 */
describe("Merge Strategy: Remote Wins (-Xtheirs)", () => {
  let localDir: string;
  let remoteDir: string;
  let localGit: SimpleGit;

  beforeEach(async () => {
    // Create unique test directories
    const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localDir = join(tmpdir(), `test-local-${uniqueId}`);
    remoteDir = join(tmpdir(), `test-remote-${uniqueId}`);
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

  describe("Current Behavior: -Xours loses remote coverImageId", () => {
    it("should LOSE remote coverImageId when using -Xours (BUG)", async () => {
      // SETUP: Create initial file and push to remote
      const seriesDir = join(localDir, "series");
      mkdirSync(seriesDir, { recursive: true });

      const initialContent = `---
name: Test Series
slug: test-series
---
# Test Series`;

      writeFileSync(join(seriesDir, "test-series.md"), initialContent);
      await localGit.add(".");
      await localGit.commit("Add series file");
      await localGit.push("origin", "main");

      // REMOTE: Someone adds coverImageId (modifies frontmatter block)
      const otherDir = join(
        tmpdir(),
        `other-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      await simpleGit().clone(remoteDir, otherDir);
      const otherGit = simpleGit(otherDir);
      await otherGit.addConfig("user.email", "other@test.com");
      await otherGit.addConfig("user.name", "Other User");

      // Remote adds coverImageId AND reorders/modifies frontmatter
      const remoteContentWithCover = `---
coverImageId: remote-cover-image
name: Test Series
slug: test-series
---
# Test Series`;

      writeFileSync(
        join(otherDir, "series", "test-series.md"),
        remoteContentWithCover,
      );
      await otherGit.add(".");
      await otherGit.commit("Add coverImageId");
      await otherGit.push("origin", "main");

      // LOCAL: Brain exports stale DB data, also modifies frontmatter
      // Creating a conflict on the same lines
      const staleLocalContent = `---
name: Test Series Updated
slug: test-series
---
# Test Series`;

      writeFileSync(join(seriesDir, "test-series.md"), staleLocalContent);
      await localGit.add(".");
      await localGit.commit("Stale local commit (premature)");

      // Pull with -Xours (current behavior - LOCAL WINS)
      await localGit.pull("origin", "main", {
        "--no-rebase": null,
        "--strategy=recursive": null,
        "-Xours": null,
      });

      // BUG: coverImageId is LOST because local (stale) wins the conflict
      const contentAfterPull = readFileSync(
        join(seriesDir, "test-series.md"),
        "utf-8",
      );
      expect(contentAfterPull).not.toContain("coverImageId");
      expect(contentAfterPull).toContain("Updated"); // Local version kept

      // Cleanup
      rmSync(otherDir, { recursive: true, force: true });
    });
  });

  describe("Fixed Behavior: -Xtheirs preserves remote coverImageId", () => {
    it("should PRESERVE remote coverImageId when using -Xtheirs (FIX)", async () => {
      // SETUP: Create initial file and push to remote
      const seriesDir = join(localDir, "series");
      mkdirSync(seriesDir, { recursive: true });

      const initialContent = `---
name: Test Series
slug: test-series
---
# Test Series`;

      writeFileSync(join(seriesDir, "test-series.md"), initialContent);
      await localGit.add(".");
      await localGit.commit("Add series file");
      await localGit.push("origin", "main");

      // REMOTE: Someone adds coverImageId (modifies frontmatter block)
      const otherDir = join(
        tmpdir(),
        `other-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      await simpleGit().clone(remoteDir, otherDir);
      const otherGit = simpleGit(otherDir);
      await otherGit.addConfig("user.email", "other@test.com");
      await otherGit.addConfig("user.name", "Other User");

      // Remote adds coverImageId AND reorders/modifies frontmatter
      const remoteContentWithCover = `---
coverImageId: remote-cover-image
name: Test Series
slug: test-series
---
# Test Series`;

      writeFileSync(
        join(otherDir, "series", "test-series.md"),
        remoteContentWithCover,
      );
      await otherGit.add(".");
      await otherGit.commit("Add coverImageId");
      await otherGit.push("origin", "main");

      // LOCAL: Brain exports stale DB data, also modifies frontmatter
      // Creating a conflict on the same lines
      const staleLocalContent = `---
name: Test Series Updated
slug: test-series
---
# Test Series`;

      writeFileSync(join(seriesDir, "test-series.md"), staleLocalContent);
      await localGit.add(".");
      await localGit.commit("Stale local commit (premature)");

      // Pull with -Xtheirs (FIXED behavior - REMOTE WINS)
      await localGit.pull("origin", "main", {
        "--no-rebase": null,
        "--strategy=recursive": null,
        "-Xtheirs": null,
      });

      // FIX: coverImageId is PRESERVED because remote wins
      const contentAfterPull = readFileSync(
        join(seriesDir, "test-series.md"),
        "utf-8",
      );
      expect(contentAfterPull).toContain("coverImageId: remote-cover-image");
      expect(contentAfterPull).not.toContain("Updated"); // Remote version kept

      // Cleanup
      rmSync(otherDir, { recursive: true, force: true });
    });
  });

  describe("No conflict: both changes preserved", () => {
    it("should preserve changes from both sides when no conflict", async () => {
      // When local and remote change DIFFERENT files, both changes are kept

      // SETUP: Create initial file
      const seriesDir = join(localDir, "series");
      mkdirSync(seriesDir, { recursive: true });

      writeFileSync(join(seriesDir, "series-1.md"), "# Series 1");
      await localGit.add(".");
      await localGit.commit("Add series-1");
      await localGit.push("origin", "main");

      // REMOTE: Add series-2
      const otherDir = join(
        tmpdir(),
        `other-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      await simpleGit().clone(remoteDir, otherDir);
      const otherGit = simpleGit(otherDir);
      await otherGit.addConfig("user.email", "other@test.com");
      await otherGit.addConfig("user.name", "Other User");

      mkdirSync(join(otherDir, "series"), { recursive: true });
      writeFileSync(join(otherDir, "series", "series-2.md"), "# Series 2");
      await otherGit.add(".");
      await otherGit.commit("Add series-2");
      await otherGit.push("origin", "main");

      // LOCAL: Add series-3
      writeFileSync(join(seriesDir, "series-3.md"), "# Series 3");
      await localGit.add(".");
      await localGit.commit("Add series-3");

      // Pull - no conflict, both changes preserved
      await localGit.pull("origin", "main", {
        "--no-rebase": null,
        "-Xtheirs": null, // Doesn't matter for non-conflicts
      });

      // Both new files exist
      expect(existsSync(join(seriesDir, "series-2.md"))).toBe(true);
      expect(existsSync(join(seriesDir, "series-3.md"))).toBe(true);

      // Cleanup
      rmSync(otherDir, { recursive: true, force: true });
    });
  });

  describe("Real-world scenario: coverImageId set via tool", () => {
    it("should preserve coverImageId added via tool after proper push", async () => {
      // This tests the CORRECT flow:
      // 1. User adds coverImageId via tool
      // 2. Brain commits and pushes immediately
      // 3. Another user pulls and gets the coverImageId

      // SETUP: Create file
      const seriesDir = join(localDir, "series");
      mkdirSync(seriesDir, { recursive: true });

      writeFileSync(
        join(seriesDir, "test.md"),
        `---
name: Test
---
# Test`,
      );
      await localGit.add(".");
      await localGit.commit("Add file");
      await localGit.push("origin", "main");

      // User adds coverImageId via tool → brain exports → commits → pushes
      writeFileSync(
        join(seriesDir, "test.md"),
        `---
name: Test
coverImageId: user-added-cover
---
# Test`,
      );
      await localGit.add(".");
      await localGit.commit("Add coverImageId via tool");
      await localGit.push("origin", "main");

      // Another user clones and gets the coverImageId
      const otherDir = join(
        tmpdir(),
        `other-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      await simpleGit().clone(remoteDir, otherDir);

      const content = readFileSync(
        join(otherDir, "series", "test.md"),
        "utf-8",
      );
      expect(content).toContain("coverImageId: user-added-cover");

      // Cleanup
      rmSync(otherDir, { recursive: true, force: true });
    });
  });
});
