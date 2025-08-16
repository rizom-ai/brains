import type {
  Command,
  CommandResponse,
  ServicePluginContext,
} from "@brains/plugins";
import type { TopicsPluginConfig } from "../schemas/config";
import { TopicService } from "../lib/topic-service";
import { TopicAdapter } from "../lib/topic-adapter";
import { Logger } from "@brains/utils";

export function createTopicsCommands(
  context: ServicePluginContext,
  config: TopicsPluginConfig,
  logger: Logger,
): Command[] {
  const topicService = new TopicService(context.entityService, logger);

  return [
    {
      name: "topics:list",
      description: "List all topics",
      usage: "/topics:list [--limit <number>]",
      handler: async (args, _context): Promise<CommandResponse> => {
        try {
          // Parse arguments
          let limit = 10;
          for (let i = 0; i < args.length; i++) {
            if (args[i] === "--limit" && args[i + 1]) {
              limit = parseInt(args[i + 1] as string, 10);
              if (isNaN(limit)) limit = 10;
            }
          }

          const topics = await topicService.listTopics({ limit });

          if (topics.length === 0) {
            return {
              type: "message",
              message: "No topics found",
            };
          }

          // Format topics for CLI display
          const formatted = topics
            .map((topic) => {
              // Parse topic body to get keywords
              const adapter = new TopicAdapter();
              const parsed = adapter.parseTopicBody(topic.content);
              return [
                `**${parsed.title}** (${topic.id})`,
                `Keywords: ${parsed.keywords.join(", ")}`,
                `Last updated: ${new Date(topic.updated).toLocaleDateString()}`,
                ``,
                parsed.summary || topic.content.substring(0, 200) + "...",
              ].join("\n");
            })
            .join("\n\n---\n\n");

          return {
            type: "message",
            message: `Found ${topics.length} topics:\n\n${formatted}`,
          };
        } catch (error) {
          return {
            type: "message",
            message: `Error listing topics: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
    {
      name: "topics:extract",
      description: "Extract topics from recent messages",
      usage: "/topics:extract [--window <number>] [--min-relevance <number>]",
      handler: async (args, _context): Promise<CommandResponse> => {
        try {
          // Parse arguments
          let windowSize = config.windowSize ?? 30;
          let minRelevance = config.minRelevanceScore ?? 0.7;

          for (let i = 0; i < args.length; i++) {
            if (args[i] === "--window" && args[i + 1]) {
              windowSize = parseInt(args[i + 1] as string, 10);
              if (isNaN(windowSize)) windowSize = config.windowSize ?? 30;
            } else if (args[i] === "--min-relevance" && args[i + 1]) {
              minRelevance = parseFloat(args[i + 1] as string);
              if (isNaN(minRelevance))
                minRelevance = config.minRelevanceScore ?? 0.7;
            }
          }

          // Queue extraction job for background processing
          const jobId = await context.enqueueJob(
            "topics:extraction",
            {
              windowSize,
              minRelevanceScore: minRelevance,
            },
            {
              priority: 5,
              source: "topics",
              metadata: {
                interfaceId: "cli",
                userId: "user",
                operationType: "batch_processing",
                pluginId: "topics",
              },
            },
          );

          return {
            type: "message",
            message: `Topic extraction job queued (ID: ${jobId})\nWindow size: ${windowSize} messages, min relevance: ${minRelevance}`,
          };
        } catch (error) {
          return {
            type: "message",
            message: `Error: Failed to queue extraction - ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
    {
      name: "topics:get",
      description: "Get a specific topic by ID",
      usage: "/topics:get <topic-id>",
      handler: async (args, _context): Promise<CommandResponse> => {
        if (args.length === 0) {
          return {
            type: "message",
            message: "Error: Topic ID is required",
          };
        }

        const topicId = args[0] as string; // Use first argument as topic ID

        try {
          const topic = await topicService.getTopic(topicId);

          if (!topic) {
            return {
              type: "message",
              message: `Error: Topic not found: ${topicId}`,
            };
          }

          // Format topic for display
          const adapter = new TopicAdapter();
          const parsed = adapter.parseTopicBody(topic.content);
          const formatted = [
            `# ${parsed.title}`,
            ``,
            `**ID:** ${topic.id}`,
            `**Keywords:** ${parsed.keywords.join(", ")}`,
            `**Created:** ${new Date(topic.created).toLocaleString()}`,
            `**Updated:** ${new Date(topic.updated).toLocaleString()}`,
            ``,
            `## Summary`,
            parsed.summary,
            ``,
            `## Content`,
            parsed.content,
          ].join("\n");

          return {
            type: "message",
            message: formatted,
          };
        } catch (error) {
          return {
            type: "message",
            message: `Error getting topic: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
    {
      name: "topics:search",
      description: "Search topics by query",
      usage: "/topics:search <query>",
      handler: async (args, _context): Promise<CommandResponse> => {
        if (args.length === 0) {
          return {
            type: "message",
            message: "Error: Search query is required",
          };
        }

        const query = args.join(" ");

        try {
          const results = await topicService.searchTopics(query, 10);

          if (results.length === 0) {
            return {
              type: "message",
              message: `No topics found matching "${query}"`,
            };
          }

          // Format search results
          const adapter = new TopicAdapter();
          const formatted = results
            .map((result) => {
              const parsed = adapter.parseTopicBody(result.entity.content);
              return [
                `**${parsed.title}** (${result.entity.id})`,
                `Score: ${result.score.toFixed(2)} | Keywords: ${parsed.keywords.slice(0, 5).join(", ")}`,
                ``,
                result.excerpt,
              ].join("\n");
            })
            .join("\n\n---\n\n");

          return {
            type: "message",
            message: `Found ${results.length} topics matching "${query}":\n\n${formatted}`,
          };
        } catch (error) {
          return {
            type: "message",
            message: `Error searching topics: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  ];
}
