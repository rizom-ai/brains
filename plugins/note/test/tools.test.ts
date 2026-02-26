import { describe, it, expect, beforeEach } from "bun:test";
import type {
  ServicePluginContext,
  ToolContext,
  PluginTool,
} from "@brains/plugins";
import { createNoteTools } from "../src/tools";
import { createMockServicePluginContext } from "@brains/test-utils";
import { z } from "@brains/utils";

// Schemas for parsing tool response data
const entityIdData = z.object({ entityId: z.string() });
const jobIdData = z.object({ jobId: z.string() });

// Mock context
function createMockContext(): ServicePluginContext {
  return createMockServicePluginContext({
    returns: {
      jobsEnqueue: "job-456",
      ai: {
        generate: { title: "AI Title", body: "AI Body" },
      },
      entityService: {
        createEntity: { entityId: "note-123" },
        getEntity: null,
        updateEntity: { entityId: "note-123" },
        listEntities: [],
      },
    },
  });
}

function createMockToolContext(): ToolContext {
  return {
    interfaceType: "cli",
    userId: "user-789",
  };
}

function getTool(tools: PluginTool[], name: string): PluginTool {
  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    throw new Error(`Tool ${name} not found`);
  }
  return tool;
}

describe("Note Tools", () => {
  let context: ServicePluginContext;
  let tools: ReturnType<typeof createNoteTools>;
  let createTool: PluginTool;
  let generateTool: PluginTool;

  beforeEach(() => {
    context = createMockContext();
    tools = createNoteTools("note", context);
    createTool = getTool(tools, "note_create");
    generateTool = getTool(tools, "note_generate");
  });

  describe("createNoteTools", () => {
    it("should create two tools", () => {
      expect(tools).toHaveLength(2);
    });

    it("should create note_create tool", () => {
      expect(createTool).toBeDefined();
      expect(createTool.description).toContain("Create");
    });

    it("should create note_generate tool", () => {
      expect(generateTool).toBeDefined();
      expect(generateTool.description).toContain("AI");
    });
  });

  describe("note_create", () => {
    it("should create a note with title and content", async () => {
      const result = await createTool.handler(
        { title: "My Note", content: "Some content" },
        createMockToolContext(),
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeDefined();
      }
      expect(context.entityService.createEntity).toHaveBeenCalled();
    });

    it("should slugify the entity ID", async () => {
      await createTool.handler(
        { title: "My Note With Spaces", content: "Body" },
        createMockToolContext(),
      );

      expect(context.entityService.createEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "my-note-with-spaces",
        }),
      );
    });

    it("should preserve existing frontmatter and inject title", async () => {
      const contentWithFrontmatter =
        "---\ntags:\n  - test\n---\n\nSome body content";

      await createTool.handler(
        { title: "My Note", content: contentWithFrontmatter },
        createMockToolContext(),
      );

      const call = (
        context.entityService.createEntity as ReturnType<
          typeof import("bun:test").mock
        >
      ).mock.calls[0] as [{ content: string }];
      const savedContent = call[0].content;

      // Should contain the original tag
      expect(savedContent).toContain("tags:");
      expect(savedContent).toContain("- test");
      // Should contain the title in frontmatter
      expect(savedContent).toContain("title: My Note");
      // Should contain the body
      expect(savedContent).toContain("Some body content");
    });

    it("should save content as-is when it has no frontmatter", async () => {
      await createTool.handler(
        { title: "Plain Note", content: "Just plain text" },
        createMockToolContext(),
      );

      const call = (
        context.entityService.createEntity as ReturnType<
          typeof import("bun:test").mock
        >
      ).mock.calls[0] as [{ content: string }];
      const savedContent = call[0].content;

      // No frontmatter should be injected
      expect(savedContent).not.toContain("---");
      expect(savedContent).toBe("Just plain text");
    });

    it("should not duplicate title if already in frontmatter", async () => {
      const contentWithTitle = "---\ntitle: Original Title\n---\n\nBody";

      await createTool.handler(
        { title: "Original Title", content: contentWithTitle },
        createMockToolContext(),
      );

      const call = (
        context.entityService.createEntity as ReturnType<
          typeof import("bun:test").mock
        >
      ).mock.calls[0] as [{ content: string }];
      const savedContent = call[0].content;

      // Title should appear exactly once in frontmatter
      const titleMatches = savedContent.match(/title:/g);
      expect(titleMatches).toHaveLength(1);
    });

    it("should require title", async () => {
      const result = await createTool.handler(
        { content: "Content without title" },
        createMockToolContext(),
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });

    it("should require content", async () => {
      const result = await createTool.handler(
        { title: "Title without content" },
        createMockToolContext(),
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });

    it("should return entityId on success", async () => {
      const result = await createTool.handler(
        { title: "Test", content: "Body" },
        createMockToolContext(),
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const data = entityIdData.parse(result.data);
        expect(data.entityId).toBe("note-123");
      }
    });
  });

  describe("note_generate", () => {
    it("should queue a generation job with prompt", async () => {
      const result = await generateTool.handler(
        { prompt: "Write about TypeScript" },
        createMockToolContext(),
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const data = jobIdData.parse(result.data);
        expect(data.jobId).toBe("job-456");
      }
      expect(context.jobs.enqueue).toHaveBeenCalled();
    });

    it("should accept optional title", async () => {
      const result = await generateTool.handler(
        { prompt: "Write about X", title: "My Title" },
        createMockToolContext(),
      );

      expect(result.success).toBe(true);
      expect(context.jobs.enqueue).toHaveBeenCalledWith(
        "generation",
        expect.objectContaining({ title: "My Title" }),
        expect.anything(),
        expect.anything(),
      );
    });

    it("should work with prompt only", async () => {
      const result = await generateTool.handler(
        { prompt: "Summarize key concepts" },
        createMockToolContext(),
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const data = jobIdData.parse(result.data);
        expect(data.jobId).toBeDefined();
      }
    });

    it("should return jobId on success", async () => {
      const result = await generateTool.handler(
        { prompt: "Generate note" },
        createMockToolContext(),
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const data = jobIdData.parse(result.data);
        expect(data.jobId).toBe("job-456");
      }
    });
  });
});
