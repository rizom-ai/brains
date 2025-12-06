import {
  type ServicePluginContext,
  type Logger,
  type JobOptions,
  type PluginTool,
  type ToolResponse,
  createId,
} from "@brains/plugins";
import {
  z,
  formatAsList,
  formatAsEntity,
  formatAsSearchResults,
} from "@brains/utils";
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
    name: "topics_extract",
    description:
      "Extract topics from a conversation using AI. Use when users want to analyze or tag a conversation's themes.",
    inputSchema: extractParamsSchema.shape,
    visibility: "anchor",
    handler: async (params): Promise<ToolResponse> => {
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

      const formatted = formatAsEntity(
        {
          jobId,
          conversationId: parsed.data.conversationId,
          windowSize,
          minScore,
          status: "queued",
        },
        { title: "Topic Extraction Job" },
      );

      return {
        success: true,
        data: {
          jobId,
          message: `Topic extraction job queued for conversation ${parsed.data.conversationId}. Window size: ${windowSize} messages, min relevance: ${minScore}`,
        },
        formatted,
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
    name: "topics_list",
    description:
      "List all extracted topics. Use when users ask about themes, subjects, or tags from conversations.",
    inputSchema: listParamsSchema.shape,
    visibility: "public",
    handler: async (params): Promise<ToolResponse> => {
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
      const topicData = topics.map((t) => {
        const parsedTopic = adapter.parseTopicBody(t.content);
        return {
          id: t.id,
          title: parsedTopic.title,
          keywords: parsedTopic.keywords,
          updated: t.updated,
        };
      });

      const formatted = formatAsList(topicData, {
        title: (t) => t.title,
        subtitle: (t) => t.keywords.slice(0, 5).join(", "),
        header: `## Topics (${topicData.length})`,
      });

      return {
        success: true,
        data: {
          topics: topicData,
          count: topics.length,
        },
        formatted,
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
    name: "topics_get",
    description:
      "Get details of a specific topic. Use when users want more info about a particular theme or subject.",
    inputSchema: getParamsSchema.shape,
    visibility: "public",
    handler: async (params): Promise<ToolResponse> => {
      const parsed = getParamsSchema.safeParse(params);
      if (!parsed.success) {
        throw new Error(`Invalid parameters: ${parsed.error.message}`);
      }

      const topicService = new TopicService(context.entityService, logger);
      const topic = await topicService.getTopic(parsed.data.id);

      if (!topic) {
        throw new Error(`Topic not found: ${parsed.data.id}`);
      }

      const formatted = formatAsEntity(
        {
          id: topic.id,
          created: topic.created,
          updated: topic.updated,
        },
        { title: `Topic: ${topic.id}` },
      );

      return {
        success: true,
        data: {
          id: topic.id,
          content: topic.content,
          metadata: topic.metadata,
          created: topic.created,
          updated: topic.updated,
        },
        formatted,
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
    name: "topics_search",
    description:
      "Search topics by keyword. Use when users want to find conversations about a specific subject.",
    inputSchema: searchParamsSchema.shape,
    visibility: "public",
    handler: async (params): Promise<ToolResponse> => {
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
      const searchResults = results.map((result) => {
        const parsedTopic = adapter.parseTopicBody(result.entity.content);
        return {
          id: result.entity.id,
          entityType: "topic",
          title: parsedTopic.title,
          keywords: parsedTopic.keywords,
          score: result.score,
          snippet: result.excerpt,
        };
      });

      const formatted = formatAsSearchResults(searchResults, {
        query: parsed.data.query,
        showScores: true,
      });

      return {
        success: true,
        data: {
          results: searchResults,
          count: results.length,
        },
        formatted,
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
    name: "topics_merge",
    description:
      "Merge multiple topics into one. Use when users want to consolidate similar or duplicate topics.",
    inputSchema: mergeParamsSchema.shape,
    visibility: "anchor",
    handler: async (params): Promise<ToolResponse> => {
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

      const formatted = formatAsEntity(
        {
          id: merged.id,
          title: topicParsed.title,
          keywords: topicParsed.keywords.join(", "),
          mergedFrom: topicIds.join(", "),
        },
        { title: "Topics Merged" },
      );

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
        formatted,
      };
    },
  };
}

/**
 * Create all topics tools
 */
export function createTopicsTools(
  context: ServicePluginContext,
  config: TopicsPluginConfig,
  logger: Logger,
): PluginTool[] {
  return [
    createExtractTool(context, config, logger),
    createListTool(context, config, logger),
    createGetTool(context, config, logger),
    createSearchTool(context, config, logger),
    createMergeTool(context, config, logger),
  ];
}
