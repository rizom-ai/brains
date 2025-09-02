import {
  type ServicePluginContext,
  type Logger,
  type PluginTool,
  type ToolResponse,
} from "@brains/plugins";
import { z } from "@brains/utils";
import { SummaryAdapter } from "../adapters/summary-adapter";
import type { SummaryConfig } from "../schemas/summary";
import type { SummaryEntity } from "../schemas/summary";

// Schema for tool parameters
const getParamsSchema = z.object({
  conversationId: z.string(),
});

const listParamsSchema = z.object({
  limit: z.number().optional(),
});

const exportParamsSchema = z.object({
  conversationId: z.string(),
});

const deleteParamsSchema = z.object({
  conversationId: z.string(),
});

/**
 * Get summary for a conversation
 */
export function createGetTool(
  context: ServicePluginContext,
  _config: SummaryConfig,
  logger: Logger,
): PluginTool {
  return {
    name: "summary-get",
    description: "Get chronological summary for a conversation",
    inputSchema: getParamsSchema.shape,
    handler: async (params): Promise<ToolResponse> => {
      const parsed = getParamsSchema.safeParse(params);
      if (!parsed.success) {
        throw new Error(`Invalid parameters: ${parsed.error.message}`);
      }

      try {
        const summaryId = `summary-${parsed.data.conversationId}`;
        const summary = await context.entityService.getEntity<SummaryEntity>(
          "summary",
          summaryId,
        );

        if (!summary) {
          return {
            success: false,
            error: `No summary found for conversation: ${parsed.data.conversationId}`,
          };
        }

        // Parse summary content to extract structured data
        const adapter = new SummaryAdapter();
        const parsedContent = adapter.parseSummaryContent(summary.content);

        return {
          success: true,
          data: {
            conversationId: parsed.data.conversationId,
            summary: {
              id: summary.id,
              entries: parsedContent.entries,
              totalMessages: parsedContent.totalMessages,
              lastUpdated: parsedContent.lastUpdated,
              entryCount: parsedContent.entries.length,
            },
            metadata: summary.metadata,
            created: summary.created,
            updated: summary.updated,
          },
        };
      } catch (error) {
        logger.error("Error getting summary", {
          conversationId: parsed.data.conversationId,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          success: false,
          error: `Failed to get summary: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}

/**
 * List all summaries
 */
export function createListTool(
  context: ServicePluginContext,
  _config: SummaryConfig,
  logger: Logger,
): PluginTool {
  return {
    name: "summary-list",
    description: "List all conversation summaries",
    inputSchema: listParamsSchema.shape,
    handler: async (params): Promise<ToolResponse> => {
      const parsed = listParamsSchema.safeParse(params);
      if (!parsed.success) {
        throw new Error(`Invalid parameters: ${parsed.error.message}`);
      }

      try {
        const summaries =
          await context.entityService.listEntities<SummaryEntity>("summary", {
            limit: parsed.data.limit ?? 50,
            sortBy: "updated",
            sortDirection: "desc",
          });

        const adapter = new SummaryAdapter();
        const summaryData = summaries.map((summary) => {
          const conversationId =
            summary.metadata?.conversationId ??
            summary.id.replace("summary-", "");
          const entryCount = summary.metadata?.entryCount ?? 0;
          const totalMessages = summary.metadata?.totalMessages ?? 0;

          // Get first entry title as preview
          const parsed = adapter.parseSummaryContent(summary.content);
          const firstEntryTitle = parsed.entries[0]?.title ?? "No entries";

          return {
            conversationId,
            id: summary.id,
            entryCount,
            totalMessages,
            latestEntry: firstEntryTitle,
            lastUpdated: summary.updated,
            created: summary.created,
          };
        });

        return {
          success: true,
          data: {
            summaries: summaryData,
            count: summaries.length,
          },
        };
      } catch (error) {
        logger.error("Error listing summaries", {
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          success: false,
          error: `Failed to list summaries: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}

/**
 * Export summary as markdown
 */
export function createExportTool(
  context: ServicePluginContext,
  _config: SummaryConfig,
  logger: Logger,
): PluginTool {
  return {
    name: "summary-export",
    description: "Export summary as formatted markdown",
    inputSchema: exportParamsSchema.shape,
    handler: async (params): Promise<ToolResponse> => {
      const parsed = exportParamsSchema.safeParse(params);
      if (!parsed.success) {
        throw new Error(`Invalid parameters: ${parsed.error.message}`);
      }

      try {
        const summaryId = `summary-${parsed.data.conversationId}`;
        const summary = await context.entityService.getEntity<SummaryEntity>(
          "summary",
          summaryId,
        );

        if (!summary) {
          return {
            success: false,
            error: `No summary found for conversation: ${parsed.data.conversationId}`,
          };
        }

        return {
          success: true,
          data: {
            conversationId: parsed.data.conversationId,
            markdown: summary.content,
            exported: new Date().toISOString(),
          },
        };
      } catch (error) {
        logger.error("Error exporting summary", {
          conversationId: parsed.data.conversationId,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          success: false,
          error: `Failed to export summary: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}

/**
 * Delete a summary
 */
export function createDeleteTool(
  context: ServicePluginContext,
  _config: SummaryConfig,
  logger: Logger,
): PluginTool {
  return {
    name: "summary-delete",
    description: "Delete a conversation summary",
    inputSchema: deleteParamsSchema.shape,
    handler: async (params): Promise<ToolResponse> => {
      const parsed = deleteParamsSchema.safeParse(params);
      if (!parsed.success) {
        throw new Error(`Invalid parameters: ${parsed.error.message}`);
      }

      try {
        const summaryId = `summary-${parsed.data.conversationId}`;
        const success = await context.entityService.deleteEntity(
          "summary",
          summaryId,
        );

        if (!success) {
          return {
            success: false,
            error: `Failed to delete summary for conversation: ${parsed.data.conversationId}`,
          };
        }

        logger.info("Summary deleted", {
          conversationId: parsed.data.conversationId,
          summaryId,
        });

        return {
          success: true,
          data: {
            conversationId: parsed.data.conversationId,
            message: `Successfully deleted summary for conversation: ${parsed.data.conversationId}`,
          },
        };
      } catch (error) {
        logger.error("Error deleting summary", {
          conversationId: parsed.data.conversationId,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          success: false,
          error: `Failed to delete summary: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}

/**
 * Get summary statistics
 */
export function createStatsTool(
  context: ServicePluginContext,
  _config: SummaryConfig,
  logger: Logger,
): PluginTool {
  return {
    name: "summary-stats",
    description: "Get summary statistics across all conversations",
    inputSchema: z.object({}).shape,
    handler: async (_params): Promise<ToolResponse> => {
      try {
        const summaries =
          await context.entityService.listEntities<SummaryEntity>("summary", {
            limit: 1000,
          });

        let totalEntries = 0;
        for (const summary of summaries) {
          totalEntries += summary.metadata?.entryCount ?? 0;
        }

        const stats = {
          totalSummaries: summaries.length,
          totalEntries,
          averageEntriesPerSummary:
            summaries.length > 0 ? totalEntries / summaries.length : 0,
        };

        return {
          success: true,
          data: stats,
        };
      } catch (error) {
        logger.error("Error getting statistics", {
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          success: false,
          error: `Failed to get statistics: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}

/**
 * Create all summary tools
 */
export function createSummaryTools(
  context: ServicePluginContext,
  config: SummaryConfig,
  logger: Logger,
): PluginTool[] {
  return [
    createGetTool(context, config, logger),
    createListTool(context, config, logger),
    createExportTool(context, config, logger),
    createDeleteTool(context, config, logger),
    createStatsTool(context, config, logger),
  ];
}
