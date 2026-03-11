import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { GitSync } from "../src/lib/git-sync";
import { createMockLogger } from "@brains/test-utils";
import { mkdirSync, rmSync, writeFileSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import simpleGit from "simple-git";

/**
 * Regression test for modify/delete merge conflicts.
 *
 * Scenario that caused production outage:
 * 1. Remote deletes a file (e.g., social-post/linkedin-foo.md)
 * 2. Local modifies the same file (auto-sync wrote updated entity)
 * 3. git pull with -Xtheirs fails: "CONFLICT (modify/delete)"
 * 4. pull() throws, sync() re-throws, push never runs
 * 5. All subsequent syncs fail, unpushed commits accumulate
 *
 * The fix: catch merge conflict errors in pull(), resolve them, and continue.
 */
describe("Pull modify/delete conflict resolution", () => {
  let testDir: string;
  let remoteDir: string;
  let importRequests: Array<{ paths?: string[] }>;
  let gitSync: GitSync;

  beforeEach(async () => {
    testDir = join(tmpdir(), `test-modify-delete-${Date.now()}`);
    remoteDir = join(tmpdir(), `test-modify-delete-remote-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    mkdirSync(remoteDir, { recursive: true });

    await simpleGit(remoteDir).init(true);

    importRequests = [];

    const mockSend = async (
      _topic: string,
      payload?: unknown,
    ): Promise<{
      success: true;
      data: { imported: number; errors: never[] };
    }> => {
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
      logger: createMockLogger(),
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

  it("should resolve modify/delete conflict without throwing", async () => {
    const git = simpleGit(testDir);

    // Step 1: Both start with the same file
    mkdirSync(join(testDir, "social-post"), { recursive: true });
    writeFileSync(
      join(testDir, "social-post", "linkedin-foo.md"),
      "---\ntitle: Foo\nstatus: draft\n---\nOriginal content\n",
    );
    await git.add("-A");
    await git.commit("initial");
    await git.push("origin", "main");

    // Step 2: Remote DELETES the file
    const otherDir = join(tmpdir(), `test-md-other-${Date.now()}`);
    mkdirSync(otherDir, { recursive: true });
    await simpleGit(otherDir).clone(remoteDir, ".", ["--branch", "main"]);
    const otherGit = simpleGit(otherDir);

    unlinkSync(join(otherDir, "social-post", "linkedin-foo.md"));
    await otherGit.add("-A");
    await otherGit.commit("delete social post");
    await otherGit.push("origin", "main");
    rmSync(otherDir, { recursive: true, force: true });

    // Step 3: Local MODIFIES the same file (simulating auto-sync update)
    writeFileSync(
      join(testDir, "social-post", "linkedin-foo.md"),
      "---\ntitle: Foo\nstatus: published\n---\nUpdated content\n",
    );
    await git.add("-A");
    await git.commit("update social post locally");

    // Step 4: Pull should NOT throw — conflict must be auto-resolved
    const result = await gitSync.pull();
    expect(result).toBe(true);

    // Step 5: After resolution, working tree should be clean
    const status = await git.status();
    expect(status.conflicted).toHaveLength(0);
    expect(status.isClean()).toBe(true);
  });

  it("should not block subsequent syncs after a modify/delete conflict", async () => {
    const git = simpleGit(testDir);

    // Setup: same modify/delete scenario
    mkdirSync(join(testDir, "social-post"), { recursive: true });
    writeFileSync(
      join(testDir, "social-post", "linkedin-bar.md"),
      "---\ntitle: Bar\n---\nContent\n",
    );
    writeFileSync(
      join(testDir, "social-post", "linkedin-other.md"),
      "---\ntitle: Other\n---\nKeep this\n",
    );
    await git.add("-A");
    await git.commit("initial");
    await git.push("origin", "main");

    // Remote deletes one file
    const otherDir = join(tmpdir(), `test-md-other2-${Date.now()}`);
    mkdirSync(otherDir, { recursive: true });
    await simpleGit(otherDir).clone(remoteDir, ".", ["--branch", "main"]);
    const otherGit = simpleGit(otherDir);

    unlinkSync(join(otherDir, "social-post", "linkedin-bar.md"));
    await otherGit.add("-A");
    await otherGit.commit("delete bar");
    await otherGit.push("origin", "main");
    rmSync(otherDir, { recursive: true, force: true });

    // Local modifies deleted file
    writeFileSync(
      join(testDir, "social-post", "linkedin-bar.md"),
      "---\ntitle: Bar Updated\n---\nModified\n",
    );
    await git.add("-A");
    await git.commit("update bar locally");

    // First pull resolves the conflict
    await gitSync.pull();

    // Second pull should also succeed (no lingering conflict state)
    const result = await gitSync.pull();
    expect(result).toBe(true);

    // The other file should still exist
    expect(existsSync(join(testDir, "social-post", "linkedin-other.md"))).toBe(
      true,
    );
  });
});
