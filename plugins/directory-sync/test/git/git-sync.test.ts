import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";
import { createServer, type AddressInfo, type Socket } from "net";
import { GitSync } from "../../src/lib/git-sync";
import { GitStallError } from "../../src/lib/git-stall";
import { createSilentLogger } from "@brains/test-utils";

/**
 * TCP server that accepts connections but never replies — simulates a stalled
 * git fetch/push. Destroys lingering sockets on close so aborted git children
 * don't leak past the test.
 */
async function startUnresponsiveServer(): Promise<{
  port: number;
  close: () => Promise<void>;
}> {
  const sockets: Socket[] = [];
  const server = createServer((socket) => {
    sockets.push(socket);
    socket.on("error", () => {});
  });
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    close: () =>
      new Promise<void>((resolve) => {
        for (const s of sockets) s.destroy();
        server.close(() => resolve());
      }),
  };
}

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
    gitSync.cleanup();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  function createGitSync(
    opts: { repo?: string; authToken?: string; timeoutMs?: number } = {},
  ): GitSync {
    gitSync = new GitSync({
      logger: createSilentLogger(),
      dataDir,
      repo: opts.repo,
      gitUrl: remoteDir,
      authorName: "Test",
      authorEmail: "test@example.com",
      authToken: opts.authToken,
      timeoutMs: opts.timeoutMs,
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

    it("should include pre-existing brain-data files in the initial commit", async () => {
      // Simulate: brain-data already has seed content when git is first
      // initialized (e.g. directory seed copied by copySeedContentIfNeeded,
      // or files dropped in manually before first boot).
      writeFileSync(join(dataDir, "existing-seed.md"), "# Seed");
      mkdirSync(join(dataDir, "nested"), { recursive: true });
      writeFileSync(join(dataDir, "nested", "child.md"), "# Child");

      const gs = createGitSync();
      await gs.initialize();

      // First (and only) commit should contain the seed files, not just
      // an empty .gitkeep.
      const tracked = execSync("git ls-files", {
        cwd: dataDir,
        encoding: "utf-8",
      })
        .trim()
        .split("\n")
        .sort();
      expect(tracked).toContain("existing-seed.md");
      expect(tracked).toContain("nested/child.md");
    });

    it("should preserve checkout errors instead of masking them as branch creation failures", async () => {
      const gs = createGitSync();
      await gs.initialize();

      writeFileSync(join(dataDir, ".git", "index.lock"), "");

      const gs2 = createGitSync();
      expect(gs2.initialize()).rejects.toThrow(/index\.lock/);
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
    it("should bootstrap an empty remote by committing and pushing", async () => {
      // Fresh empty bare remote (no branches). Existing brain-data content
      // should be committed + pushed on first pull attempt, creating the
      // remote branch. Previously this case silently no-op'd and the
      // initial content never left the local machine.
      writeFileSync(join(dataDir, "bootstrap-seed.md"), "# Bootstrap");

      const gs = createGitSync();
      await gs.initialize();

      // Sanity: remote has no branches yet
      const refsBefore = execSync("git branch", {
        cwd: remoteDir,
        encoding: "utf-8",
      }).trim();
      expect(refsBefore).toBe("");

      const result = await gs.pull();
      expect(result.files).toEqual([]);

      // Remote `main` now exists and contains the seed file
      const remoteLog = execSync("git log --oneline main", {
        cwd: remoteDir,
        encoding: "utf-8",
      }).trim();
      expect(remoteLog.length).toBeGreaterThan(0);
      const remoteTracked = execSync("git ls-tree -r --name-only main", {
        cwd: remoteDir,
        encoding: "utf-8",
      }).trim();
      expect(remoteTracked).toContain("bootstrap-seed.md");
    });

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
      execSync("git add -A", { cwd: cloneDir, stdio: "ignore" });
      execSync(
        'git -c user.name="Test" -c user.email="test@test.com" commit -m "remote change"',
        { cwd: cloneDir, stdio: "ignore" },
      );
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

  describe("network stall timeout", () => {
    const STALL_MS = 1000;

    it("pull still succeeds and returns changes when a timeout is configured", async () => {
      const gs = createGitSync({ timeoutMs: 10_000 });
      await gs.initialize();

      writeFileSync(join(dataDir, ".gitkeep"), "");
      await gs.commit("initial");
      await gs.push();

      // Remote change pushed by another clone
      const cloneDir = join(testDir, "clone");
      execSync(`git clone ${remoteDir} ${cloneDir}`, { stdio: "ignore" });
      writeFileSync(join(cloneDir, "remote-post.md"), "# Remote");
      execSync("git add -A", { cwd: cloneDir, stdio: "ignore" });
      execSync(
        'git -c user.name="Test" -c user.email="test@test.com" commit -m "remote change"',
        { cwd: cloneDir, stdio: "ignore" },
      );
      execSync("git push", { cwd: cloneDir, stdio: "ignore" });

      const result = await gs.pull();
      expect(result.files).toContain("remote-post.md");
    });

    it("pull rejects with GitStallError when the remote is unresponsive", async () => {
      const { port, close } = await startUnresponsiveServer();
      try {
        const gs = createGitSync({ timeoutMs: STALL_MS });
        await gs.initialize();
        writeFileSync(join(dataDir, ".gitkeep"), "");
        await gs.commit("initial");

        // Point origin at the unresponsive server.
        execSync(`git remote set-url origin git://127.0.0.1:${port}/repo.git`, {
          cwd: dataDir,
          stdio: "ignore",
        });

        const start = performance.now();
        let error: unknown;
        try {
          await gs.pull();
        } catch (e) {
          error = e;
        }
        const elapsed = performance.now() - start;

        // Rejected via the stall path specifically — not an instant failure.
        expect(error).toBeInstanceOf(GitStallError);
        // Waited roughly the stall window, and nowhere near hanging.
        expect(elapsed).toBeGreaterThanOrEqual(STALL_MS * 0.8);
        expect(elapsed).toBeLessThan(10_000);
      } finally {
        await close();
      }
    }, 20_000);

    it("push rejects with GitStallError when the remote is unresponsive", async () => {
      const { port, close } = await startUnresponsiveServer();
      try {
        const gs = createGitSync({ timeoutMs: STALL_MS });
        await gs.initialize();
        writeFileSync(join(dataDir, "note.md"), "# Note");
        await gs.commit("initial");

        execSync(`git remote set-url origin git://127.0.0.1:${port}/repo.git`, {
          cwd: dataDir,
          stdio: "ignore",
        });

        const start = performance.now();
        let error: unknown;
        try {
          await gs.push();
        } catch (e) {
          error = e;
        }
        const elapsed = performance.now() - start;

        expect(error).toBeInstanceOf(GitStallError);
        expect(elapsed).toBeGreaterThanOrEqual(STALL_MS * 0.8);
        expect(elapsed).toBeLessThan(10_000);
      } finally {
        await close();
      }
    }, 20_000);

    it("does not wedge: operations recover after a stalled pull", async () => {
      const { port, close } = await startUnresponsiveServer();
      try {
        // Start with a working remote so we can prove recovery against it.
        const gs = createGitSync({ timeoutMs: STALL_MS });
        await gs.initialize();
        writeFileSync(join(dataDir, ".gitkeep"), "");
        await gs.commit("initial");
        await gs.push();

        // Stall a pull against the dead remote.
        execSync(`git remote set-url origin git://127.0.0.1:${port}/repo.git`, {
          cwd: dataDir,
          stdio: "ignore",
        });
        let stallError: unknown;
        try {
          await gs.pull();
        } catch (e) {
          stallError = e;
        }
        expect(stallError).toBeInstanceOf(GitStallError);

        // Restore the working remote — subsequent operations must succeed
        // promptly, proving the stalled task left no held lock or blocked
        // git instance behind it.
        execSync(`git remote set-url origin ${remoteDir}`, {
          cwd: dataDir,
          stdio: "ignore",
        });

        const status = await gs.getStatus();
        expect(status.isRepo).toBe(true);

        const result = await gs.pull();
        expect(result.files).toEqual([]);
      } finally {
        await close();
      }
    }, 20_000);
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
