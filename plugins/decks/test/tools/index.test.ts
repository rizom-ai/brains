import { describe, it, expect, beforeEach } from "bun:test";
import { createGenerateTool, createPublishTool } from "../../src/tools";
import {
  MockShell,
  createServicePluginContext,
  createSilentLogger,
  type ServicePluginContext,
  type Logger,
} from "@brains/plugins/test";

describe("Deck Tools", () => {
  let context: ServicePluginContext;
  let logger: Logger;
  let mockShell: MockShell;

  beforeEach(() => {
    logger = createSilentLogger();
    mockShell = MockShell.createFresh({ logger });
    context = createServicePluginContext(mockShell, "decks");
  });

  describe("createGenerateTool", () => {
    it("should create generate tool with correct metadata", () => {
      const tool = createGenerateTool(context, "decks");

      expect(tool.name).toBe("decks_generate");
      expect(tool.description).toContain("Create a new deck draft");
      expect(tool.inputSchema).toBeDefined();
      expect(tool.visibility).toBe("anchor");
    });

    it("should create deck with provided title and content", async () => {
      const tool = createGenerateTool(context, "decks");

      const result = await tool.handler(
        {
          title: "Test Presentation",
          content: "# Slide 1\n\n---\n\n# Slide 2",
        },
        {
          interfaceType: "cli",
          userId: "test-user",
          channelId: "test-channel",
        },
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty("entityId");
      expect(result.data).toHaveProperty("title", "Test Presentation");
      expect(result.data).toHaveProperty("slug", "test-presentation");
    });

    it("should create deck with default template when content not provided", async () => {
      const tool = createGenerateTool(context, "decks");

      const result = await tool.handler(
        { title: "My Talk" },
        {
          interfaceType: "cli",
          userId: "test-user",
          channelId: "test-channel",
        },
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty("entityId");
      expect(result.data).toHaveProperty("slug", "my-talk");
    });
  });

  describe("createPublishTool", () => {
    it("should create publish tool with correct metadata", () => {
      const tool = createPublishTool(context, "decks");

      expect(tool.name).toBe("decks_publish");
      expect(tool.description).toContain("Publish a deck");
      expect(tool.inputSchema).toBeDefined();
      expect(tool.visibility).toBe("anchor");
    });

    it("should return error when neither id nor slug provided", async () => {
      const tool = createPublishTool(context, "decks");

      const result = await tool.handler(
        {},
        {
          interfaceType: "cli",
          userId: "test-user",
          channelId: "test-channel",
        },
      );

      expect(result.success).toBe(false);
      expect(result["error"]).toContain(
        "Either 'id' or 'slug' must be provided",
      );
    });

    it("should return error when deck not found", async () => {
      const tool = createPublishTool(context, "decks");

      const result = await tool.handler(
        { id: "nonexistent" },
        {
          interfaceType: "cli",
          userId: "test-user",
          channelId: "test-channel",
        },
      );

      expect(result.success).toBe(false);
      expect(result["error"]).toContain("Deck not found: nonexistent");
    });

    it("should publish deck by id", async () => {
      // First create a deck using the generate tool
      const generateTool = createGenerateTool(context, "decks");
      const createResult = await generateTool.handler(
        { title: "Test Deck" },
        {
          interfaceType: "cli",
          userId: "test-user",
          channelId: "test-channel",
        },
      );

      expect(createResult.success).toBe(true);
      const deckId = (createResult.data as { entityId: string }).entityId;

      // Now publish it
      const publishTool = createPublishTool(context, "decks");
      const result = await publishTool.handler(
        { id: deckId },
        {
          interfaceType: "cli",
          userId: "test-user",
          channelId: "test-channel",
        },
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain("published successfully");
    });

    it("should publish deck by slug", async () => {
      // First create a deck using the generate tool
      const generateTool = createGenerateTool(context, "decks");
      await generateTool.handler(
        { title: "Another Deck" },
        {
          interfaceType: "cli",
          userId: "test-user",
          channelId: "test-channel",
        },
      );

      // Now publish it by slug
      const publishTool = createPublishTool(context, "decks");
      const result = await publishTool.handler(
        { slug: "another-deck" },
        {
          interfaceType: "cli",
          userId: "test-user",
          channelId: "test-channel",
        },
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain("published successfully");
    });
  });
});
