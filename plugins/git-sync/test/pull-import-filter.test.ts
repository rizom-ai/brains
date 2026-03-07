import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { GitSync } from "../src/lib/git-sync";
import { createMockLogger } from "@brains/test-utils";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import simpleGit from "simple-git";

/**
 * Regression tests for git-sync pull import filtering.
 *
 * Bug: When a file is renamed (e.g., deck/2025.md → deck/2025.md.invalid),
 * simple-git's pullResult.files includes BOTH paths:
 * - The rename format: "deck/{2025.md => 2025.md.invalid}" (or separate entries)
 * - From "delete mode" lines: "deck/2025.md" (the deleted file)
 * - From "create mode" lines: "deck/2025.md.invalid" (the created file)
 *
 * Directory-sync then tries to import "deck/2025.md" which no longer exists,
 * reads empty/truncated content, and quarantines the file.
 *
 * Fix: Filter pullResult.files to only include paths that exist on disk
 * and are importable (not .invalid, not brace-format renames).
 */
describe("Pull import filtering", () => {
  let testDir: string;
  let remoteDir: string;
  let importRequests: Array<{ paths?: string[] }>;
  let gitSync: GitSync;

  beforeEach(async () => {
    testDir = join(tmpdir(), `test-pull-filter-${Date.now()}`);
    remoteDir = join(tmpdir(), `test-pull-filter-remote-${Date.now()}`);
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

  it("should not send deleted file paths for import after rename on remote", async () => {
    const git = simpleGit(testDir);

    // Create initial files and push
    mkdirSync(join(testDir, "deck"), { recursive: true });
    writeFileSync(
      join(testDir, "deck", "tutorial.md"),
      "---\ntitle: Tutorial\nstatus: published\n---\n# Content\n",
    );
    await git.add("-A");
    await git.commit("initial");
    await git.push("origin", "main");

    // Simulate remote renames the .md to .md.invalid (quarantine on another instance)
    const otherDir = join(tmpdir(), `test-pull-filter-other-${Date.now()}`);
    mkdirSync(otherDir, { recursive: true });
    await simpleGit(otherDir).clone(remoteDir, ".", ["--branch", "main"]);
    const otherGit = simpleGit(otherDir);

    // Rename to .invalid on remote
    await otherGit.raw(["mv", "deck/tutorial.md", "deck/tutorial.md.invalid"]);
    await otherGit.commit("quarantine tutorial");
    await otherGit.push("origin", "main");
    rmSync(otherDir, { recursive: true, force: true });

    importRequests.length = 0;

    // Pull — remote renamed .md → .md.invalid
    await gitSync.pull();

    // Should either:
    // a) Not send import request at all (no importable files changed)
    // b) Send import request with only existing, non-.invalid paths
    if (importRequests.length > 0) {
      const paths = importRequests[0]?.paths ?? [];
      // Should NOT include the deleted .md path
      for (const path of paths) {
        expect(path).not.toEqual("deck/tutorial.md");
        // Should not include paths that don't exist on disk
        if (!path.includes("{")) {
          expect(existsSync(join(testDir, path))).toBe(true);
        }
      }
    }
  });

  it("should only send paths of files that exist on disk after pull", async () => {
    const git = simpleGit(testDir);

    // Create initial files and push
    mkdirSync(join(testDir, "deck"), { recursive: true });
    mkdirSync(join(testDir, "post"), { recursive: true });
    writeFileSync(
      join(testDir, "deck", "2025.md"),
      "---\ntitle: 2025\nstatus: published\n---\n",
    );
    writeFileSync(
      join(testDir, "post", "hello.md"),
      "---\ntitle: Hello\n---\n",
    );
    await git.add("-A");
    await git.commit("initial");
    await git.push("origin", "main");

    // Remote: rename deck to .invalid, update post
    const otherDir = join(tmpdir(), `test-pull-filter-other2-${Date.now()}`);
    mkdirSync(otherDir, { recursive: true });
    await simpleGit(otherDir).clone(remoteDir, ".", ["--branch", "main"]);
    const otherGit = simpleGit(otherDir);

    await otherGit.raw(["mv", "deck/2025.md", "deck/2025.md.invalid"]);
    writeFileSync(
      join(otherDir, "post", "hello.md"),
      "---\ntitle: Hello Updated\n---\n",
    );
    await otherGit.add("-A");
    await otherGit.commit("quarantine deck, update post");
    await otherGit.push("origin", "main");
    rmSync(otherDir, { recursive: true, force: true });

    importRequests.length = 0;
    await gitSync.pull();

    // Should have sent import request
    expect(importRequests.length).toBeGreaterThan(0);
    const paths = importRequests[0]?.paths ?? [];

    // All non-brace paths should exist on disk
    for (const path of paths) {
      if (!path.includes("{")) {
        expect(existsSync(join(testDir, path))).toBe(true);
      }
    }

    // Should include the updated post
    const hasUpdatedPost = paths.some(
      (p) => p === "post/hello.md" || p.includes("hello.md"),
    );
    expect(hasUpdatedPost).toBe(true);
  });
});
