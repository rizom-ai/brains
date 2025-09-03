import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  spyOn,
  mock,
} from "bun:test";
import {
  createExtractTool,
  createListTool,
  createGetTool,
  createSearchTool,
} from "../../src/tools";
import {
  MockShell,
  createServicePluginContext,
  createSilentLogger,
  type ServicePluginContext,
  type Logger,
  type ToolContext,
} from "@brains/plugins";
import type { TopicsPluginConfig } from "../../src/schemas/config";
import { TopicService } from "../../src/lib/topic-service";

describe("Topics Tools", () => {
  let context: ServicePluginContext;
  let config: TopicsPluginConfig;
  let logger: Logger;
  let mockShell: MockShell;
  let mockToolContext: ToolContext;

  beforeEach(() => {
    logger = createSilentLogger();
    mockShell = MockShell.createFresh({ logger });
    context = createServicePluginContext(mockShell, "topics");
    config = {
      windowSize: 30,
      minRelevanceScore: 0.7,
      mergeSimilarityThreshold: 0.8,
      autoMerge: true,
      enableAutoExtraction: true,
    };
    mockToolContext = {
      interfaceType: "cli",
      userId: "test-user",
      channelId: "test-channel",
    };
  });

  afterEach(() => {
    // Restore all mocked functions to prevent test pollution
    mock.restore();
  });

  describe("createExtractTool", () => {
    it("should create extract tool with correct metadata", () => {
      const tool = createExtractTool(context, config, logger);

      expect(tool.name).toBe("topics-extract");
      expect(tool.description).toBe(
        "Extract topics from a specific conversation",
      );
      expect(tool.inputSchema).toBeDefined();
    });
  });

  describe("createListTool", () => {
    it("should create list tool with correct metadata", () => {
      const tool = createListTool(context, config, logger);

      expect(tool.name).toBe("topics-list");
      expect(tool.description).toContain("List all topics");
      expect(tool.inputSchema).toBeDefined();
    });

    it("should call TopicService.listTopics", async () => {
      const tool = createListTool(context, config, logger);
      const listTopicsSpy = spyOn(
        TopicService.prototype,
        "listTopics",
      ).mockResolvedValue([]);

      await tool.handler({}, mockToolContext);

      expect(listTopicsSpy).toHaveBeenCalled();
    });
  });

  describe("createGetTool", () => {
    it("should create get tool with correct metadata", () => {
      const tool = createGetTool(context, config, logger);

      expect(tool.name).toBe("topics-get");
      expect(tool.description).toContain("Get details of a specific topic");
      expect(tool.inputSchema).toBeDefined();
    });

    it("should call TopicService.getTopic with correct ID", async () => {
      const tool = createGetTool(context, config, logger);
      const mockTopic = {
        id: "test-topic",
        entityType: "topic" as const,
        content: "# Test Topic\n\nContent",
        created: "2025-01-01T00:00:00Z",
        updated: "2025-01-01T00:00:00Z",
        metadata: {},
      };
      const getTopicSpy = spyOn(
        TopicService.prototype,
        "getTopic",
      ).mockResolvedValue(mockTopic);

      await tool.handler({ id: "test-topic" }, mockToolContext);

      expect(getTopicSpy).toHaveBeenCalledWith("test-topic");
    });
  });

  describe("createSearchTool", () => {
    it("should create search tool with correct metadata", () => {
      const tool = createSearchTool(context, config, logger);

      expect(tool.name).toBe("topics-search");
      expect(tool.description).toContain("Search topics");
      expect(tool.inputSchema).toBeDefined();
    });

    it("should call TopicService.searchTopics with correct query", async () => {
      const tool = createSearchTool(context, config, logger);
      const searchTopicsSpy = spyOn(
        TopicService.prototype,
        "searchTopics",
      ).mockResolvedValue([]);

      await tool.handler({ query: "test query" }, mockToolContext);

      expect(searchTopicsSpy).toHaveBeenCalledWith("test query", 10);
    });
  });
});
