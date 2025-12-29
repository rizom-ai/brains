import { describe, it, expect, beforeEach } from "bun:test";
import {
  createGenerateTool,
  createQueueTool,
  createPublishTool,
  createEditTool,
  generateInputSchema,
  queueInputSchema,
  publishInputSchema,
  editInputSchema,
} from "../../src/tools";
import { socialMediaConfigSchema } from "../../src/config";
import { createSilentLogger } from "@brains/test-utils";
import {
  MockShell,
  createServicePluginContext,
  type ServicePluginContext,
  type Logger,
} from "@brains/plugins/test";
import type { ToolContext } from "@brains/plugins";

// Helper to create a null tool context for tests
const nullContext = null as unknown as ToolContext;

describe("Social Media Tools", () => {
  let context: ServicePluginContext;
  let logger: Logger;
  let mockShell: MockShell;
  const pluginId = "social-media";
  const config = socialMediaConfigSchema.parse({});

  beforeEach(() => {
    logger = createSilentLogger();
    mockShell = MockShell.createFresh({ logger });
    context = createServicePluginContext(mockShell, pluginId);
  });

  describe("createGenerateTool", () => {
    it("should create a generate tool", () => {
      const tool = createGenerateTool(context, config, pluginId);
      expect(tool.name).toBe("social-media_generate");
      expect(tool.handler).toBeDefined();
    });

    it("should have correct input schema", () => {
      const result = generateInputSchema.safeParse({
        prompt: "Test prompt",
        platform: "linkedin",
      });
      expect(result.success).toBe(true);
    });

    it("should validate sourceEntityType when sourceEntityId is provided", () => {
      // This should pass schema validation but fail tool validation
      const result = generateInputSchema.safeParse({
        sourceEntityId: "post-123",
        // Missing sourceEntityType
      });
      expect(result.success).toBe(true); // Schema allows it, but tool will reject
    });

    it("should require at least one content source", async () => {
      const tool = createGenerateTool(context, config, pluginId);
      const result = await tool.handler({}, nullContext);
      expect(result.success).toBe(false);
      expect(result["error"]).toContain("prompt");
    });
  });

  describe("createQueueTool", () => {
    it("should create a queue tool", () => {
      const tool = createQueueTool(context, pluginId);
      expect(tool.name).toBe("social-media_queue");
      expect(tool.handler).toBeDefined();
    });

    it("should accept list action", () => {
      const result = queueInputSchema.safeParse({
        action: "list",
      });
      expect(result.success).toBe(true);
    });

    it("should accept add action with postId", () => {
      const result = queueInputSchema.safeParse({
        action: "add",
        postId: "post-123",
      });
      expect(result.success).toBe(true);
    });

    it("should accept reorder action with position", () => {
      const result = queueInputSchema.safeParse({
        action: "reorder",
        postId: "post-123",
        position: 2,
      });
      expect(result.success).toBe(true);
    });

    it("should handle list action on empty queue", async () => {
      const tool = createQueueTool(context, pluginId);
      const result = await tool.handler({ action: "list" }, nullContext);
      expect(result.success).toBe(true);
      expect(result.message).toContain("No posts");
    });
  });

  describe("createPublishTool", () => {
    it("should create a publish tool", () => {
      const tool = createPublishTool(context, pluginId);
      expect(tool.name).toBe("social-media_publish");
      expect(tool.handler).toBeDefined();
    });

    it("should require id or slug", async () => {
      const tool = createPublishTool(context, pluginId);
      const result = await tool.handler({}, nullContext);
      expect(result.success).toBe(false);
      expect(result["error"]).toContain("id");
    });

    it("should accept id parameter", () => {
      const result = publishInputSchema.safeParse({
        id: "post-123",
      });
      expect(result.success).toBe(true);
    });

    it("should accept slug parameter", () => {
      const result = publishInputSchema.safeParse({
        slug: "my-post-slug",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("createEditTool", () => {
    it("should create an edit tool", () => {
      const tool = createEditTool(context, pluginId);
      expect(tool.name).toBe("social-media_edit");
      expect(tool.handler).toBeDefined();
    });

    it("should require id or slug", async () => {
      const tool = createEditTool(context, pluginId);
      const result = await tool.handler(
        { content: "New content" },
        nullContext,
      );
      expect(result.success).toBe(false);
      expect(result["error"]).toContain("id");
    });

    it("should require content or status to update", async () => {
      const tool = createEditTool(context, pluginId);
      const result = await tool.handler({ id: "post-123" }, nullContext);
      expect(result.success).toBe(false);
      expect(result["error"]).toContain("content");
    });

    it("should accept valid edit input", () => {
      const result = editInputSchema.safeParse({
        id: "post-123",
        content: "Updated content",
        status: "draft",
      });
      expect(result.success).toBe(true);
    });

    it("should only allow draft or queued status", () => {
      const result = editInputSchema.safeParse({
        id: "post-123",
        status: "published",
      });
      expect(result.success).toBe(false);
    });
  });
});
