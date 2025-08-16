import { describe, it, expect, beforeEach, mock } from "bun:test";
import {
  createExtractTool,
  createListTool,
  createGetTool,
  createSearchTool,
  createMergeTool,
} from "../../src/tools";
import { MockShell } from "@brains/core/test";
import { createServicePluginContext } from "@brains/plugins";
import type { ServicePluginContext } from "@brains/plugins";
import type { TopicsPluginConfig } from "../../src/schemas/config";
import { Logger } from "@brains/utils";
import type { TopicEntity } from "../../src/types";

describe("Topics Tools", () => {
  let context: ServicePluginContext;
  let config: TopicsPluginConfig;
  let logger: Logger;
  let mockShell: MockShell;

  beforeEach(() => {
    logger = Logger.getInstance().child("test");
    mockShell = new MockShell({ logger });
    context = createServicePluginContext(mockShell, "topics", logger);
    config = {
      enabled: true,
      windowSize: 30,
      slideSize: 20,
      minRelevanceScore: 0.7,
      bootstrapThreshold: 10,
    };
  });

  describe("createExtractTool", () => {
    it("should create extract tool with correct metadata", () => {
      const tool = createExtractTool(context, config, logger);

      expect(tool.name).toBe("topics:extract");
      expect(tool.description).toBe("Extract topics from recent messages");
      expect(tool.inputSchema).toBeDefined();
    });

    it("should queue extraction job", async () => {
      const tool = createExtractTool(context, config, logger);
      
      const result = await tool.handler({
        windowSize: 20,
        minScore: 0.5,
      });

      expect(result.success).toBe(true);
      expect(result.data.jobId).toBeDefined();
      expect(result.data.message).toContain("Window size: 20");
      expect(result.data.message).toContain("min relevance: 0.5");
    });

    it("should use default values when not provided", async () => {
      const tool = createExtractTool(context, config, logger);
      
      const result = await tool.handler({});

      expect(result.success).toBe(true);
      expect(result.data.message).toContain("Window size: 30");
      expect(result.data.message).toContain("min relevance: 0.7");
    });
  });

  describe("createListTool", () => {
    it("should create list tool with correct metadata", () => {
      const tool = createListTool(context, config, logger);

      expect(tool.name).toBe("topics:list");
      expect(tool.description).toBe("List all topics");
      expect(tool.inputSchema).toBeDefined();
    });

    it("should list topics", async () => {
      const tool = createListTool(context, config, logger);

      // Create some test topics
      const topic1: TopicEntity = {
        id: "topic-1",
        entityType: "topic",
        content: "# Topic 1\n\n## Summary\nSummary 1\n\n## Content\nContent 1\n\n## Keywords\n- keyword1\n\n## Sources\n- source1",
        metadata: {},
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const topic2: TopicEntity = {
        id: "topic-2",
        entityType: "topic",
        content: "# Topic 2\n\n## Summary\nSummary 2\n\n## Content\nContent 2\n\n## Keywords\n- keyword2\n\n## Sources\n- source2",
        metadata: {},
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      await mockShell.getEntityService().createEntity(topic1);
      await mockShell.getEntityService().createEntity(topic2);

      const result = await tool.handler({ limit: 10 });

      expect(result.success).toBe(true);
      expect(result.data.topics).toHaveLength(2);
      expect(result.data.topics[0].id).toBe("topic-1");
      expect(result.data.topics[0].title).toBe("Topic 1");
      expect(result.data.topics[1].id).toBe("topic-2");
      expect(result.data.topics[1].title).toBe("Topic 2");
    });

    it("should return empty array when no topics exist", async () => {
      const tool = createListTool(context, config, logger);

      const result = await tool.handler({});

      expect(result.success).toBe(true);
      expect(result.data.topics).toEqual([]);
    });
  });

  describe("createGetTool", () => {
    it("should create get tool with correct metadata", () => {
      const tool = createGetTool(context, config, logger);

      expect(tool.name).toBe("topics:get");
      expect(tool.description).toBe("Get details of a specific topic");
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.id).toBeDefined();
    });

    it("should get topic by ID", async () => {
      const tool = createGetTool(context, config, logger);

      const topic: TopicEntity = {
        id: "test-topic",
        entityType: "topic",
        content: "# Test Topic\n\n## Summary\nTest summary\n\n## Content\nTest content\n\n## Keywords\n- test\n\n## Sources\n- source1",
        metadata: {},
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      await mockShell.getEntityService().createEntity(topic);

      const result = await tool.handler({ id: "test-topic" });

      expect(result.success).toBe(true);
      expect(result.data.id).toBe("test-topic");
      expect(result.data.content).toContain("Test Topic");
    });

    it("should throw error for non-existent topic", async () => {
      const tool = createGetTool(context, config, logger);

      await expect(tool.handler({ id: "non-existent" })).rejects.toThrow("Topic not found");
    });
  });

  describe("createSearchTool", () => {
    it("should create search tool with correct metadata", () => {
      const tool = createSearchTool(context, config, logger);

      expect(tool.name).toBe("topics:search");
      expect(tool.description).toBe("Search topics by query");
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.query).toBeDefined();
    });

    it("should search topics", async () => {
      const tool = createSearchTool(context, config, logger);

      // MockShell search always returns empty array, so we just test it doesn't error
      const result = await tool.handler({ query: "machine learning" });

      expect(result.success).toBe(true);
      expect(result.data.results).toEqual([]);
    });
  });

  describe("createMergeTool", () => {
    it("should create merge tool with correct metadata", () => {
      const tool = createMergeTool(context, config, logger);

      expect(tool.name).toBe("topics:merge");
      expect(tool.description).toBe("Merge multiple topics into one");
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.ids).toBeDefined();
    });

    it("should merge topics", async () => {
      const tool = createMergeTool(context, config, logger);

      // Create test topics
      const topic1: TopicEntity = {
        id: "topic-a",
        entityType: "topic",
        content: "# Topic A\n\n## Summary\nSummary A\n\n## Content\nContent A\n\n## Keywords\n- keywordA\n\n## Sources\n- sourceA",
        metadata: {},
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const topic2: TopicEntity = {
        id: "topic-b",
        entityType: "topic",
        content: "# Topic B\n\n## Summary\nSummary B\n\n## Content\nContent B\n\n## Keywords\n- keywordB\n\n## Sources\n- sourceB",
        metadata: {},
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      await mockShell.getEntityService().createEntity(topic1);
      await mockShell.getEntityService().createEntity(topic2);

      const result = await tool.handler({ ids: "topic-a,topic-b" });

      expect(result.success).toBe(true);
      expect(result.data.mergedTopic).toBeDefined();
      expect(result.data.mergedTopic.id).toBe("topic-a");
      
      // Check that topic-b was deleted
      const deletedTopic = await mockShell.getEntityService().getEntity("topic", "topic-b");
      expect(deletedTopic).toBeNull();
    });

    it("should throw error when not enough topics to merge", async () => {
      const tool = createMergeTool(context, config, logger);

      await expect(tool.handler({ ids: "non-existent" })).rejects.toThrow("Failed to merge topics");
    });
  });
});