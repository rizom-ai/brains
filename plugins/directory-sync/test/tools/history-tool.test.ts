import { beforeEach, describe, expect, it, mock } from "bun:test";
import { handleHistory, parseHistoryInput } from "../../src/tools/history";
import type { GitLogEntry, IGitSync } from "../../src/types";
import { createMockGitSync } from "../fixtures";

const sampleLog: GitLogEntry[] = [
  { sha: "abc123", date: "2026-03-28T14:30:00+00:00", message: "Update post" },
  {
    sha: "def456",
    date: "2026-03-27T10:00:00+00:00",
    message: "Create post",
  },
];

/**
 * The history action reads one entity's versions out of git: the list of
 * commits that touched its file, or the content at one revision.
 */
describe("the history action", () => {
  let gitSync: IGitSync;
  let logMock: ReturnType<typeof mock>;
  let showMock: ReturnType<typeof mock>;

  beforeEach(() => {
    logMock = mock(async () => sampleLog);
    showMock = mock(async () => "# Old content");
    gitSync = createMockGitSync({ log: logMock, show: showMock });
  });

  describe("list mode (no sha)", () => {
    it("returns the commits that touched the entity's file", async () => {
      const outcome = await handleHistory(
        { entityType: "post", id: "my-post", limit: 10 },
        gitSync,
      );

      expect(logMock).toHaveBeenCalledWith("post/my-post.md", 10);
      expect(outcome).toMatchObject({
        entityType: "post",
        id: "my-post",
        commits: sampleLog,
        message: "2 versions found",
      });
    });

    it("says so when there is no history", async () => {
      logMock.mockImplementation(async () => []);

      const outcome = await handleHistory(
        { entityType: "post", id: "new-post" },
        gitSync,
      );

      expect(outcome).toMatchObject({
        commits: [],
        message: "No history found for post/new-post",
      });
    });

    it("defaults the limit to ten", () => {
      expect(parseHistoryInput({ entityType: "post", id: "p" })).toEqual({
        entityType: "post",
        id: "p",
        limit: 10,
      });
    });
  });

  describe("show mode (with sha)", () => {
    it("returns the content at that revision", async () => {
      const outcome = await handleHistory(
        { entityType: "post", id: "my-post", sha: "abc123" },
        gitSync,
      );

      expect(showMock).toHaveBeenCalledWith("abc123", "post/my-post.md");
      expect(outcome).toEqual({
        sha: "abc123",
        entityType: "post",
        id: "my-post",
        content: "# Old content",
        message: "Content at abc123",
      });
    });
  });

  it("lets a git failure reach the caller as the failure it was", async () => {
    logMock.mockImplementation(async () => {
      throw new Error("not a git repository");
    });

    expect(
      handleHistory({ entityType: "post", id: "my-post" }, gitSync),
    ).rejects.toThrow("not a git repository");
  });
});
