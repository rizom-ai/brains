import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { GitSyncPlugin } from "../src/plugin";
import { GitSync } from "../src/lib/git-sync";
import type { PluginCapabilities } from "@brains/plugins/test";
import { createServicePluginHarness } from "@brains/plugins/test";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import simpleGit from "simple-git";

/**
 * Tests for optimized pull behavior:
 * - Sync tool should enqueue a job (non-blocking)
 * - Skip import entirely when pull brings no changes
 * - Only import changed files (not all files) when pull brings changes
 */
describe("Pull Skip Unchanged", () => {
  let harness: ReturnType<typeof createServicePluginHarness<GitSyncPlugin>>;
  let capabilities: PluginCapabilities;
  let testDir: string;
  let remoteDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `test-pull-skip-${Date.now()}`);
    remoteDir = join(tmpdir(), `test-pull-remote-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    mkdirSync(remoteDir, { recursive: true });

    // Initialize bare remote
    await simpleGit(remoteDir).init(true);

    harness = createServicePluginHarness<GitSyncPlugin>({ dataDir: testDir });

    harness.subscribe("entity:import:request", async () => {
      return { success: true, data: { imported: 0, errors: [] } };
    });

    capabilities = await harness.installPlugin(
      new GitSyncPlugin({
        enabled: true,
        repo: "test/pull-skip",
        gitUrl: remoteDir,
        branch: "main",
        autoSync: false,
        syncInterval: 30,
      }),
    );
  });

  afterEach(() => {
    harness.reset();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    if (existsSync(remoteDir)) {
      rmSync(remoteDir, { recursive: true, force: true });
    }
  });

  it("should return a jobId when sync tool is called", async () => {
    const git = simpleGit(testDir);

    mkdirSync(join(testDir, "post"), { recursive: true });
    writeFileSync(
      join(testDir, "post", "existing.md"),
      "---\ntitle: Existing\n---\n",
    );
    await git.add("-A");
    await git.commit("seed");
    await git.push("origin", "main");

    const tool = capabilities.tools.find((t) => t.name === "git-sync_sync");
    if (!tool) throw new Error("Sync tool not found");

    const result = await tool.handler(
      {},
      { interfaceType: "test", userId: "test-user" },
    );

    expect(result.success).toBe(true);
    const data = result.success ? result.data : undefined;
    expect(data).toBeDefined();
    expect((data as { jobId?: string })?.jobId).toBeDefined();
  });
});

/**
 * Tests for GitSync.pull() behavior directly (bypassing job queue).
 */
describe("GitSync.pull() selective import", () => {
  let testDir: string;
  let remoteDir: string;
  let importRequests: Array<{ paths?: string[] }>;
  let gitSync: GitSync;

  beforeEach(async () => {
    testDir = join(tmpdir(), `test-pull-direct-${Date.now()}`);
    remoteDir = join(tmpdir(), `test-pull-direct-remote-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    mkdirSync(remoteDir, { recursive: true });

    await simpleGit(remoteDir).init(true);

    importRequests = [];

    const mockSend = async (_topic: string, payload?: unknown) => {
      if (_topic === "entity:import:request") {
        importRequests.push(payload as { paths?: string[] });
      }
      return { success: true as const, data: { imported: 0, errors: [] } };
    };

    gitSync = new GitSync({
      gitUrl: remoteDir,
      branch: "main",
      autoSync: false,
      syncInterval: 300,
      dataDir: testDir,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
        child: () => ({
          info: () => {},
          warn: () => {},
          error: () => {},
          debug: () => {},
          child: () => null as never,
        }),
      } as never,
      messaging: {
        send: mockSend as never,
        subscribe: (() => {}) as never,
      },
    } as never);

    await gitSync.initialize();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    if (existsSync(remoteDir)) {
      rmSync(remoteDir, { recursive: true, force: true });
    }
  });

  it("should skip import when pull brings no changes", async () => {
    const git = simpleGit(testDir);

    // Push local state to remote
    mkdirSync(join(testDir, "post"), { recursive: true });
    writeFileSync(
      join(testDir, "post", "existing.md"),
      "---\ntitle: Existing\n---\n",
    );
    await git.add("-A");
    await git.commit("seed");
    await git.push("origin", "main");

    importRequests.length = 0;

    // Pull — nothing changed remotely
    await gitSync.pull();

    // Should NOT have sent any import request
    expect(importRequests).toHaveLength(0);
  });

  it("should send entity:import:request with changed file paths when pull brings changes", async () => {
    const git = simpleGit(testDir);

    // Push initial state
    mkdirSync(join(testDir, "post"), { recursive: true });
    writeFileSync(
      join(testDir, "post", "existing.md"),
      "---\ntitle: Existing\n---\n",
    );
    await git.add("-A");
    await git.commit("seed");
    await git.push("origin", "main");

    // Simulate remote changes from another "client"
    const otherDir = join(tmpdir(), `test-pull-other-${Date.now()}`);
    mkdirSync(otherDir, { recursive: true });
    await simpleGit(otherDir).clone(remoteDir, ".", ["--branch", "main"]);

    const otherGit = simpleGit(otherDir);
    writeFileSync(
      join(otherDir, "post", "existing.md"),
      "---\ntitle: Updated Remotely\n---\n",
    );
    mkdirSync(join(otherDir, "note"), { recursive: true });
    writeFileSync(
      join(otherDir, "note", "new-note.md"),
      "---\ntitle: New Note\n---\n",
    );
    await otherGit.add("-A");
    await otherGit.commit("remote changes");
    await otherGit.push("origin", "main");
    rmSync(otherDir, { recursive: true, force: true });

    importRequests.length = 0;

    // Pull — should detect changed files and send import with paths
    await gitSync.pull();

    // Should have sent exactly one import request with paths
    expect(importRequests).toHaveLength(1);
    const request = importRequests[0];
    if (!request) return;
    expect(request.paths).toBeDefined();
    if (!request.paths) return;
    expect(request.paths.length).toBeGreaterThan(0);
  });
});
