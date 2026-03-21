import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";
import { GitSync } from "../../src/lib/git-sync";
import { createSilentLogger } from "@brains/test-utils";

describe("GitSync (simplified)", () => {
  let testDir: string;
  let remoteDir: string;
  let dataDir: string;
  let gitSync: GitSync;

  beforeEach(() => {
    testDir = join(tmpdir(), `test-git-sync-${Date.now()}`);
    remoteDir = join(testDir, "remote.git");
    dataDir = join(testDir, "brain-data");
    mkdirSync(testDir, { recursive: true });
    mkdirSync(dataDir, { recursive: true });

    // Create bare remote repo with main as default branch
    mkdirSync(remoteDir, { recursive: true });
    execSync("git init --bare --initial-branch=main", {
      cwd: remoteDir,
      stdio: "ignore",
    });
  });

  afterEach(() => {
    gitSync?.cleanup();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  function createGitSync(
    opts: { repo?: string; authToken?: string } = {},
  ): GitSync {
    gitSync = new GitSync({
      logger: createSilentLogger(),
      dataDir,
      repo: opts.repo,
      gitUrl: remoteDir,
      authorName: "Test",
      authorEmail: "test@example.com",
      authToken: opts.authToken,
    });
    return gitSync;
  }

  describe("initialize", () => {
    it("should init a git repo in dataDir", async () => {
      const gs = createGitSync();
      await gs.initialize();
      expect(existsSync(join(dataDir, ".git"))).toBe(true);
    });

    it("should set remote when gitUrl is provided", async () => {
      const gs = createGitSync();
      await gs.initialize();
      const remote = execSync("git remote get-url origin", {
        cwd: dataDir,
        encoding: "utf-8",
      }).trim();
      expect(remote).toBe(remoteDir);
    });
  });

  describe("hasRemote", () => {
    it("should return true when remote is configured", async () => {
      const gs = createGitSync();
      await gs.initialize();
      expect(gs.hasRemote()).toBe(true);
    });

    it("should return false when no remote", async () => {
      const gs = new GitSync({
        logger: createSilentLogger(),
        dataDir,
        authorName: "Test",
        authorEmail: "test@example.com",
      });
      await gs.initialize();
      expect(gs.hasRemote()).toBe(false);
    });
  });

  describe("commit", () => {
    it("should stage and commit all changes", async () => {
      const gs = createGitSync();
      await gs.initialize();

      writeFileSync(join(dataDir, "test.md"), "# Hello");
      await gs.commit("test commit");

      const log = execSync("git log --oneline", {
        cwd: dataDir,
        encoding: "utf-8",
      }).trim();
      expect(log).toContain("test commit");
    });

    it("should not fail when nothing to commit", async () => {
      const gs = createGitSync();
      await gs.initialize();

      // Create initial commit so we have a branch
      writeFileSync(join(dataDir, ".gitkeep"), "");
      await gs.commit("initial");

      // Commit again with no changes — should not throw
      await gs.commit("empty");
    });
  });

  describe("push", () => {
    it("should push commits to remote", async () => {
      const gs = createGitSync();
      await gs.initialize();

      writeFileSync(join(dataDir, "test.md"), "# Hello");
      await gs.commit("test commit");
      await gs.push();

      // Verify remote has the commit
      const remoteLog = execSync("git log --oneline main", {
        cwd: remoteDir,
        encoding: "utf-8",
      }).trim();
      expect(remoteLog).toContain("test commit");
    });
  });

  describe("pull", () => {
    it("should return changed file paths", async () => {
      const gs = createGitSync();
      await gs.initialize();

      // Push an initial commit so main branch exists
      writeFileSync(join(dataDir, ".gitkeep"), "");
      await gs.commit("initial");
      await gs.push();

      // Simulate remote change: clone, add file, push
      const cloneDir = join(testDir, "clone");
      execSync(`git clone ${remoteDir} ${cloneDir}`, { stdio: "ignore" });
      writeFileSync(join(cloneDir, "new-post.md"), "# Remote post");
      execSync("git add -A && git commit -m 'remote change'", {
        cwd: cloneDir,
        stdio: "ignore",
      });
      execSync("git push", { cwd: cloneDir, stdio: "ignore" });

      // Pull should return the changed file
      const result = await gs.pull();
      expect(result.files).toContain("new-post.md");
    });

    it("should return empty files array when no changes", async () => {
      const gs = createGitSync();
      await gs.initialize();

      writeFileSync(join(dataDir, ".gitkeep"), "");
      await gs.commit("initial");
      await gs.push();

      const result = await gs.pull();
      expect(result.files).toEqual([]);
    });
  });

  describe("getStatus", () => {
    it("should return repo status", async () => {
      const gs = createGitSync();
      await gs.initialize();

      writeFileSync(join(dataDir, "test.md"), "# Hello");
      await gs.commit("initial");

      const status = await gs.getStatus();
      expect(status.isRepo).toBe(true);
      expect(status.branch).toBe("main");
    });
  });
});
