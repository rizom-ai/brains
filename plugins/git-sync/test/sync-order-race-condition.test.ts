import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { SimpleGit } from "simple-git";
import simpleGit from "simple-git";

/**
 * Tests for git-sync race condition where pull with -Xtheirs loses local changes.
 *
 * The Bug:
 * - Local commits coverImageId change
 * - Remote has different change to same file
 * - Pull with -Xtheirs: remote wins, coverImageId LOST
 *
 * The Fix:
 * - Commit local changes
 * - Try push first
 * - If push fails (remote diverged), pull with -Xours (local wins)
 * - Push merged result
 */
describe("Git-Sync Order Race Condition", () => {
  let localDir: string;
  let remoteDir: string;
  let localGit: SimpleGit;

  beforeEach(async () => {
    // Create test directories
    localDir = join(tmpdir(), `test-local-${Date.now()}`);
    remoteDir = join(tmpdir(), `test-remote-${Date.now()}`);
    mkdirSync(localDir, { recursive: true });
    mkdirSync(remoteDir, { recursive: true });

    // Initialize bare remote repository
    const remoteGit = simpleGit(remoteDir);
    await remoteGit.init(true);
    // Set HEAD to main (otherwise clone fails to checkout)
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

  describe("Bug: -Xtheirs causes local changes to be lost", () => {
    it("should lose local coverImageId when pull uses -Xtheirs (conflicting frontmatter)", async () => {
      // SETUP: Create series file
      const seriesDir = join(localDir, "series");
      mkdirSync(seriesDir, { recursive: true });

      const filePath = join(seriesDir, "test-series.md");
      const initialContent = `---
name: Test Series
slug: test-series
---
# Test Series`;

      writeFileSync(filePath, initialContent);
      await localGit.add(".");
      await localGit.commit("Add series file");
      await localGit.push("origin", "main");

      // Create another clone to simulate remote changes
      const otherDir = join(tmpdir(), `other-${Date.now()}`);
      await simpleGit().clone(remoteDir, otherDir);
      const otherGitRepo = simpleGit(otherDir);
      await otherGitRepo.addConfig("user.email", "other@test.com");
      await otherGitRepo.addConfig("user.name", "Other User");

      // OTHER: Reorder the frontmatter and push (creates conflict)
      // The key insight: frontmatter field ORDER changes create conflicts
      const otherContent = `---
slug: test-series
name: Test Series
---
# Test Series`;

      // Verify clone has the series directory (from our push)
      const otherSeriesPath = join(otherDir, "series", "test-series.md");
      expect(existsSync(otherSeriesPath)).toBe(true);
      writeFileSync(otherSeriesPath, otherContent);
      await otherGitRepo.add(".");
      await otherGitRepo.commit("Other reorders frontmatter");
      await otherGitRepo.push("origin", "main");

      // LOCAL: Add coverImageId (changes the same lines as remote)
      const contentWithCover = `---
coverImageId: test-cover
name: Test Series
slug: test-series
---
# Test Series`;

      writeFileSync(filePath, contentWithCover);
      await localGit.add(".");
      await localGit.commit("Add coverImageId");

      // Verify local has coverImageId
      expect(readFileSync(filePath, "utf-8")).toContain("coverImageId");

      // BUG: Pull with -Xtheirs (remote wins in conflicts)
      await localGit.pull("origin", "main", {
        "--no-rebase": null,
        "--strategy=recursive": null,
        "-Xtheirs": null,
      });

      // BUG PROVEN: coverImageId is LOST (remote's frontmatter wins)
      const contentAfterPull = readFileSync(filePath, "utf-8");
      expect(contentAfterPull).not.toContain("coverImageId");
      // Remote's frontmatter order is preserved
      expect(contentAfterPull).toContain(
        "slug: test-series\nname: Test Series",
      );

      // Cleanup
      rmSync(otherDir, { recursive: true, force: true });
    });
  });

  describe("Fix: -Xours preserves local changes", () => {
    it("should preserve local coverImageId when pull uses -Xours (conflicting frontmatter)", async () => {
      // SETUP: Create series file
      const seriesDir = join(localDir, "series");
      mkdirSync(seriesDir, { recursive: true });

      const filePath = join(seriesDir, "test-series.md");
      const initialContent = `---
name: Test Series
slug: test-series
---
# Test Series`;

      writeFileSync(filePath, initialContent);
      await localGit.add(".");
      await localGit.commit("Add series file");
      await localGit.push("origin", "main");

      // Create another clone to simulate remote changes
      const otherDir = join(tmpdir(), `other-${Date.now()}`);
      await simpleGit().clone(remoteDir, otherDir);
      const otherGitRepo = simpleGit(otherDir);
      await otherGitRepo.addConfig("user.email", "other@test.com");
      await otherGitRepo.addConfig("user.name", "Other User");

      // OTHER: Reorder the frontmatter and push (creates conflict)
      const otherContent = `---
slug: test-series
name: Test Series
---
# Test Series`;

      // Verify clone has the series directory (from our push)
      const otherSeriesPath = join(otherDir, "series", "test-series.md");
      expect(existsSync(otherSeriesPath)).toBe(true);
      writeFileSync(otherSeriesPath, otherContent);
      await otherGitRepo.add(".");
      await otherGitRepo.commit("Other reorders frontmatter");
      await otherGitRepo.push("origin", "main");

      // LOCAL: Add coverImageId (changes the same lines as remote)
      const contentWithCover = `---
coverImageId: test-cover
name: Test Series
slug: test-series
---
# Test Series`;

      writeFileSync(filePath, contentWithCover);
      await localGit.add(".");
      await localGit.commit("Add coverImageId");

      // Verify local has coverImageId
      expect(readFileSync(filePath, "utf-8")).toContain("coverImageId");

      // FIX: Pull with -Xours (local wins in conflicts)
      await localGit.pull("origin", "main", {
        "--no-rebase": null,
        "--strategy=recursive": null,
        "-Xours": null,
      });

      // FIX PROVEN: coverImageId is PRESERVED (local frontmatter wins)
      const contentAfterPull = readFileSync(filePath, "utf-8");
      expect(contentAfterPull).toContain("coverImageId");
      // Local's frontmatter order is preserved
      expect(contentAfterPull).toContain(
        "coverImageId: test-cover\nname: Test Series",
      );

      // Cleanup
      rmSync(otherDir, { recursive: true, force: true });
    });

    it("should preserve both changes when no conflict", async () => {
      // SETUP: Create series file
      const seriesDir = join(localDir, "series");
      mkdirSync(seriesDir, { recursive: true });

      const filePath = join(seriesDir, "test-series.md");
      writeFileSync(filePath, "# Test Series");
      await localGit.add(".");
      await localGit.commit("Add series file");
      await localGit.push("origin", "main");

      // Create another clone
      const otherDir = join(tmpdir(), `other-${Date.now()}`);
      await simpleGit().clone(remoteDir, otherDir);
      const otherGitRepo = simpleGit(otherDir);
      await otherGitRepo.addConfig("user.email", "other@test.com");
      await otherGitRepo.addConfig("user.name", "Other User");

      // OTHER: Add a DIFFERENT file and push
      writeFileSync(join(otherDir, "other-file.md"), "# Other File");
      await otherGitRepo.add(".");
      await otherGitRepo.commit("Add other file");
      await otherGitRepo.push("origin", "main");

      // LOCAL: Modify our file and commit
      writeFileSync(filePath, "# Test Series Updated");
      await localGit.add(".");
      await localGit.commit("Update series file");

      // Try push (will fail - remote diverged)
      let pushSucceeded = true;
      try {
        await localGit.push("origin", "main");
      } catch {
        pushSucceeded = false;
      }
      expect(pushSucceeded).toBe(false);

      // Pull (no conflict since different files)
      await localGit.pull("origin", "main", { "--no-rebase": null });

      // Push merged result
      await localGit.push("origin", "main");

      // Both changes preserved
      expect(readFileSync(filePath, "utf-8")).toContain("Updated");
      expect(existsSync(join(localDir, "other-file.md"))).toBe(true);

      // Cleanup
      rmSync(otherDir, { recursive: true, force: true });
    });
  });
});
