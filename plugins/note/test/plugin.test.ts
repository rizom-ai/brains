import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { NotePlugin } from "../src/plugin";
import { createPluginHarness } from "@brains/plugins/test";
import type { PluginCapabilities } from "@brains/plugins/test";

describe("NotePlugin", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let plugin: NotePlugin;
  let capabilities: PluginCapabilities;

  beforeEach(async () => {
    harness = createPluginHarness({ dataDir: "/tmp/test-datadir" });

    plugin = new NotePlugin({});
    capabilities = await harness.installPlugin(plugin);
  });

  afterEach(() => {
    harness.reset();
  });

  describe("Plugin Registration", () => {
    it("should register plugin with correct metadata", () => {
      expect(plugin.id).toBe("note");
      expect(plugin.type).toBe("service");
      expect(plugin.version).toBeDefined();
    });

    it("should provide note_create tool", () => {
      const toolNames = capabilities.tools.map((t) => t.name);
      expect(toolNames).toContain("note_create");
    });

    it("should provide note_generate tool", () => {
      const toolNames = capabilities.tools.map((t) => t.name);
      expect(toolNames).toContain("note_generate");
    });

    it("should not provide any resources", () => {
      expect(capabilities.resources).toEqual([]);
    });
  });

  describe("Tool Schemas", () => {
    it("note_create should require title and content", () => {
      const createTool = capabilities.tools.find(
        (t) => t.name === "note_create",
      );
      expect(createTool).toBeDefined();
      if (!createTool) throw new Error("createTool not found");
      expect(createTool.inputSchema["title"]).toBeDefined();
      expect(createTool.inputSchema["content"]).toBeDefined();
    });

    it("note_generate should require prompt", () => {
      const generateTool = capabilities.tools.find(
        (t) => t.name === "note_generate",
      );
      expect(generateTool).toBeDefined();
      if (!generateTool) throw new Error("generateTool not found");
      expect(generateTool.inputSchema["prompt"]).toBeDefined();
    });

    it("note_generate should have optional title", () => {
      const generateTool = capabilities.tools.find(
        (t) => t.name === "note_generate",
      );
      expect(generateTool).toBeDefined();
      if (!generateTool) throw new Error("generateTool not found");
      const titleSchema = generateTool.inputSchema["title"];
      expect(titleSchema).toBeDefined();
      if (!titleSchema) throw new Error("titleSchema not found");
      expect(titleSchema._def.typeName).toBe("ZodOptional");
    });
  });

  describe("Tool Execution", () => {
    it("note_create should create a note entity", async () => {
      const result = await harness.executeTool("note_create", {
        title: "Test Note",
        content: "This is test content for the note.",
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty("entityId");
      expect(result.data).toHaveProperty("title", "Test Note");
    });

    it("note_generate should queue a job", async () => {
      const result = await harness.executeTool("note_generate", {
        prompt: "Write a note about TypeScript",
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty("jobId");
    });
  });
});
