import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createLinkCommands } from "../../src/commands";
import {
  MockShell,
  createServicePluginContext,
  createSilentLogger,
  type ServicePluginContext,
  type CommandContext,
  type Logger,
} from "@brains/plugins";
import {
  mockLinkContent,
  mockLinkEntity,
  mockAIResponse,
} from "../fixtures/link-entities";

describe("Link Commands", () => {
  let context: ServicePluginContext;
  let logger: Logger;
  let mockShell: MockShell;
  let commands: ReturnType<typeof createLinkCommands>;
  let mockCommandContext: CommandContext;

  beforeEach(() => {
    logger = createSilentLogger();
    mockShell = new MockShell({ logger });
    context = createServicePluginContext(mockShell, "link");
    commands = createLinkCommands("link", context);

    // Mock command context
    mockCommandContext = {
      messageId: "test-message-id",
      userId: "test-user",
      channelId: "test-channel",
      sendMessage: mock(async () => {}),
      sendError: mock(async () => {}),
      sendProgress: mock(async () => {}),
    };
  });

  describe("link-capture command", () => {
    it("should have correct metadata", () => {
      const captureCommand = commands.find(
        (cmd) => cmd.name === "link-capture",
      );

      expect(captureCommand).toBeDefined();
      expect(captureCommand?.description).toBe(
        "Capture a web link with AI-powered content extraction",
      );
      expect(captureCommand?.usage).toContain("<url>");
      expect(captureCommand?.usage).toContain("--tags");
    });

    it("should capture link with AI extraction", async () => {
      const captureCommand = commands.find(
        (cmd) => cmd.name === "link-capture",
      )!;

      // Mock the AI content generation
      context.generateContent = mock(async () => mockAIResponse.complete);

      const result = await captureCommand.handler(
        ["https://example.com/test", "custom", "tag"],
        mockCommandContext,
      );

      expect(result.type).toBe("message");
      expect(result.message).toContain("Successfully captured");
      expect(result.message).toContain("Test Article");
      expect(result.message).toContain("https://example.com/test");
    });

    it("should require URL argument", async () => {
      const captureCommand = commands.find(
        (cmd) => cmd.name === "link-capture",
      )!;

      const result = await captureCommand.handler([], mockCommandContext);

      expect(result.type).toBe("message");
      expect(result.message).toContain("Usage:");
    });

    it("should handle capture errors", async () => {
      const captureCommand = commands.find(
        (cmd) => cmd.name === "link-capture",
      )!;

      // Mock AI service to throw error
      context.generateContent = mock(async () => {
        throw new Error("AI service failed");
      });

      const result = await captureCommand.handler(
        ["https://example.com/test"],
        mockCommandContext,
      );

      expect(result.type).toBe("message");
      expect(result.message).toContain("Failed to capture link");
    });
  });

  describe("link-list command", () => {
    it("should have correct metadata", () => {
      const listCommand = commands.find((cmd) => cmd.name === "link-list");

      expect(listCommand).toBeDefined();
      expect(listCommand?.description).toBe("List captured links");
      expect(listCommand?.usage).toContain("--limit");
    });

    it("should list links with default limit", async () => {
      const listCommand = commands.find((cmd) => cmd.name === "link-list")!;

      // Mock the entity service search to return mock link entities
      context.entityService.search = mock(async () => [
        {
          entity: mockLinkEntity(mockLinkContent.withMultipleTags),
        },
      ]);

      const result = await listCommand.handler([], mockCommandContext);

      expect(result.type).toBe("message");
      expect(result.message).toContain("Test Article");
      expect(result.message).toContain("https://example.com/test");
      expect(result.message).toContain("test, example");
    });

    it("should handle empty link list", async () => {
      const listCommand = commands.find((cmd) => cmd.name === "link-list")!;

      const result = await listCommand.handler([], mockCommandContext);

      expect(result.type).toBe("message");
      expect(result.message).toBe("No links found.");
    });

    it("should respect limit argument", async () => {
      const listCommand = commands.find((cmd) => cmd.name === "link-list")!;

      const result = await listCommand.handler(
        ["--limit", "5"],
        mockCommandContext,
      );

      expect(result.type).toBe("message");
      // Since no links exist, it should return "No links found"
      expect(result.message).toBe("No links found.");
    });
  });

  describe("link-search command", () => {
    it("should have correct metadata", () => {
      const searchCommand = commands.find((cmd) => cmd.name === "link-search");

      expect(searchCommand).toBeDefined();
      expect(searchCommand?.description).toBe("Search captured links");
      expect(searchCommand?.usage).toContain("[query]");
      expect(searchCommand?.usage).toContain("[--tags");
    });

    it("should search links", async () => {
      const searchCommand = commands.find((cmd) => cmd.name === "link-search")!;

      // MockShell search always returns empty, but we can test the command works
      const result = await searchCommand.handler(
        ["javascript"],
        mockCommandContext,
      );

      expect(result.type).toBe("message");
      expect(result.message).toContain(
        'No links found for query: "javascript"',
      );
    });

    it("should handle missing query", async () => {
      const searchCommand = commands.find((cmd) => cmd.name === "link-search")!;

      const result = await searchCommand.handler([], mockCommandContext);

      expect(result.type).toBe("message");
      expect(result.message).toBe("No links found.");
    });

    it("should handle tag filters", async () => {
      const searchCommand = commands.find((cmd) => cmd.name === "link-search")!;

      const result = await searchCommand.handler(
        ["--tags", "javascript", "tutorial"],
        mockCommandContext,
      );

      expect(result.type).toBe("message");
      expect(result.message).toContain("No links found");
    });
  });

  describe("link-get command", () => {
    it("should have correct metadata", () => {
      const getCommand = commands.find((cmd) => cmd.name === "link-get");

      expect(getCommand).toBeDefined();
      expect(getCommand?.description).toBe("Get details of a specific link");
      expect(getCommand?.usage).toContain("<entity-id>");
    });

    it("should get link by ID", async () => {
      const getCommand = commands.find((cmd) => cmd.name === "link-get")!;

      // Mock the entity service getEntity to return a mock link entity
      context.entityService.getEntity = mock(async () => mockLinkEntity());

      const result = await getCommand.handler(["link-1"], mockCommandContext);

      expect(result.type).toBe("message");
      expect(result.message).toContain("Test Article");
      expect(result.message).toContain("https://example.com/test");
      expect(result.message).toContain("Test description");
      expect(result.message).toContain("Test summary");
    });

    it("should handle non-existent link", async () => {
      const getCommand = commands.find((cmd) => cmd.name === "link-get")!;

      const result = await getCommand.handler(
        ["non-existent"],
        mockCommandContext,
      );

      expect(result.type).toBe("message");
      expect(result.message).toBe("Link not found: non-existent");
    });

    it("should handle missing ID argument", async () => {
      const getCommand = commands.find((cmd) => cmd.name === "link-get")!;

      const result = await getCommand.handler([], mockCommandContext);

      expect(result.type).toBe("message");
      expect(result.message).toContain("Usage:");
    });
  });
});
