import { describe, it, expect, beforeEach } from "bun:test";
import type {
  ServicePluginContext,
  ToolContext,
  PluginTool,
} from "@brains/plugins";
import { createNoteTools } from "../src/tools";
import { createMockServicePluginContext } from "@brains/test-utils";

// Mock context
function createMockContext(): ServicePluginContext {
  return createMockServicePluginContext({
    returns: {
      jobsEnqueue: "job-456",
      generateContent: { title: "AI Title", body: "AI Body" },
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
      expect(result.data).toBeDefined();
      expect(context.entityService.createEntity).toHaveBeenCalled();
    });

    it("should require title", async () => {
      const result = await createTool.handler(
        { content: "Content without title" },
        createMockToolContext(),
      );

      expect(result.success).toBe(false);
      expect(result["error"]).toBeDefined();
    });

    it("should require content", async () => {
      const result = await createTool.handler(
        { title: "Title without content" },
        createMockToolContext(),
      );

      expect(result.success).toBe(false);
      expect(result["error"]).toBeDefined();
    });

    it("should return entityId on success", async () => {
      const result = await createTool.handler(
        { title: "Test", content: "Body" },
        createMockToolContext(),
      );

      expect(result.success).toBe(true);
      expect(result.data?.["entityId"]).toBe("note-123");
    });
  });

  describe("note_generate", () => {
    it("should queue a generation job with prompt", async () => {
      const result = await generateTool.handler(
        { prompt: "Write about TypeScript" },
        createMockToolContext(),
      );

      expect(result.success).toBe(true);
      expect(result.data?.jobId).toBe("job-456");
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
      expect(result.data?.jobId).toBeDefined();
    });

    it("should return jobId on success", async () => {
      const result = await generateTool.handler(
        { prompt: "Generate note" },
        createMockToolContext(),
      );

      expect(result.success).toBe(true);
      expect(result.data?.jobId).toBe("job-456");
    });
  });
});
