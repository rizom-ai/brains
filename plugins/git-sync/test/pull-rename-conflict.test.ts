import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { GitSync } from "../src/lib/git-sync";
import { createMockLogger } from "@brains/test-utils";
import { mkdirSync, rmSync, writeFileSync, existsSync, renameSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import simpleGit from "simple-git";

/**
 * Regression test for the exact quarantine cycle:
 *
 * 1. Both local and remote start with deck/tutorial.md
 * 2. Remote: quarantine renames to deck/tutorial.md.invalid, commits, pushes
 * 3. Local: user manually restores deck/tutorial.md (renames .invalid back)
 * 4. Git-sync: commits local restore, then pulls with -Xtheirs
 * 5. -Xtheirs merge: remote wins → deck/tutorial.md deleted, .invalid restored
 * 6. pullResult.files may include "deck/tutorial.md" as a changed file
 * 7. directory-sync tries to import deck/tutorial.md → file doesn't exist or is empty → quarantine
 *
 * The fix: git-sync should filter pullResult.files to only include
 * files that actually exist on disk after the merge completes.
 */
describe("Pull rename conflict (quarantine cycle)", () => {
  let testDir: string;
  let remoteDir: string;
  let importRequests: Array<{ paths?: string[] }>;
  let gitSync: GitSync;

  beforeEach(async () => {
    testDir = join(tmpdir(), `test-rename-conflict-${Date.now()}`);
    remoteDir = join(tmpdir(), `test-rename-conflict-remote-${Date.now()}`);
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

  it("should not import non-existent files when remote has .invalid renames", async () => {
    const git = simpleGit(testDir);

    // Step 1: Both start with .md files
    mkdirSync(join(testDir, "deck"), { recursive: true });
    writeFileSync(
      join(testDir, "deck", "tutorial.md"),
      "---\ntitle: Tutorial\nstatus: published\n---\n# Content\n",
    );
    writeFileSync(
      join(testDir, "deck", "2025.md"),
      "---\ntitle: 2025\nstatus: published\n---\n# Content\n",
    );
    await git.add("-A");
    await git.commit("initial");
    await git.push("origin", "main");

    // Step 2: Remote renames .md → .md.invalid (simulating quarantine on server)
    const otherDir = join(tmpdir(), `test-rename-other-${Date.now()}`);
    mkdirSync(otherDir, { recursive: true });
    await simpleGit(otherDir).clone(remoteDir, ".", ["--branch", "main"]);
    const otherGit = simpleGit(otherDir);

    renameSync(
      join(otherDir, "deck", "tutorial.md"),
      join(otherDir, "deck", "tutorial.md.invalid"),
    );
    renameSync(
      join(otherDir, "deck", "2025.md"),
      join(otherDir, "deck", "2025.md.invalid"),
    );
    await otherGit.add("-A");
    await otherGit.commit("quarantine decks");
    await otherGit.push("origin", "main");
    rmSync(otherDir, { recursive: true, force: true });

    // Step 3: Local still has .md files (user's manual restore or just unmodified)
    // The .md files exist locally because we haven't pulled yet
    expect(existsSync(join(testDir, "deck", "tutorial.md"))).toBe(true);
    expect(existsSync(join(testDir, "deck", "2025.md"))).toBe(true);

    importRequests.length = 0;

    // Step 4: Pull with -Xtheirs — remote wins
    await gitSync.pull();

    // Step 5: After pull, only .invalid files should exist
    expect(existsSync(join(testDir, "deck", "tutorial.md.invalid"))).toBe(true);
    expect(existsSync(join(testDir, "deck", "2025.md.invalid"))).toBe(true);

    // Step 6: Verify import request doesn't include non-existent .md paths
    if (importRequests.length > 0) {
      const paths = importRequests[0]?.paths ?? [];
      for (const path of paths) {
        // Skip brace-format rename paths (already handled by import pipeline)
        if (path.includes("{")) continue;
        // Every path sent for import must exist on disk
        const fullPath = join(testDir, path);
        expect(existsSync(fullPath)).toBe(true);
      }
    }
  });

  it("should still import valid changed files alongside renames", async () => {
    const git = simpleGit(testDir);

    // Start with files
    mkdirSync(join(testDir, "deck"), { recursive: true });
    mkdirSync(join(testDir, "post"), { recursive: true });
    writeFileSync(
      join(testDir, "deck", "tutorial.md"),
      "---\ntitle: Tutorial\nstatus: published\n---\n",
    );
    writeFileSync(
      join(testDir, "post", "hello.md"),
      "---\ntitle: Hello\n---\n",
    );
    await git.add("-A");
    await git.commit("initial");
    await git.push("origin", "main");

    // Remote: quarantine deck AND update post
    const otherDir = join(tmpdir(), `test-rename-other2-${Date.now()}`);
    mkdirSync(otherDir, { recursive: true });
    await simpleGit(otherDir).clone(remoteDir, ".", ["--branch", "main"]);
    const otherGit = simpleGit(otherDir);

    renameSync(
      join(otherDir, "deck", "tutorial.md"),
      join(otherDir, "deck", "tutorial.md.invalid"),
    );
    writeFileSync(
      join(otherDir, "post", "hello.md"),
      "---\ntitle: Hello Updated\n---\nNew content\n",
    );
    await otherGit.add("-A");
    await otherGit.commit("quarantine deck + update post");
    await otherGit.push("origin", "main");
    rmSync(otherDir, { recursive: true, force: true });

    importRequests.length = 0;
    await gitSync.pull();

    // Should have import request
    expect(importRequests.length).toBeGreaterThan(0);
    const paths = importRequests[0]?.paths ?? [];

    // All non-brace paths must exist on disk
    for (const path of paths) {
      if (path.includes("{")) continue;
      expect(existsSync(join(testDir, path))).toBe(true);
    }
  });
});
