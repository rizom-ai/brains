import type { ServicePluginContext, Logger, JobOptions } from "@brains/plugins";
import { z } from "zod";
import { TopicService } from "../lib/topic-service";
import type { TopicsPluginConfig } from "../schemas/config";

// Default job options for topic extraction
const EXTRACTION_JOB_OPTIONS: JobOptions = {
  priority: 5,
  source: "topics",
  metadata: {
    interfaceId: "cli", // Will be overridden based on context
    userId: "user",
    operationType: "batch_processing",
    pluginId: "topics",
  },
};

// Schema for tool parameters
const extractParamsSchema = z.object({
  hours: z.number().optional(),
  minScore: z.number().min(0).max(1).optional(),
});

const listParamsSchema = z.object({
  limit: z.number().optional(),
  days: z.number().optional(),
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

// Tool interface for internal use
interface Tool {
  name: string;
  description: string;
  execute: (params: Record<string, unknown>) => Promise<{
    success: boolean;
    data?: unknown;
    error?: string;
  }>;
}

/**
 * Extract topics from recent conversations
 */
export function createExtractTool(
  context: ServicePluginContext,
  config: TopicsPluginConfig,
  _logger: Logger,
): Tool {
  return {
    name: "topics:extract",
    description: "Extract topics from recent conversations",
    execute: async (params) => {
      const parsed = extractParamsSchema.safeParse(params);
      if (!parsed.success) {
        return {
          success: false,
          error: "Invalid parameters",
        };
      }

      const hours = parsed.data.hours ?? config.extractionWindowHours;
      const minScore = parsed.data.minScore ?? config.minRelevanceScore;

      // Queue extraction job
      const jobId = await context.enqueueJob(
        "topics:extraction",
        {
          hours,
          minScore,
        },
        EXTRACTION_JOB_OPTIONS,
      );

      return {
        success: true,
        data: {
          message: `Topic extraction job queued`,
          jobId,
          parameters: {
            hours,
            minScore,
          },
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
): Tool {
  return {
    name: "topics:list",
    description: "List all topics",
    execute: async (params) => {
      const parsed = listParamsSchema.safeParse(params);
      if (!parsed.success) {
        return {
          success: false,
          error: "Invalid parameters",
        };
      }

      const topicService = new TopicService(context.entityService, logger);

      const listParams: Parameters<typeof topicService.listTopics>[0] = {};

      if (parsed.data.limit !== undefined) {
        listParams.limit = parsed.data.limit;
      }

      if (parsed.data.days) {
        const now = new Date();
        listParams.startDate = new Date(
          now.getTime() - parsed.data.days * 24 * 60 * 60 * 1000,
        );
      }

      const topics = await topicService.listTopics(listParams);

      return {
        success: true,
        data: {
          topics: topics.map((t) => ({
            id: t.id,
            keywords: t.metadata.keywords,
            relevanceScore: t.metadata.relevanceScore,
            mentionCount: t.metadata.mentionCount,
            lastSeen: t.metadata.lastSeen,
          })),
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
): Tool {
  return {
    name: "topics:get",
    description: "Get details of a specific topic",
    execute: async (params) => {
      const parsed = getParamsSchema.safeParse(params);
      if (!parsed.success) {
        return {
          success: false,
          error: "Invalid parameters: id is required",
        };
      }

      const topicService = new TopicService(context.entityService, logger);
      const topic = await topicService.getTopic(parsed.data.id);

      if (!topic) {
        return {
          success: false,
          error: `Topic not found: ${parsed.data.id}`,
        };
      }

      return {
        success: true,
        data: {
          id: topic.id,
          content: topic.content,
          metadata: topic.metadata,
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
): Tool {
  return {
    name: "topics:search",
    description: "Search topics by query",
    execute: async (params) => {
      const parsed = searchParamsSchema.safeParse(params);
      if (!parsed.success) {
        return {
          success: false,
          error: "Invalid parameters: query is required",
        };
      }

      const topicService = new TopicService(context.entityService, logger);
      const topics = await topicService.searchTopics(
        parsed.data.query,
        parsed.data.limit,
      );

      return {
        success: true,
        data: {
          topics: topics.map((t) => ({
            id: t.id,
            keywords: t.metadata.keywords,
            relevanceScore: t.metadata.relevanceScore,
            mentionCount: t.metadata.mentionCount,
            lastSeen: t.metadata.lastSeen,
          })),
          count: topics.length,
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
): Tool {
  return {
    name: "topics:merge",
    description: "Merge multiple topics into one",
    execute: async (params) => {
      const parsed = mergeParamsSchema.safeParse(params);
      if (!parsed.success) {
        return {
          success: false,
          error: "Invalid parameters: ids is required",
        };
      }

      const topicService = new TopicService(context.entityService, logger);
      const ids = parsed.data.ids.split(",").map((id: string) => id.trim());

      if (ids.length < 2) {
        return {
          success: false,
          error: "At least 2 topic IDs required for merging",
        };
      }

      const merged = await topicService.mergeTopics(ids, parsed.data.target);

      if (!merged) {
        return {
          success: false,
          error: "Failed to merge topics",
        };
      }

      return {
        success: true,
        data: {
          message: `Merged ${ids.length} topics into ${merged.id}`,
          mergedTopic: {
            id: merged.id,
            keywords: merged.metadata.keywords,
            relevanceScore: merged.metadata.relevanceScore,
            mentionCount: merged.metadata.mentionCount,
          },
        },
      };
    },
  };
}
