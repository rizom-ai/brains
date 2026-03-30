import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { GitSync } from "../../src/lib/git-sync";
import { createSilentLogger } from "@brains/test-utils";
import type { GitLogEntry } from "../../src/types";

/** Safe accessor — throws in test if index is out of bounds */
function at(entries: GitLogEntry[], index: number): GitLogEntry {
  const entry = entries[index];
  if (!entry) throw new Error(`No entry at index ${index}`);
  return entry;
}

describe("GitSync history", () => {
  let testDir: string;
  let dataDir: string;
  let gitSync: GitSync;

  beforeEach(() => {
    testDir = join(tmpdir(), `test-git-history-${Date.now()}`);
    dataDir = join(testDir, "brain-data");
    mkdirSync(dataDir, { recursive: true });

    gitSync = new GitSync({
      logger: createSilentLogger(),
      dataDir,
      authorName: "Test",
      authorEmail: "test@example.com",
    });
  });

  afterEach(() => {
    gitSync.cleanup();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("log", () => {
    it("should return empty array for file with no commits", async () => {
      await gitSync.initialize();

      const result = await gitSync.log("post/nonexistent.md");
      expect(result).toEqual([]);
    });

    it("should return commit list for a tracked file", async () => {
      await gitSync.initialize();

      mkdirSync(join(dataDir, "post"), { recursive: true });
      writeFileSync(join(dataDir, "post/my-post.md"), "# First version");
      await gitSync.commit("Create post");

      const result = await gitSync.log("post/my-post.md");
      expect(result).toHaveLength(1);
      expect(at(result, 0).message).toBe("Create post");
      expect(at(result, 0).sha).toBeDefined();
      expect(at(result, 0).date).toBeDefined();
    });

    it("should return multiple commits in reverse chronological order", async () => {
      await gitSync.initialize();

      mkdirSync(join(dataDir, "post"), { recursive: true });
      writeFileSync(join(dataDir, "post/my-post.md"), "# V1");
      await gitSync.commit("First commit");

      writeFileSync(join(dataDir, "post/my-post.md"), "# V2");
      await gitSync.commit("Second commit");

      writeFileSync(join(dataDir, "post/my-post.md"), "# V3");
      await gitSync.commit("Third commit");

      const result = await gitSync.log("post/my-post.md");
      expect(result).toHaveLength(3);
      expect(at(result, 0).message).toBe("Third commit");
      expect(at(result, 1).message).toBe("Second commit");
      expect(at(result, 2).message).toBe("First commit");
    });

    it("should respect limit parameter", async () => {
      await gitSync.initialize();

      mkdirSync(join(dataDir, "post"), { recursive: true });
      writeFileSync(join(dataDir, "post/my-post.md"), "# V1");
      await gitSync.commit("First");

      writeFileSync(join(dataDir, "post/my-post.md"), "# V2");
      await gitSync.commit("Second");

      writeFileSync(join(dataDir, "post/my-post.md"), "# V3");
      await gitSync.commit("Third");

      const result = await gitSync.log("post/my-post.md", 2);
      expect(result).toHaveLength(2);
      expect(at(result, 0).message).toBe("Third");
      expect(at(result, 1).message).toBe("Second");
    });

    it("should only return commits that touch the specified file", async () => {
      await gitSync.initialize();

      mkdirSync(join(dataDir, "post"), { recursive: true });
      mkdirSync(join(dataDir, "note"), { recursive: true });

      writeFileSync(join(dataDir, "post/my-post.md"), "# Post");
      await gitSync.commit("Create post");

      writeFileSync(join(dataDir, "note/my-note.md"), "# Note");
      await gitSync.commit("Create note");

      writeFileSync(join(dataDir, "post/my-post.md"), "# Post updated");
      await gitSync.commit("Update post");

      const postLog = await gitSync.log("post/my-post.md");
      expect(postLog).toHaveLength(2);
      expect(at(postLog, 0).message).toBe("Update post");
      expect(at(postLog, 1).message).toBe("Create post");

      const noteLog = await gitSync.log("note/my-note.md");
      expect(noteLog).toHaveLength(1);
      expect(at(noteLog, 0).message).toBe("Create note");
    });

    it("should include date as ISO string", async () => {
      await gitSync.initialize();

      mkdirSync(join(dataDir, "post"), { recursive: true });
      writeFileSync(join(dataDir, "post/my-post.md"), "# Post");
      await gitSync.commit("Create post");

      const result = await gitSync.log("post/my-post.md");
      const date = new Date(at(result, 0).date);
      expect(date.getTime()).not.toBeNaN();
    });
  });

  describe("show", () => {
    it("should return file content at a specific commit", async () => {
      await gitSync.initialize();

      mkdirSync(join(dataDir, "post"), { recursive: true });
      writeFileSync(join(dataDir, "post/my-post.md"), "# First version");
      await gitSync.commit("V1");

      writeFileSync(join(dataDir, "post/my-post.md"), "# Second version");
      await gitSync.commit("V2");

      const log = await gitSync.log("post/my-post.md");
      const oldSha = at(log, 1).sha;

      const content = await gitSync.show(oldSha, "post/my-post.md");
      expect(content).toBe("# First version");
    });

    it("should return current version content", async () => {
      await gitSync.initialize();

      mkdirSync(join(dataDir, "post"), { recursive: true });
      writeFileSync(join(dataDir, "post/my-post.md"), "# Current");
      await gitSync.commit("Current version");

      const log = await gitSync.log("post/my-post.md");
      const content = await gitSync.show(at(log, 0).sha, "post/my-post.md");
      expect(content).toBe("# Current");
    });

    it("should throw for invalid sha", async () => {
      await gitSync.initialize();

      mkdirSync(join(dataDir, "post"), { recursive: true });
      writeFileSync(join(dataDir, "post/my-post.md"), "# Post");
      await gitSync.commit("Create");

      expect(
        gitSync.show(
          "0000000000000000000000000000000000000000",
          "post/my-post.md",
        ),
      ).rejects.toThrow();
    });

    it("should throw for file not in commit", async () => {
      await gitSync.initialize();

      mkdirSync(join(dataDir, "post"), { recursive: true });
      writeFileSync(join(dataDir, "post/my-post.md"), "# Post");
      await gitSync.commit("Create post");

      const log = await gitSync.log("post/my-post.md");

      expect(
        gitSync.show(at(log, 0).sha, "note/nonexistent.md"),
      ).rejects.toThrow();
    });
  });
});
