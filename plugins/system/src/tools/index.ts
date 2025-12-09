import type { PluginTool, ToolResponse } from "@brains/plugins";
import type { ISystemPlugin } from "../types";
import {
  z,
  formatAsSearchResults,
  formatAsEntity,
  formatAsList,
  parseMarkdown,
} from "@brains/utils";

export function createSystemTools(
  plugin: ISystemPlugin,
  pluginId: string,
): PluginTool[] {
  return [
    {
      name: `${pluginId}_search`,
      description:
        "Search entities using semantic search. Optionally filter by entity type (note, profile, link, deck, post, topic, summary).",
      inputSchema: {
        query: z.string().describe("Search term"),
        entityType: z
          .string()
          .optional()
          .describe(
            "Optional entity type filter: 'note', 'profile', 'link', 'deck', 'post', 'topic', 'summary'",
          ),
        limit: z.number().optional().describe("Maximum number of results"),
      },
      visibility: "public",
      handler: async (input): Promise<ToolResponse> => {
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

        const formatted = formatAsSearchResults(
          results.map((r) => ({
            id: r.entity.id,
            entityType: r.entity.entityType,
            title: r.entity.id,
            score: r.score,
          })),
          { query: parsed.query, showScores: true },
        );

        return {
          status: "success",
          data: { results },
          formatted,
        };
      },
    },
    {
      name: `${pluginId}_get`,
      description:
        "Retrieve a specific entity by type and identifier (ID, slug, or title).",
      inputSchema: {
        entityType: z
          .string()
          .describe(
            "Entity type: 'note', 'profile', 'link', 'deck', 'post', 'topic', 'summary'",
          ),
        id: z.string().describe("Entity ID, slug, or title"),
      },
      visibility: "public",
      handler: async (input): Promise<ToolResponse> => {
        const parsed = z
          .object({
            entityType: z.string(),
            id: z.string(),
          })
          .parse(input);

        const entity = await plugin.findEntity(parsed.entityType, parsed.id);
        if (entity) {
          // Parse frontmatter and body from content
          const { frontmatter, content: body } = parseMarkdown(entity.content);

          // Build metadata object combining entity fields and frontmatter
          const metadata: Record<string, unknown> = {
            id: entity.id,
            type: entity.entityType,
            created: entity.created,
            updated: entity.updated,
            ...frontmatter,
          };

          // Format metadata header
          const metadataFormatted = formatAsEntity(metadata, {
            title: `${entity.entityType}: ${entity.id}`,
            excludeFields: ["content"], // Don't show content in metadata section
          });

          // Combine metadata and body
          const formatted = `${metadataFormatted}\n\n---\n\n${body}`;

          return {
            status: "success",
            data: { entity },
            formatted,
          };
        }
        return {
          status: "error",
          message: "Entity not found",
          formatted: `_Entity not found: ${parsed.entityType}/${parsed.id}_`,
        };
      },
    },
    {
      name: `${pluginId}_list`,
      description:
        "List entities by type with optional filters. Use for browsing entities without a search query.",
      inputSchema: {
        entityType: z
          .string()
          .describe(
            "Entity type: 'note', 'profile', 'link', 'deck', 'post', 'topic', 'summary'",
          ),
        status: z
          .string()
          .optional()
          .describe("Filter by status: 'draft', 'published', etc."),
        limit: z
          .number()
          .optional()
          .describe("Maximum number of results (default: 20)"),
      },
      visibility: "public",
      handler: async (input): Promise<ToolResponse> => {
        const parsed = z
          .object({
            entityType: z.string(),
            status: z.string().optional(),
            limit: z.number().optional(),
          })
          .parse(input);

        const options: { limit: number; filter?: Record<string, unknown> } = {
          limit: parsed.limit ?? 20,
        };
        if (parsed.status) {
          options.filter = { metadata: { status: parsed.status } };
        }

        const entities = await plugin.listEntities(parsed.entityType, options);

        const formatted = formatAsList(entities, {
          title: (e) => e.id,
          subtitle: (e) => {
            const meta = e.metadata as Record<string, unknown> | undefined;
            const title = meta?.["title"];
            const status = meta?.["status"];
            const parts: string[] = [];
            if (title && typeof title === "string") parts.push(title);
            if (status && typeof status === "string") parts.push(`(${status})`);
            return parts.join(" ");
          },
          header: `## ${parsed.entityType}s (${entities.length})`,
        });

        return {
          status: "success",
          data: { entities, count: entities.length },
          formatted,
        };
      },
    },
    {
      name: `${pluginId}_check-job-status`,
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
          if (!status.batch) {
            return {
              error: "Batch not found",
              message: `No batch found with ID: ${parsed.batchId}`,
              formatted: `_No batch found with ID: ${parsed.batchId}_`,
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

          const formatted = formatAsEntity(
            {
              batchId: parsed.batchId,
              status: status.batch.status,
              progress: `${status.batch.completedOperations}/${status.batch.totalOperations} (${percentComplete}%)`,
              failed: status.batch.failedOperations,
              currentOperation: status.batch.currentOperation ?? "N/A",
            },
            { title: "Batch Status" },
          );

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
            formatted,
          };
        } else {
          const activeJobs = status.activeJobs ?? [];
          const activeBatches = status.activeBatches ?? [];

          const lines: string[] = ["## Active Operations", ""];

          if (activeJobs.length === 0 && activeBatches.length === 0) {
            lines.push("_No active operations_");
          } else {
            if (activeBatches.length > 0) {
              lines.push(`**Batches:** ${activeBatches.length}`);
              for (const batch of activeBatches) {
                lines.push(
                  `- ${batch.batchId}: ${batch.status.completedOperations}/${batch.status.totalOperations}`,
                );
              }
              lines.push("");
            }
            if (activeJobs.length > 0) {
              lines.push(`**Jobs:** ${activeJobs.length}`);
              for (const job of activeJobs.slice(0, 5)) {
                lines.push(`- ${job.type}: ${job.status}`);
              }
              if (activeJobs.length > 5) {
                lines.push(`_...and ${activeJobs.length - 5} more_`);
              }
            }
          }

          return {
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
            formatted: lines.join("\n"),
          };
        }
      },
    },
    {
      name: `${pluginId}_get-conversation`,
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
              formatted: `_Conversation not found: ${parsed.conversationId}_`,
            };
          }

          const formatted = formatAsEntity(
            {
              id: conversation.id,
              interface: conversation.interfaceType,
              channel: conversation.channelId,
              created: conversation.created,
              lastActive: conversation.lastActive,
            },
            { title: "Conversation" },
          );

          return {
            id: conversation.id,
            interfaceType: conversation.interfaceType,
            channelId: conversation.channelId,
            created: conversation.created,
            lastActive: conversation.lastActive,
            formatted,
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            error: "Failed to get conversation",
            message,
            formatted: `_Error: ${message}_`,
          };
        }
      },
    },
    {
      name: `${pluginId}_list-conversations`,
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

          const formatted = formatAsList(limitedConversations, {
            title: (c) => c.id,
            subtitle: (c) => `${c.interfaceType} - ${c.channelId}`,
            header: `## Conversations (${limitedConversations.length} of ${conversations.length})`,
          });

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
            formatted,
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            error: "Failed to list conversations",
            message,
            formatted: `_Error: ${message}_`,
          };
        }
      },
    },
    {
      name: `${pluginId}_get-messages`,
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

          const formatted = formatAsList(messages, {
            title: (m) => `[${m.role}]`,
            subtitle: (m) =>
              m.content.length > 100
                ? m.content.substring(0, 100) + "..."
                : m.content,
            header: `## Messages (${messages.length})`,
          });

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
            formatted,
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            error: "Failed to get messages",
            message,
            formatted: `_Error: ${message}_`,
          };
        }
      },
    },
    {
      name: `${pluginId}_get-identity`,
      description:
        "Get the brain's identity - its name, role, purpose, and values. Use for 'who are you?' or 'what is this brain?' questions.",
      inputSchema: {},
      visibility: "public",
      handler: async (): Promise<ToolResponse> => {
        try {
          const identity = plugin.getIdentityData();

          const formatted = formatAsEntity(
            {
              name: identity.name,
              role: identity.role,
              purpose: identity.purpose,
              values: identity.values.join(", "),
            },
            { title: "Brain Identity" },
          );

          return {
            status: "success",
            data: identity,
            formatted,
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            status: "error",
            message,
            formatted: `_Error: ${message}_`,
          };
        }
      },
    },
    {
      name: `${pluginId}_get-profile`,
      description:
        "Get the anchor's (owner's) profile - their name, bio, social links. Use to answer questions about who owns/created this brain, or to recognize when you're speaking with the anchor themselves.",
      inputSchema: {},
      visibility: "public",
      handler: async (): Promise<ToolResponse> => {
        try {
          const profile = plugin.getProfileData();

          const formatted = formatAsEntity(
            {
              name: profile.name,
              description: profile.description ?? "N/A",
              email: profile.email ?? "N/A",
              socialLinks: profile.socialLinks
                ? profile.socialLinks
                    .map((link) => `${link.platform}: ${link.url}`)
                    .join(", ")
                : "N/A",
            },
            { title: "Anchor Profile" },
          );

          return {
            status: "success",
            data: profile,
            formatted,
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            status: "error",
            message,
            formatted: `_Error: ${message}_`,
          };
        }
      },
    },
    {
      name: `${pluginId}_get-status`,
      description:
        "Get system status including model, version, running interfaces, and available tools",
      inputSchema: {},
      visibility: "public",
      handler: async (): Promise<ToolResponse> => {
        try {
          const appInfo = await plugin.getAppInfo();

          const lines = [
            "## System Status",
            "",
            `**Model:** ${appInfo.model}`,
            `**Version:** ${appInfo.version}`,
            "",
            `**Plugins:** ${appInfo.plugins.length}`,
          ];

          for (const p of appInfo.plugins) {
            lines.push(`- ${p.id} (${p.type}) - ${p.status}`);
          }

          lines.push("");
          lines.push(`**Interfaces:** ${appInfo.interfaces.length}`);

          for (const iface of appInfo.interfaces) {
            lines.push(`- ${iface.name}: ${iface.status}`);
          }

          if (appInfo.tools && appInfo.tools.length > 0) {
            lines.push("");
            lines.push(`**Tools:** ${appInfo.tools.length}`);
            for (const tool of appInfo.tools) {
              lines.push(`- ${tool.name}: ${tool.description}`);
            }
          }

          return {
            status: "success",
            data: appInfo,
            formatted: lines.join("\n"),
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            status: "error",
            message,
            formatted: `_Error: ${message}_`,
          };
        }
      },
    },
  ];
}
