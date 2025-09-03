import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import {
  createCaptureCommand,
  createListCommand,
  createSearchCommand,
  createGetCommand,
} from "../../src/commands";
import {
  MockShell,
  createServicePluginContext,
  createSilentLogger,
  type ServicePluginContext,
  type CommandContext,
  type Logger,
} from "@brains/plugins";
import { LinkService } from "../../src/lib/link-service";

describe("Link Commands", () => {
  let context: ServicePluginContext;
  let logger: Logger;
  let mockShell: MockShell;
  let mockCommandContext: CommandContext;

  beforeEach(() => {
    logger = createSilentLogger();
    mockShell = new MockShell({ logger });
    context = createServicePluginContext(mockShell, "link");

    // Mock command context
    mockCommandContext = {
      messageId: "test-message-id",
      userId: "test-user",
      channelId: "test-channel",
      interfaceType: "cli",
      userPermissionLevel: "public" as const,
    };
  });

  describe("link-capture command", () => {
    it("should have correct metadata", () => {
      const captureCommand = createCaptureCommand(context);

      expect(captureCommand.name).toBe("link-capture");
      expect(captureCommand.description).toBe(
        "Capture a web link with AI-powered content extraction",
      );
      expect(captureCommand.usage).toContain("<url>");
      expect(captureCommand.usage).not.toContain("--tags");
    });

    it("should require URL argument", async () => {
      const captureCommand = createCaptureCommand(context);

      const result = await captureCommand.handler([], mockCommandContext);

      expect(result.type).toBe("message");
      expect(result.message).toContain("Usage:");
    });

    it("should call LinkService.captureLink with correct parameters", async () => {
      const captureCommand = createCaptureCommand(context);
      const captureLinkSpy = spyOn(
        LinkService.prototype,
        "captureLink",
      ).mockResolvedValue({
        title: "Test Title",
        url: "https://example.com/test",
        entityId: "test-id",
      });

      await captureCommand.handler(
        ["https://example.com/test"],
        mockCommandContext,
      );

      expect(captureLinkSpy).toHaveBeenCalledWith("https://example.com/test");
    });
  });

  describe("link-list command", () => {
    it("should have correct metadata", () => {
      const listCommand = createListCommand(context);

      expect(listCommand.name).toBe("link-list");
      expect(listCommand.description).toBe("List captured links");
      expect(listCommand.usage).toContain("--limit");
    });

    it("should handle invalid limit argument", async () => {
      const listCommand = createListCommand(context);

      const result = await listCommand.handler(
        ["--limit", "invalid"],
        mockCommandContext,
      );

      expect(result.type).toBe("message");
      expect(result.message).toContain(
        "Limit must be a number between 1 and 100",
      );
    });

    it("should handle limit out of range", async () => {
      const listCommand = createListCommand(context);

      const result = await listCommand.handler(
        ["--limit", "200"],
        mockCommandContext,
      );

      expect(result.type).toBe("message");
      expect(result.message).toContain(
        "Limit must be a number between 1 and 100",
      );
    });

    it("should call LinkService.listLinks with correct limit", async () => {
      const listCommand = createListCommand(context);
      const listLinksSpy = spyOn(
        LinkService.prototype,
        "listLinks",
      ).mockResolvedValue([]);

      await listCommand.handler(["--limit", "5"], mockCommandContext);

      expect(listLinksSpy).toHaveBeenCalledWith(5);
    });

    it("should call LinkService.listLinks with default limit", async () => {
      const listCommand = createListCommand(context);
      const listLinksSpy = spyOn(
        LinkService.prototype,
        "listLinks",
      ).mockResolvedValue([]);

      await listCommand.handler([], mockCommandContext);

      expect(listLinksSpy).toHaveBeenCalledWith(10);
    });
  });

  describe("link-search command", () => {
    it("should have correct metadata", () => {
      const searchCommand = createSearchCommand(context);

      expect(searchCommand.name).toBe("link-search");
      expect(searchCommand.description).toBe("Search captured links");
      expect(searchCommand.usage).toContain("[query]");
      expect(searchCommand.usage).toContain("[--keywords");
    });

    it("should handle invalid limit argument", async () => {
      const searchCommand = createSearchCommand(context);

      const result = await searchCommand.handler(
        ["query", "--limit", "invalid"],
        mockCommandContext,
      );

      expect(result.type).toBe("message");
      expect(result.message).toContain(
        "Limit must be a number between 1 and 100",
      );
    });

    it("should handle limit out of range", async () => {
      const searchCommand = createSearchCommand(context);

      const result = await searchCommand.handler(
        ["query", "--limit", "0"],
        mockCommandContext,
      );

      expect(result.type).toBe("message");
      expect(result.message).toContain(
        "Limit must be a number between 1 and 100",
      );
    });

    it("should call LinkService.searchLinks with correct parameters", async () => {
      const searchCommand = createSearchCommand(context);
      const searchLinksSpy = spyOn(
        LinkService.prototype,
        "searchLinks",
      ).mockResolvedValue([]);

      await searchCommand.handler(
        ["javascript", "--keywords", "tutorial,web", "--limit", "15"],
        mockCommandContext,
      );

      expect(searchLinksSpy).toHaveBeenCalledWith(
        "javascript",
        ["tutorial", "web"],
        15,
      );
    });

    it("should call LinkService.searchLinks with default parameters", async () => {
      const searchCommand = createSearchCommand(context);
      const searchLinksSpy = spyOn(
        LinkService.prototype,
        "searchLinks",
      ).mockResolvedValue([]);

      await searchCommand.handler([], mockCommandContext);

      expect(searchLinksSpy).toHaveBeenCalledWith(undefined, undefined, 20);
    });
  });

  describe("link-get command", () => {
    it("should have correct metadata", () => {
      const getCommand = createGetCommand(context);

      expect(getCommand.name).toBe("link-get");
      expect(getCommand.description).toBe("Get details of a specific link");
      expect(getCommand.usage).toContain("<entity-id>");
    });

    it("should handle missing ID argument", async () => {
      const getCommand = createGetCommand(context);

      const result = await getCommand.handler([], mockCommandContext);

      expect(result.type).toBe("message");
      expect(result.message).toContain("Usage:");
    });

    it("should call LinkService.getLink with correct ID", async () => {
      const getCommand = createGetCommand(context);
      const getLinkSpy = spyOn(
        LinkService.prototype,
        "getLink",
      ).mockResolvedValue(null);

      await getCommand.handler(["test-id"], mockCommandContext);

      expect(getLinkSpy).toHaveBeenCalledWith("test-id");
    });
  });
});
