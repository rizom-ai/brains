import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";
import { GitSync } from "../../src/lib/git-sync";
import { createSilentLogger } from "@brains/test-utils";

/**
 * Tests for the git-aware initial sync flow:
 * When git is configured, pull should happen before import,
 * and changed files from pull should be returned for import.
 */
describe("Git-aware initial sync", () => {
  let testDir: string;
  let remoteDir: string;
  let dataDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `test-git-init-sync-${Date.now()}`);
    remoteDir = join(testDir, "remote.git");
    dataDir = join(testDir, "brain-data");
    mkdirSync(remoteDir, { recursive: true });
    mkdirSync(dataDir, { recursive: true });
    execSync("git init --bare --initial-branch=main", {
      cwd: remoteDir,
      stdio: "ignore",
    });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should clone remote content on first initialize", async () => {
    // Seed the remote with content via a temporary clone
    const seedDir = join(testDir, "seed");
    execSync(`git clone ${remoteDir} ${seedDir}`, { stdio: "ignore" });
    execSync("git config user.name Seed && git config user.email s@s.com", {
      cwd: seedDir,
      stdio: "ignore",
    });
    mkdirSync(join(seedDir, "post"), { recursive: true });
    writeFileSync(
      join(seedDir, "post", "hello.md"),
      "---\ntitle: Hello\n---\nContent",
    );
    execSync("git add -A && git commit -m 'seed content' && git push", {
      cwd: seedDir,
      stdio: "ignore",
    });

    // Initialize clones the repo — files are on disk immediately
    const gs = new GitSync({
      logger: createSilentLogger(),
      dataDir,
      gitUrl: remoteDir,
      authorName: "Test",
      authorEmail: "test@test.com",
    });
    await gs.initialize();

    // Files should be on disk from clone (not from pull)
    expect(existsSync(join(dataDir, "post", "hello.md"))).toBe(true);

    // Pull returns empty — clone already got everything
    const result = await gs.pull();
    expect(result.files).toEqual([]);

    gs.cleanup();
  });

  it("should return only changed files on subsequent pull", async () => {
    // Setup: local repo with initial content pushed
    const gs = new GitSync({
      logger: createSilentLogger(),
      dataDir,
      gitUrl: remoteDir,
      authorName: "Test",
      authorEmail: "test@test.com",
    });
    await gs.initialize();

    writeFileSync(join(dataDir, "existing.md"), "# Existing");
    await gs.commit("initial");
    await gs.push();

    // Remote adds a new file
    const cloneDir = join(testDir, "clone");
    execSync(`git clone ${remoteDir} ${cloneDir}`, { stdio: "ignore" });
    execSync("git config user.name R && git config user.email r@r.com", {
      cwd: cloneDir,
      stdio: "ignore",
    });
    writeFileSync(join(cloneDir, "new-file.md"), "# New");
    execSync("git add -A && git commit -m 'add new file' && git push", {
      cwd: cloneDir,
      stdio: "ignore",
    });

    // Pull should return only the new file
    const result = await gs.pull();
    expect(result.files).toContain("new-file.md");
    expect(result.files).not.toContain("existing.md");

    gs.cleanup();
  });

  it("should handle first startup with no remote content", async () => {
    const gs = new GitSync({
      logger: createSilentLogger(),
      dataDir,
      gitUrl: remoteDir,
      authorName: "Test",
      authorEmail: "test@test.com",
    });
    await gs.initialize();

    // Pull on empty remote should return empty files
    const result = await gs.pull();
    expect(result.files).toEqual([]);

    gs.cleanup();
  });
});
