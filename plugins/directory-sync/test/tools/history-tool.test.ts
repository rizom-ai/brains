import { createMockServicePluginContext } from "@brains/plugins/test";
import { describe, it, expect, mock, beforeEach } from "bun:test";
import { createDirectorySyncTools } from "../../src/tools";
import type { GitLogEntry, IGitSync } from "../../src/types";
import { toolResultSchema, type Tool, type ToolContext } from "@brains/plugins";
import { createMockDirectorySync, createMockGitSync } from "../fixtures";
import { z } from "@brains/utils/zod";

function parseToolResult(raw: unknown): z.output<typeof toolResultSchema> {
  return toolResultSchema.parse(raw);
}

const successDataSchema = z.object({
  commits: z
    .array(z.object({ sha: z.string(), message: z.string() }))
    .optional(),
  content: z.string().optional(),
  sha: z.string().optional(),
});

const toolContext = {
  interfaceType: "mcp",
  actor: { kind: "user", userId: "test" },
} satisfies ToolContext;

const sampleLog: GitLogEntry[] = [
  { sha: "abc123", date: "2026-03-28T14:30:00+00:00", message: "Update post" },
  {
    sha: "def456",
    date: "2026-03-27T10:00:00+00:00",
    message: "Create post",
  },
];

describe("directory_sync history action", () => {
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

    const [createdTool] = createDirectorySyncTools(
      createMockDirectorySync(),
      createMockServicePluginContext(),
      "directory-sync",
      gitSync,
    );
    if (!createdTool) throw new Error("Expected directory sync tool");
    tool = createdTool;
  });

  describe("list mode (no sha)", () => {
    it("should return commit list for an entity", async () => {
      const result = parseToolResult(
        await tool.handler(
          { action: "history", entityType: "post", id: "my-post" },
          toolContext,
        ),
      );

      expect(result.success).toBe(true);
      expect(logMock).toHaveBeenCalledWith("post/my-post.md", 10);

      if (!result.success) throw new Error("Expected success");
      const data = successDataSchema.parse(result.data);
      expect(data.commits).toHaveLength(2);
      expect(data.commits?.[0]).toMatchObject({ sha: "abc123" });
      expect(data.commits?.[1]).toMatchObject({ message: "Create post" });
    });

    it("should pass custom limit", async () => {
      await tool.handler(
        { action: "history", entityType: "post", id: "my-post", limit: 5 },
        toolContext,
      );

      expect(logMock).toHaveBeenCalledWith("post/my-post.md", 5);
    });

    it("should return message when no history found", async () => {
      logMock.mockResolvedValue([]);

      const result = parseToolResult(
        await tool.handler(
          { action: "history", entityType: "post", id: "my-post" },
          toolContext,
        ),
      );

      expect(result.success).toBe(true);
      if (!result.success) throw new Error("Expected success");
      expect(result.message).toContain("No history");
    });
  });

  describe("version mode (with sha)", () => {
    it("should return file content at specific commit", async () => {
      const result = parseToolResult(
        await tool.handler(
          {
            action: "history",
            entityType: "post",
            id: "my-post",
            sha: "def456",
          },
          toolContext,
        ),
      );

      expect(result.success).toBe(true);
      expect(showMock).toHaveBeenCalledWith("def456", "post/my-post.md");

      if (!result.success) throw new Error("Expected success");
      const data = successDataSchema.parse(result.data);
      expect(data.content).toBe("# Old content");
      expect(data.sha).toBe("def456");
    });

    it("should return error for invalid sha", async () => {
      showMock.mockRejectedValue(new Error("fatal: bad revision"));

      const result = parseToolResult(
        await tool.handler(
          {
            action: "history",
            entityType: "post",
            id: "my-post",
            sha: "invalid",
          },
          toolContext,
        ),
      );

      expect(result.success).toBe(false);
      if (result.success) throw new Error("Expected failure");
      expect(result.error).toContain("bad revision");
    });
  });

  describe("no git configured", () => {
    it("should not expose the history action", () => {
      const [noGitTool] = createDirectorySyncTools(
        createMockDirectorySync(),
        createMockServicePluginContext(),
        "directory-sync",
      );
      if (!noGitTool) throw new Error("Expected directory sync tool");

      expect(Object.keys(noGitTool.inputSchema)).not.toContain("entityType");
    });
  });

  describe("tool metadata", () => {
    it("should have correct name", () => {
      expect(tool.name).toBe("directory_sync");
    });

    it("declares admin-only external semantics", () => {
      expect(tool.visibility).toBe("admin");
      expect(tool.sideEffects).toBe("external");
    });

    it("should have a description", () => {
      expect(tool.description).toBeDefined();
      expect(tool.description.length).toBeGreaterThan(0);
    });
  });
});
