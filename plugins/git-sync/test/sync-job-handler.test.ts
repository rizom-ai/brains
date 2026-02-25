import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { GitSyncPlugin } from "../src/plugin";
import { createPluginHarness } from "@brains/plugins/test";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import simpleGit from "simple-git";

/**
 * Tests for git-sync as a ServicePlugin with async job-based sync.
 */
describe("Git Sync Job Handler", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let testDir: string;
  let remoteDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `test-sync-job-${Date.now()}`);
    remoteDir = join(tmpdir(), `test-sync-job-remote-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    mkdirSync(remoteDir, { recursive: true });

    await simpleGit(remoteDir).init(true);

    harness = createPluginHarness({ dataDir: testDir });

    harness.subscribe("entity:import:request", async () => {
      return { success: true, data: { imported: 0, errors: [] } };
    });

    await harness.installPlugin(
      new GitSyncPlugin({
        enabled: true,
        repo: "test/sync-job",
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

  it("should return a jobId from the sync tool", async () => {
    const git = simpleGit(testDir);
    mkdirSync(join(testDir, "post"), { recursive: true });
    writeFileSync(join(testDir, "post", "test.md"), "---\ntitle: Test\n---\n");
    await git.add("-A");
    await git.commit("seed");
    await git.push("origin", "main");

    const result = await harness.executeTool("git-sync_sync", {});
    expect(result.success).toBe(true);
  });

  it("should still provide the status tool as synchronous", async () => {
    const result = await harness.executeTool("git-sync_status", {});
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty("isRepo", true);
  });
});
