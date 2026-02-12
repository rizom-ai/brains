import type { PluginTool, BaseEntity } from "@brains/plugins";
import { createTool } from "@brains/plugins";
import type { ISystemPlugin } from "../types";
import { z } from "@brains/utils";

/**
 * Strip binary content (e.g., base64 data URLs) from entities before
 * returning them in tool results. Prevents multi-MB image data from
 * being fed into the LLM context.
 */
function sanitizeEntity<T extends BaseEntity>(entity: T): T {
  if (entity.entityType === "image" && entity.content.startsWith("data:")) {
    return {
      ...entity,
      content: "[binary image data — use metadata for image info]",
    };
  }
  return entity;
}

export function createSystemTools(
  plugin: ISystemPlugin,
  pluginId: string,
): PluginTool[] {
  return [
    createTool(
      pluginId,
      "search",
      "Search entities using semantic search. Optionally filter by entity type.",
      {
        query: z.string().describe("Search term"),
        entityType: z.string().optional().describe("Entity type to filter by"),
        limit: z.number().optional().describe("Maximum number of results"),
      },
      async (input) => {
        const parsed = z
          .object({
            query: z.string(),
            entityType: z.string().optional(),
            limit: z.number().optional(),
          })
          .parse(input);

        const results = await plugin.searchEntities(parsed.query, {
          types: parsed.entityType ? [parsed.entityType] : undefined,
          limit: parsed.limit ?? 10,
        });

        return {
          success: true,
          data: {
            results: results.map((r) => ({
              ...r,
              entity: sanitizeEntity(r.entity),
            })),
          },
        };
      },
      { visibility: "public" },
    ),
    createTool(
      pluginId,
      "get",
      "Retrieve a specific entity by type and identifier (ID, slug, or title).",
      {
        entityType: z.string().describe("Entity type"),
        id: z.string().describe("Entity ID, slug, or title"),
      },
      async (input) => {
        const parsed = z
          .object({
            entityType: z.string(),
            id: z.string(),
          })
          .parse(input);

        // Check if entity type exists
        const availableTypes = plugin.getEntityTypes();
        if (!availableTypes.includes(parsed.entityType)) {
          return {
            success: false,
            error: `Unknown entity type: ${parsed.entityType}. Available types: ${availableTypes.join(", ")}`,
          };
        }

        const entity = await plugin.findEntity(parsed.entityType, parsed.id);
        if (entity) {
          return {
            success: true,
            data: { entity: sanitizeEntity(entity) },
          };
        }
        return {
          success: false,
          error: `Entity not found: ${parsed.entityType}/${parsed.id}`,
        };
      },
      { visibility: "public" },
    ),
    createTool(
      pluginId,
      "list",
      "List entities by type with optional filters. Returns metadata only (id, type, metadata, dates) — use system_get to retrieve full content for a specific entity.",
      {
        entityType: z.string().describe("Entity type to list"),
        status: z
          .string()
          .optional()
          .describe("Filter by status: 'draft', 'published', etc."),
        limit: z
          .number()
          .optional()
          .describe("Maximum number of results (default: 20)"),
      },
      async (input) => {
        const parsed = z
          .object({
            entityType: z.string(),
            status: z.string().optional(),
            limit: z.number().optional(),
          })
          .parse(input);

        // Check if entity type exists
        const availableTypes = plugin.getEntityTypes();
        if (!availableTypes.includes(parsed.entityType)) {
          return {
            success: false,
            error: `Unknown entity type: ${parsed.entityType}. Available types: ${availableTypes.join(", ")}`,
          };
        }

        const options: { limit: number; filter?: Record<string, unknown> } = {
          limit: parsed.limit ?? 20,
        };
        if (parsed.status) {
          options.filter = { metadata: { status: parsed.status } };
        }

        const entities = await plugin.listEntities(parsed.entityType, options);
        // Return metadata only — strip content to reduce token usage
        const items = entities.map(
          ({ content: _, contentHash: __, ...rest }) => rest,
        );

        return {
          success: true,
          data: { entities: items, count: items.length },
        };
      },
      { visibility: "public" },
    ),
    createTool(
      pluginId,
      "check-job-status",
      "Check the status of background operations",
      {
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
      async (input) => {
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
          if (!status.batch) {
            return {
              success: false,
              error: `No batch found with ID: ${parsed.batchId}`,
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
            success: true,
            data: {
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
            },
          };
        } else {
          const activeJobs = status.activeJobs ?? [];
          const activeBatches = status.activeBatches ?? [];

          return {
            success: true,
            data: {
              summary: {
                activeJobs: activeJobs.length,
                activeBatches: activeBatches.length,
              },
              jobs: activeJobs.map((job) => ({
                id: job.id,
                type: job.type,
                status: job.status,
                priority: job.priority,
                retryCount: job.retryCount,
                createdAt: new Date(job.createdAt).toISOString(),
                startedAt: job.startedAt
                  ? new Date(job.startedAt).toISOString()
                  : null,
              })),
              batches: activeBatches.map((batch) => ({
                batchId: batch.batchId,
                status: batch.status.status,
                totalOperations: batch.status.totalOperations,
                completedOperations: batch.status.completedOperations,
                failedOperations: batch.status.failedOperations,
                currentOperation: batch.status.currentOperation,
                pluginId: batch.metadata.metadata.pluginId,
                errors: batch.status.errors,
              })),
            },
          };
        }
      },
      { visibility: "public" },
    ),
    createTool(
      pluginId,
      "get-conversation",
      "Get conversation details",
      {
        conversationId: z.string().describe("Conversation ID"),
      },
      async (input) => {
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
              success: false,
              error: `Conversation not found: ${parsed.conversationId}`,
            };
          }

          return {
            success: true,
            data: {
              id: conversation.id,
              interfaceType: conversation.interfaceType,
              channelId: conversation.channelId,
              created: conversation.created,
              lastActive: conversation.lastActive,
            },
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            success: false,
            error: message,
          };
        }
      },
      { visibility: "public" },
    ),
    createTool(
      pluginId,
      "list-conversations",
      "List conversations, optionally filtered by search query",
      {
        searchQuery: z
          .string()
          .optional()
          .describe("Optional search query to filter conversations"),
        limit: z
          .number()
          .optional()
          .describe("Maximum number of conversations to return (default: 20)"),
      },
      async (input) => {
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
            success: true,
            data: {
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
            },
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            success: false,
            error: message,
          };
        }
      },
      { visibility: "public" },
    ),
    createTool(
      pluginId,
      "get-messages",
      "Get messages from a specific conversation",
      {
        conversationId: z.string().describe("Conversation ID"),
        limit: z
          .number()
          .optional()
          .describe("Maximum number of messages to return (default: 20)"),
      },
      async (input) => {
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
            success: true,
            data: {
              conversationId: parsed.conversationId,
              messages: messages.map((msg) => ({
                id: msg.id,
                role: msg.role,
                content: msg.content,
                timestamp: msg.timestamp,
              })),
              messageCount: messages.length,
              requestedLimit: parsed.limit ?? 20,
            },
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            success: false,
            error: message,
          };
        }
      },
      { visibility: "public" },
    ),
    createTool(
      pluginId,
      "get-identity",
      "Get the brain's identity - its name, role, purpose, and values. Use for 'who are you?' or 'what is this brain?' questions.",
      {},
      async () => {
        try {
          const identity = plugin.getIdentityData();

          return {
            success: true,
            data: identity,
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            success: false,
            error: message,
          };
        }
      },
      { visibility: "public" },
    ),
    createTool(
      pluginId,
      "get-profile",
      "Get the anchor's (owner's) profile - their name, bio, social links. Use to answer questions about who owns/created this brain, or to recognize when you're speaking with the anchor themselves.",
      {},
      async () => {
        try {
          const profile = plugin.getProfileData();

          return {
            success: true,
            data: profile,
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            success: false,
            error: message,
          };
        }
      },
      { visibility: "public" },
    ),
    createTool(
      pluginId,
      "get-status",
      "Get system status including model, version, running interfaces, and available tools",
      {},
      async () => {
        try {
          const appInfo = await plugin.getAppInfo();

          return {
            success: true,
            data: appInfo,
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            success: false,
            error: message,
          };
        }
      },
      { visibility: "public" },
    ),
  ];
}
