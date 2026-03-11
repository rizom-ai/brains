import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { GitSync } from "../src/lib/git-sync";
import { createMockLogger } from "@brains/test-utils";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import simpleGit from "simple-git";

/**
 * Regression test for autoPush when no upstream tracking branch is set.
 *
 * Production bug:
 * 1. git-sync initializes repo, local branch has no upstream tracking
 * 2. First sync pushes fine (remote branch doesn't exist → !remoteBranchExists)
 * 3. After first push, remote branch exists, so !remoteBranchExists = false
 * 4. git.status().ahead is always 0 (no upstream to compare against)
 * 5. shouldPush = false || (true && 0 > 0) || false → false
 * 6. All subsequent pushes silently skipped, local commits accumulate
 *
 * The fix: don't rely solely on ahead count — also push when autoPush is
 * true and we just committed new changes.
 */
describe("autoPush without upstream tracking branch", () => {
  let testDir: string;
  let remoteDir: string;
  let gitSync: GitSync;

  function createGitSync(overrides: Record<string, unknown> = {}): GitSync {
    const mockSend = async (): Promise<{
      success: true;
      data: { imported: number; errors: never[] };
    }> => {
      return { success: true as const, data: { imported: 0, errors: [] } };
    };

    return new GitSync({
      gitUrl: remoteDir,
      branch: "main",
      autoSync: false,
      syncInterval: 300,
      autoPush: true,
      dataDir: testDir,
      logger: createMockLogger(),
      messaging: {
        send: mockSend as never,
        subscribe: (() => {}) as never,
      },
      ...overrides,
    } as never);
  }

  beforeEach(async () => {
    testDir = join(tmpdir(), `test-autopush-${Date.now()}`);
    remoteDir = join(tmpdir(), `test-autopush-remote-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    mkdirSync(remoteDir, { recursive: true });

    // Init bare remote with 'main' as default branch
    const remoteGit = simpleGit(remoteDir);
    await remoteGit.init(true);
    await remoteGit.raw(["symbolic-ref", "HEAD", "refs/heads/main"]);

    gitSync = createGitSync();
    await gitSync.initialize();

    // Do a first sync to push initial commit and create the remote branch.
    // This succeeds because !remoteBranchExists is true.
    await gitSync.sync();

    // Now remove tracking to reproduce the production state:
    // remote branch exists, but local has no upstream set.
    const git = simpleGit(testDir);
    try {
      await git.raw(["branch", "--unset-upstream"]);
    } catch {
      // Already has no upstream
    }

    // Verify the bug precondition: ahead is 0 despite having a remote
    const status = await git.status();
    expect(status.ahead).toBe(0);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    if (existsSync(remoteDir)) {
      rmSync(remoteDir, { recursive: true, force: true });
    }
  });

  it("should push new commits when autoPush is true but no tracking", async () => {
    // Create a file locally (simulating entity written to disk)
    writeFileSync(join(testDir, "test-note.md"), "# Test Note\nContent\n");

    // sync() should commit AND push despite ahead being 0
    await gitSync.sync();

    // Verify the commit was pushed: clone from remote and check
    const verifyDir = join(tmpdir(), `test-autopush-verify-${Date.now()}`);
    mkdirSync(verifyDir, { recursive: true });
    try {
      await simpleGit(verifyDir).clone(remoteDir, ".", ["--branch", "main"]);
      expect(existsSync(join(verifyDir, "test-note.md"))).toBe(true);
    } finally {
      rmSync(verifyDir, { recursive: true, force: true });
    }
  });

  it("should not push when autoPush is false", async () => {
    const noPushSync = createGitSync({ autoPush: false });
    await noPushSync.initialize();

    // Create a new file
    writeFileSync(
      join(testDir, "another-note.md"),
      "# Another Note\nContent\n",
    );

    // sync() should commit but NOT push
    await noPushSync.sync();

    // Verify: clone from remote — the new file should NOT be there
    const verifyDir = join(tmpdir(), `test-autopush-verify2-${Date.now()}`);
    mkdirSync(verifyDir, { recursive: true });
    try {
      await simpleGit(verifyDir).clone(remoteDir, ".", ["--branch", "main"]);
      expect(existsSync(join(verifyDir, "another-note.md"))).toBe(false);
    } finally {
      rmSync(verifyDir, { recursive: true, force: true });
    }
  });

  it("should not push when there are no new changes to commit", async () => {
    const git = simpleGit(testDir);

    // sync() with clean working tree — should NOT attempt push
    await gitSync.sync();

    // Sanity check: working tree is still clean
    const status = await git.status();
    expect(status.isClean()).toBe(true);
  });
});
