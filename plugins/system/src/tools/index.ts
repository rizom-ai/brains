import type { PluginTool, BaseEntity, ToolResult } from "@brains/plugins";
import { createTypedTool } from "@brains/plugins";
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

// ============================================
// Input schemas
// ============================================

const searchInputSchema = z.object({
  query: z.string().describe("Search term"),
  entityType: z.string().optional().describe("Entity type to filter by"),
  limit: z.number().optional().describe("Maximum number of results"),
});

const getInputSchema = z.object({
  entityType: z.string().describe("Entity type"),
  id: z.string().describe("Entity ID, slug, or title"),
});

const listInputSchema = z.object({
  entityType: z.string().describe("Entity type to list"),
  status: z
    .string()
    .optional()
    .describe("Filter by status: 'draft', 'published', etc."),
  limit: z
    .number()
    .optional()
    .describe("Maximum number of results (default: 20)"),
});

const checkJobStatusInputSchema = z.object({
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
});

const getConversationInputSchema = z.object({
  conversationId: z.string().describe("Conversation ID"),
});

const listConversationsInputSchema = z.object({
  searchQuery: z
    .string()
    .optional()
    .describe("Optional search query to filter conversations"),
  limit: z
    .number()
    .optional()
    .describe("Maximum number of conversations to return (default: 20)"),
});

const getMessagesInputSchema = z.object({
  conversationId: z.string().describe("Conversation ID"),
  limit: z
    .number()
    .optional()
    .describe("Maximum number of messages to return (default: 20)"),
});

// ============================================
// Tools
// ============================================

export function createSystemTools(
  plugin: ISystemPlugin,
  pluginId: string,
): PluginTool[] {
  return [
    createTypedTool(
      pluginId,
      "search",
      "Search entities using semantic search. Optionally filter by entity type.",
      searchInputSchema,
      async (input) => {
        const results = await plugin.searchEntities(input.query, {
          types: input.entityType ? [input.entityType] : undefined,
          limit: input.limit ?? 10,
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
    createTypedTool(
      pluginId,
      "get",
      "Retrieve a specific entity by type and identifier (ID, slug, or title).",
      getInputSchema,
      async (input) => {
        // Check if entity type exists
        const availableTypes = plugin.getEntityTypes();
        if (!availableTypes.includes(input.entityType)) {
          return {
            success: false,
            error: `Unknown entity type: ${input.entityType}. Available types: ${availableTypes.join(", ")}`,
          };
        }

        const entity = await plugin.findEntity(input.entityType, input.id);
        if (entity) {
          return {
            success: true,
            data: { entity: sanitizeEntity(entity) },
          };
        }
        return {
          success: false,
          error: `Entity not found: ${input.entityType}/${input.id}`,
        };
      },
      { visibility: "public" },
    ),
    createTypedTool(
      pluginId,
      "list",
      "List entities by type with optional filters. Returns metadata only (id, type, metadata, dates) — use system_get to retrieve full content for a specific entity.",
      listInputSchema,
      async (input) => {
        // Check if entity type exists
        const availableTypes = plugin.getEntityTypes();
        if (!availableTypes.includes(input.entityType)) {
          return {
            success: false,
            error: `Unknown entity type: ${input.entityType}. Available types: ${availableTypes.join(", ")}`,
          };
        }

        const options: { limit: number; filter?: Record<string, unknown> } = {
          limit: input.limit ?? 20,
        };
        if (input.status) {
          options.filter = { metadata: { status: input.status } };
        }

        const entities = await plugin.listEntities(input.entityType, options);
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
    createTypedTool(
      pluginId,
      "check-job-status",
      "Check the status of background operations",
      checkJobStatusInputSchema,
      async (input): Promise<ToolResult> => {
        const status = await plugin.getJobStatus(input.batchId, input.jobTypes);

        if (input.batchId) {
          if (!status.batch) {
            return {
              success: false,
              error: `No batch found with ID: ${input.batchId}`,
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
              batchId: input.batchId,
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
    createTypedTool(
      pluginId,
      "get-conversation",
      "Get conversation details",
      getConversationInputSchema,
      async (input) => {
        const conversation = await plugin.getConversation(input.conversationId);
        if (!conversation) {
          return {
            success: false,
            error: `Conversation not found: ${input.conversationId}`,
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
      },
      { visibility: "public" },
    ),
    createTypedTool(
      pluginId,
      "list-conversations",
      "List conversations, optionally filtered by search query",
      listConversationsInputSchema,
      async (input) => {
        const conversations = await plugin.searchConversations(
          input.searchQuery ?? "",
        );
        const limitedConversations = conversations.slice(0, input.limit ?? 20);

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
            searchQuery: input.searchQuery,
          },
        };
      },
      { visibility: "public" },
    ),
    createTypedTool(
      pluginId,
      "get-messages",
      "Get messages from a specific conversation",
      getMessagesInputSchema,
      async (input) => {
        const messages = await plugin.getMessages(
          input.conversationId,
          input.limit ?? 20,
        );

        return {
          success: true,
          data: {
            conversationId: input.conversationId,
            messages: messages.map((msg) => ({
              id: msg.id,
              role: msg.role,
              content: msg.content,
              timestamp: msg.timestamp,
            })),
            messageCount: messages.length,
            requestedLimit: input.limit ?? 20,
          },
        };
      },
      { visibility: "public" },
    ),
    createTypedTool(
      pluginId,
      "get-identity",
      "Get the brain's identity - its name, role, purpose, and values. Use for 'who are you?' or 'what is this brain?' questions.",
      z.object({}),
      async () => {
        const identity = plugin.getIdentityData();

        return {
          success: true,
          data: identity,
        };
      },
      { visibility: "public" },
    ),
    createTypedTool(
      pluginId,
      "get-profile",
      "Get the anchor's (owner's) profile - their name, bio, social links. Use to answer questions about who owns/created this brain, or to recognize when you're speaking with the anchor themselves.",
      z.object({}),
      async () => {
        const profile = plugin.getProfileData();

        return {
          success: true,
          data: profile,
        };
      },
      { visibility: "public" },
    ),
    createTypedTool(
      pluginId,
      "get-status",
      "Get system status including model, version, running interfaces, and available tools",
      z.object({}),
      async () => {
        const appInfo = await plugin.getAppInfo();

        return {
          success: true,
          data: appInfo,
        };
      },
      { visibility: "public" },
    ),
  ];
}
