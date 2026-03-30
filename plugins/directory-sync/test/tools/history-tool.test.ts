import { describe, it, expect, mock, beforeEach } from "bun:test";
import { createHistoryTool } from "../../src/tools/history";
import type { IGitSync, GitLogEntry } from "../../src/types";
import { toolResultSchema, type Tool } from "@brains/plugins";
import { createMockGitSync } from "../fixtures";

function parseToolResult(raw: unknown): {
  success: boolean;
  data?: Record<string, unknown> | undefined;
  error?: string | undefined;
  message?: string | undefined;
} {
  const parsed = toolResultSchema.parse(raw);
  if (parsed.success) {
    return {
      success: true,
      data: parsed.data as Record<string, unknown>,
      message: parsed.message,
    };
  }
  return { success: false, error: parsed.error };
}

const toolContext = { interfaceType: "mcp" as const, userId: "test" };

const sampleLog: GitLogEntry[] = [
  { sha: "abc123", date: "2026-03-28T14:30:00+00:00", message: "Update post" },
  {
    sha: "def456",
    date: "2026-03-27T10:00:00+00:00",
    message: "Create post",
  },
];

describe("directory-sync_history tool", () => {
  let tool: Tool;
  let logMock: ReturnType<typeof mock>;
  let showMock: ReturnType<typeof mock>;

  beforeEach(() => {
    logMock = mock(async () => sampleLog);
    showMock = mock(async () => "# Old content");

    const gitSync: IGitSync = createMockGitSync({
      log: logMock,
      show: showMock,
    });

    tool = createHistoryTool("directory-sync", gitSync);
  });

  describe("list mode (no sha)", () => {
    it("should return commit list for an entity", async () => {
      const result = parseToolResult(
        await tool.handler({ entityType: "post", id: "my-post" }, toolContext),
      );

      expect(result.success).toBe(true);
      expect(logMock).toHaveBeenCalledWith("post/my-post.md", 10);

      const commits = result.data?.["commits"] as GitLogEntry[];
      expect(commits).toHaveLength(2);
      expect(commits[0]).toMatchObject({ sha: "abc123" });
      expect(commits[1]).toMatchObject({ message: "Create post" });
    });

    it("should pass custom limit", async () => {
      await tool.handler(
        { entityType: "post", id: "my-post", limit: 5 },
        toolContext,
      );

      expect(logMock).toHaveBeenCalledWith("post/my-post.md", 5);
    });

    it("should return message when no history found", async () => {
      logMock.mockResolvedValue([]);

      const result = parseToolResult(
        await tool.handler({ entityType: "post", id: "my-post" }, toolContext),
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain("No history");
    });
  });

  describe("version mode (with sha)", () => {
    it("should return file content at specific commit", async () => {
      const result = parseToolResult(
        await tool.handler(
          { entityType: "post", id: "my-post", sha: "def456" },
          toolContext,
        ),
      );

      expect(result.success).toBe(true);
      expect(showMock).toHaveBeenCalledWith("def456", "post/my-post.md");
      expect(result.data?.["content"]).toBe("# Old content");
      expect(result.data?.["sha"]).toBe("def456");
    });

    it("should return error for invalid sha", async () => {
      showMock.mockRejectedValue(new Error("fatal: bad revision"));

      const result = parseToolResult(
        await tool.handler(
          { entityType: "post", id: "my-post", sha: "invalid" },
          toolContext,
        ),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("bad revision");
    });
  });

  describe("no git configured", () => {
    it("should not be registered — plugin guards with if (gitSync)", () => {
      // createHistoryTool requires IGitSync — the plugin only calls it when git is configured.
      // This test documents the contract: no gitSync → don't call createHistoryTool.
      expect(typeof createHistoryTool).toBe("function");
    });
  });

  describe("tool metadata", () => {
    it("should have correct name", () => {
      expect(tool.name).toBe("directory-sync_history");
    });

    it("should have a description", () => {
      expect(tool.description).toBeDefined();
      expect(tool.description.length).toBeGreaterThan(0);
    });
  });
});
