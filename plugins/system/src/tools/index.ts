import type { PluginTool, ToolResponse } from "@brains/plugins";
import type { ISystemPlugin } from "../types";
import { z } from "@brains/utils";

export function createSystemTools(
  plugin: ISystemPlugin,
  pluginId: string,
): PluginTool[] {
  return [
    {
      name: `${pluginId}:query`,
      description: "Query the knowledge base using AI-powered search",
      inputSchema: {
        query: z
          .string()
          .describe("Natural language query to search the knowledge base"),
        userId: z.string().optional().describe("Optional user ID for context"),
      },
      visibility: "public",
      handler: async (input): Promise<ToolResponse> => {
        const parsed = z
          .object({
            query: z.string(),
            userId: z.string().optional(),
          })
          .parse(input);

        const result = await plugin.query(parsed.query, {
          userId: parsed.userId,
        });
        return {
          status: "success",
          data: result,
        };
      },
    },
    {
      name: `${pluginId}:search`,
      description: "Search entities by type and query",
      inputSchema: {
        entityType: z
          .string()
          .describe("Type of entity to search (e.g., 'note', 'base')"),
        query: z.string().describe("Search query"),
        limit: z.number().optional().describe("Maximum number of results"),
      },
      visibility: "public",
      handler: async (input): Promise<ToolResponse> => {
        const parsed = z
          .object({
            entityType: z.string(),
            query: z.string(),
            limit: z.number().optional(),
          })
          .parse(input);

        const results = await plugin.searchEntities(parsed.query, {
          types: [parsed.entityType],
          limit: parsed.limit ?? 10,
        });
        return {
          status: "success",
          data: { results },
        };
      },
    },
    {
      name: `${pluginId}:get`,
      description: "Get a specific entity by type and ID",
      inputSchema: {
        entityType: z.string().describe("Type of entity"),
        id: z.string().describe("Entity ID"),
      },
      visibility: "public",
      handler: async (input): Promise<ToolResponse> => {
        const parsed = z
          .object({
            entityType: z.string(),
            id: z.string(),
          })
          .parse(input);

        const entity = await plugin.getEntity(parsed.entityType, parsed.id);
        if (entity) {
          return {
            status: "success",
            data: { entity },
          };
        }
        return {
          status: "error",
          message: "Entity not found",
        };
      },
    },
    {
      name: `${pluginId}:check-job-status`,
      description: "Check the status of background operations",
      inputSchema: {
        batchId: z
          .string()
          .optional()
          .describe(
            "Specific batch ID to check (leave empty for all active operations)",
          ),
        jobTypes: z
          .array(z.string())
          .optional()
          .describe(
            "Filter by specific job types (only when batchId is not provided)",
          ),
      },
      visibility: "public",
      handler: async (input): Promise<ToolResponse> => {
        const parsed = z
          .object({
            batchId: z.string().optional(),
            jobTypes: z.array(z.string()).optional(),
          })
          .parse(input);

        const status = await plugin.getJobStatus(
          parsed.batchId,
          parsed.jobTypes,
        );

        if (parsed.batchId) {
          // Specific batch
          if (!status.batch) {
            return {
              error: "Batch not found",
              message: `No batch found with ID: ${parsed.batchId}`,
            };
          }

          const percentComplete =
            status.batch.totalOperations > 0
              ? Math.round(
                  (status.batch.completedOperations /
                    status.batch.totalOperations) *
                    100,
                )
              : 0;

          return {
            batchId: parsed.batchId,
            status: status.batch.status,
            progress: {
              total: status.batch.totalOperations,
              completed: status.batch.completedOperations,
              failed: status.batch.failedOperations,
              percentComplete,
            },
            currentOperation: status.batch.currentOperation,
            errors: status.batch.errors,
            message:
              status.batch.status === "processing"
                ? `Processing: ${status.batch.completedOperations}/${status.batch.totalOperations} operations (${percentComplete}%)`
                : status.batch.status === "completed"
                  ? `Completed: ${status.batch.completedOperations} operations`
                  : status.batch.status === "failed"
                    ? `Failed: ${status.batch.failedOperations} operations failed`
                    : "Unknown status",
          };
        } else {
          // All active operations
          const activeJobs = status.activeJobs ?? [];
          const activeBatches = status.activeBatches ?? [];

          // Format individual jobs
          const formattedJobs = activeJobs.map((job) => ({
            id: job.id,
            type: job.type,
            status: job.status,
            priority: job.priority,
            retryCount: job.retryCount,
            createdAt: new Date(job.createdAt).toISOString(),
            startedAt: job.startedAt
              ? new Date(job.startedAt).toISOString()
              : null,
          }));

          // Format batch operations
          const formattedBatches = activeBatches.map((batch) => ({
            batchId: batch.batchId,
            status: batch.status.status,
            totalOperations: batch.status.totalOperations,
            completedOperations: batch.status.completedOperations,
            failedOperations: batch.status.failedOperations,
            currentOperation: batch.status.currentOperation,
            pluginId: batch.metadata.metadata.pluginId,
            errors: batch.status.errors,
          }));

          return {
            summary: {
              activeJobs: formattedJobs.length,
              activeBatches: formattedBatches.length,
            },
            jobs: formattedJobs,
            batches: formattedBatches,
            tip:
              formattedBatches.length > 0
                ? `Use ${pluginId}:check-job-status with batchId to check specific batch progress`
                : undefined,
          };
        }
      },
    },
    {
      name: `${pluginId}:get-conversation`,
      description: "Get conversation details",
      inputSchema: {
        conversationId: z.string().describe("Conversation ID"),
      },
      visibility: "public",
      handler: async (input): Promise<ToolResponse> => {
        const parsed = z
          .object({
            conversationId: z.string(),
          })
          .parse(input);

        try {
          const conversation = await plugin.getConversation(
            parsed.conversationId,
          );
          if (!conversation) {
            return {
              error: "Conversation not found",
              conversationId: parsed.conversationId,
            };
          }

          return {
            id: conversation.id,
            interfaceType: conversation.interfaceType,
            channelId: conversation.channelId,
            created: conversation.created,
            lastActive: conversation.lastActive,
          };
        } catch (error) {
          return {
            error: "Failed to get conversation",
            message: error instanceof Error ? error.message : String(error),
          };
        }
      },
    },
    {
      name: `${pluginId}:list-conversations`,
      description: "List conversations, optionally filtered by search query",
      inputSchema: {
        searchQuery: z
          .string()
          .optional()
          .describe("Optional search query to filter conversations"),
        limit: z
          .number()
          .optional()
          .describe("Maximum number of conversations to return (default: 20)"),
      },
      visibility: "public",
      handler: async (input): Promise<ToolResponse> => {
        const parsed = z
          .object({
            searchQuery: z.string().optional(),
            limit: z.number().optional(),
          })
          .parse(input);

        try {
          const conversations = await plugin.searchConversations(
            parsed.searchQuery ?? "",
          );
          const limitedConversations = conversations.slice(
            0,
            parsed.limit ?? 20,
          );

          return {
            conversations: limitedConversations.map((conv) => ({
              id: conv.id,
              interfaceType: conv.interfaceType,
              channelId: conv.channelId,
              created: conv.created,
              lastActive: conv.lastActive,
            })),
            totalFound: conversations.length,
            returned: limitedConversations.length,
            searchQuery: parsed.searchQuery,
          };
        } catch (error) {
          return {
            error: "Failed to list conversations",
            message: error instanceof Error ? error.message : String(error),
          };
        }
      },
    },
    {
      name: `${pluginId}:get-messages`,
      description: "Get messages from a specific conversation",
      inputSchema: {
        conversationId: z.string().describe("Conversation ID"),
        limit: z
          .number()
          .optional()
          .describe("Maximum number of messages to return (default: 20)"),
      },
      visibility: "public",
      handler: async (input): Promise<ToolResponse> => {
        const parsed = z
          .object({
            conversationId: z.string(),
            limit: z.number().optional(),
          })
          .parse(input);

        try {
          const messages = await plugin.getMessages(
            parsed.conversationId,
            parsed.limit ?? 20,
          );

          return {
            conversationId: parsed.conversationId,
            messages: messages.map((msg) => ({
              id: msg.id,
              role: msg.role,
              content: msg.content,
              timestamp: msg.timestamp,
            })),
            messageCount: messages.length,
            requestedLimit: parsed.limit ?? 20,
          };
        } catch (error) {
          return {
            error: "Failed to get messages",
            message: error instanceof Error ? error.message : String(error),
          };
        }
      },
    },
    {
      name: `${pluginId}:get-identity`,
      description: "Get the brain's identity (role, purpose, values)",
      inputSchema: {},
      visibility: "public",
      handler: async (): Promise<ToolResponse> => {
        try {
          const identity = plugin.getIdentityData();
          return {
            status: "success",
            data: identity,
          };
        } catch (error) {
          return {
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          };
        }
      },
    },
    {
      name: `${pluginId}:get-status`,
      description:
        "Get system status including model, version, and running interfaces with access URLs",
      inputSchema: {},
      visibility: "public",
      handler: async (): Promise<ToolResponse> => {
        try {
          const appInfo = await plugin.getAppInfo();
          return {
            status: "success",
            data: appInfo,
          };
        } catch (error) {
          return {
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          };
        }
      },
    },
  ];
}
