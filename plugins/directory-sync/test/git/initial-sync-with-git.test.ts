import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, existsSync, rmSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createBrokerGitSync } from "./broker-git-sync";
import { runGit } from "./real-git";
import { createSilentLogger } from "@brains/test-utils";

/**
 * Tests for the git-aware initial sync flow:
 * When git is configured, pull should happen before import,
 * and changed files from pull should be returned for import.
 *
 * Git runs through `runGit`, never `execSync`. A synchronous spawn has to
 * collect the child's exit itself, and under `--parallel` this file was seen
 * spinning a worker at 100% CPU with its `git` child left `<defunct>` — an
 * exit nobody reaped, which no per-test timeout can interrupt because the
 * loop never yields. `runGit` awaits `child.exited`, so the exit is always
 * collected.
 */
describe("Git-aware initial sync", () => {
  let testDir: string;
  let remoteDir: string;
  let dataDir: string;

  beforeEach(async () => {
    testDir = mkdtempSync(join(tmpdir(), "test-git-init-sync-"));
    remoteDir = join(testDir, "remote.git");
    dataDir = join(testDir, "brain-data");
    mkdirSync(remoteDir, { recursive: true });
    mkdirSync(dataDir, { recursive: true });
    await runGit(["init", "--bare", "--initial-branch=main"], remoteDir);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  /** A clone of the remote, identified, ready to commit. */
  async function seedClone(path: string, name: string): Promise<void> {
    await runGit(["clone", remoteDir, path], testDir);
    await runGit(["config", "user.name", name], path);
    await runGit(["config", "user.email", `${name}@example.com`], path);
  }

  async function commitAndPush(path: string, message: string): Promise<void> {
    await runGit(["add", "-A"], path);
    await runGit(["commit", "-m", message], path);
    await runGit(["push"], path);
  }

  it("should clone remote content on first initialize", async () => {
    // Seed the remote with content via a temporary clone
    const seedDir = join(testDir, "seed");
    await seedClone(seedDir, "seed");
    mkdirSync(join(seedDir, "post"), { recursive: true });
    writeFileSync(
      join(seedDir, "post", "hello.md"),
      "---\ntitle: Hello\n---\nContent",
    );
    await commitAndPush(seedDir, "seed content");

    // Initialize clones the repo — files are on disk immediately
    const gs = await createBrokerGitSync({
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

    await gs.cleanup();
  });

  it("should return only changed files on subsequent pull", async () => {
    // Setup: local repo with initial content pushed
    const gs = await createBrokerGitSync({
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
    await seedClone(cloneDir, "remote");
    writeFileSync(join(cloneDir, "new-file.md"), "# New");
    await commitAndPush(cloneDir, "add new file");

    // Pull should return only the new file
    const result = await gs.pull();
    expect(result.files).toContain("new-file.md");
    expect(result.files).not.toContain("existing.md");

    await gs.cleanup();
  });

  it("should handle first startup with no remote content", async () => {
    const gs = await createBrokerGitSync({
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

    await gs.cleanup();
  });
});
