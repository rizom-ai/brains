import {
  type ServicePluginContext,
  type Logger,
  type JobOptions,
  type PluginTool,
  createId,
} from "@brains/plugins";
import { z } from "@brains/utils";
import { TopicService } from "../lib/topic-service";
import { TopicAdapter } from "../lib/topic-adapter";
import type { TopicsPluginConfig } from "../schemas/config";

// Default job options for topic extraction (rootJobId will be generated)
const getExtractionJobOptions = (): JobOptions => ({
  priority: 5,
  source: "topics",
  metadata: {
    rootJobId: createId(), // Generate unique ID for each job
    operationType: "batch_processing",
    pluginId: "topics",
  },
});

// Schema for tool parameters
const extractParamsSchema = z.object({
  conversationId: z.string(),
  windowSize: z.number().min(10).max(100).optional(),
  minScore: z.number().min(0).max(1).optional(),
});

const listParamsSchema = z.object({
  limit: z.number().optional(),
});

const getParamsSchema = z.object({
  id: z.string(),
});

const searchParamsSchema = z.object({
  query: z.string(),
  limit: z.number().optional(),
});

const mergeParamsSchema = z.object({
  ids: z.string(),
  target: z.string().optional(),
});

/**
 * Extract topics from recent conversations
 */
export function createExtractTool(
  context: ServicePluginContext,
  config: TopicsPluginConfig,
  _logger: Logger,
): PluginTool {
  return {
    name: "topics-extract",
    description: "Extract topics from a specific conversation",
    inputSchema: extractParamsSchema.shape,
    handler: async (params) => {
      const parsed = extractParamsSchema.safeParse(params);
      if (!parsed.success) {
        throw new Error(`Invalid parameters: ${parsed.error.message}`);
      }

      const windowSize = parsed.data.windowSize ?? config.windowSize;
      const minScore = parsed.data.minScore ?? config.minRelevanceScore;

      // Queue extraction job
      const jobId = await context.enqueueJob(
        "topics:extraction",
        {
          conversationId: parsed.data.conversationId,
          windowSize: windowSize,
          minRelevanceScore: minScore,
        },
        getExtractionJobOptions(),
      );

      return {
        success: true,
        data: {
          jobId,
          message: `Topic extraction job queued for conversation ${parsed.data.conversationId}. Window size: ${windowSize} messages, min relevance: ${minScore}`,
        },
      };
    },
  };
}

/**
 * List all topics
 */
export function createListTool(
  context: ServicePluginContext,
  _config: TopicsPluginConfig,
  logger: Logger,
): PluginTool {
  return {
    name: "topics-list",
    description: "List all topics",
    inputSchema: listParamsSchema.shape,
    handler: async (params) => {
      const parsed = listParamsSchema.safeParse(params);
      if (!parsed.success) {
        throw new Error(`Invalid parameters: ${parsed.error.message}`);
      }

      const topicService = new TopicService(context.entityService, logger);

      const listParams: Parameters<typeof topicService.listTopics>[0] = {};

      if (parsed.data.limit !== undefined) {
        listParams.limit = parsed.data.limit;
      }

      const topics = await topicService.listTopics(listParams);

      const adapter = new TopicAdapter();
      return {
        success: true,
        data: {
          topics: topics.map((t) => {
            const parsed = adapter.parseTopicBody(t.content);
            return {
              id: t.id,
              title: parsed.title,
              keywords: parsed.keywords,
              updated: t.updated,
            };
          }),
          count: topics.length,
        },
      };
    },
  };
}

/**
 * Get details of a specific topic
 */
export function createGetTool(
  context: ServicePluginContext,
  _config: TopicsPluginConfig,
  logger: Logger,
): PluginTool {
  return {
    name: "topics-get",
    description: "Get details of a specific topic",
    inputSchema: getParamsSchema.shape,
    handler: async (params) => {
      const parsed = getParamsSchema.safeParse(params);
      if (!parsed.success) {
        throw new Error(`Invalid parameters: ${parsed.error.message}`);
      }

      const topicService = new TopicService(context.entityService, logger);
      const topic = await topicService.getTopic(parsed.data.id);

      if (!topic) {
        throw new Error(`Topic not found: ${parsed.data.id}`);
      }

      return {
        success: true,
        data: {
          id: topic.id,
          content: topic.content,
          metadata: topic.metadata,
          created: topic.created,
          updated: topic.updated,
        },
      };
    },
  };
}

/**
 * Search topics by query
 */
export function createSearchTool(
  context: ServicePluginContext,
  _config: TopicsPluginConfig,
  logger: Logger,
): PluginTool {
  return {
    name: "topics-search",
    description: "Search topics by query",
    inputSchema: searchParamsSchema.shape,
    handler: async (params) => {
      const parsed = searchParamsSchema.safeParse(params);
      if (!parsed.success) {
        throw new Error(`Invalid parameters: ${parsed.error.message}`);
      }

      const topicService = new TopicService(context.entityService, logger);
      const results = await topicService.searchTopics(
        parsed.data.query,
        parsed.data.limit ?? 10,
      );

      const adapter = new TopicAdapter();
      return {
        success: true,
        data: {
          results: results.map((result) => {
            const parsed = adapter.parseTopicBody(result.entity.content);
            return {
              id: result.entity.id,
              title: parsed.title,
              keywords: parsed.keywords,
              score: result.score,
              excerpt: result.excerpt,
            };
          }),
          count: results.length,
        },
      };
    },
  };
}

/**
 * Merge multiple topics into one
 */
export function createMergeTool(
  context: ServicePluginContext,
  _config: TopicsPluginConfig,
  logger: Logger,
): PluginTool {
  return {
    name: "topics-merge",
    description: "Merge multiple topics into one",
    inputSchema: mergeParamsSchema.shape,
    handler: async (params) => {
      const parsed = mergeParamsSchema.safeParse(params);
      if (!parsed.success) {
        throw new Error(`Invalid parameters: ${parsed.error.message}`);
      }

      const topicService = new TopicService(context.entityService, logger);

      // Parse comma-separated IDs
      const topicIds = parsed.data.ids.split(",").map((id) => id.trim());

      const merged = await topicService.mergeTopics(
        topicIds,
        parsed.data.target,
      );

      if (!merged) {
        throw new Error("Failed to merge topics");
      }

      const topicAdapter = new TopicAdapter();
      const topicParsed = topicAdapter.parseTopicBody(merged.content);
      return {
        success: true,
        data: {
          mergedTopic: {
            id: merged.id,
            title: topicParsed.title,
            keywords: topicParsed.keywords,
          },
          mergedIds: topicIds,
        },
      };
    },
  };
}
