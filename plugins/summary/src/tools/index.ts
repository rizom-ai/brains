import {
  type ServicePluginContext,
  type Logger,
  type PluginTool,
  type ToolResponse,
  parseMarkdownWithFrontmatter,
} from "@brains/plugins";
import { z, formatAsList, formatAsEntity } from "@brains/utils";
import { SummaryService } from "../lib/summary-service";
import { SummaryAdapter } from "../adapters/summary-adapter";
import type { SummaryConfig } from "../schemas/summary";

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
  const summaryService = new SummaryService(context.entityService);
  const adapter = new SummaryAdapter();

  return {
    name: "summary_get",
    description: "Get chronological summary for a conversation",
    inputSchema: getParamsSchema.shape,
    visibility: "public",
    handler: async (params): Promise<ToolResponse> => {
      const parsed = getParamsSchema.safeParse(params);
      if (!parsed.success) {
        throw new Error(`Invalid parameters: ${parsed.error.message}`);
      }

      try {
        const summary = await summaryService.getSummary(
          parsed.data.conversationId,
        );

        if (!summary) {
          logger.info("No summary found for conversation", {
            conversationId: parsed.data.conversationId,
          });
          return {
            success: false,
            data: {
              message: `No summary found for conversation ${parsed.data.conversationId}`,
            },
            formatted: `_No summary found for conversation ${parsed.data.conversationId}_`,
          };
        }

        // Parse entries from content
        let entries;
        try {
          const parsedContent = parseMarkdownWithFrontmatter(
            summary.content,
            z.record(z.string(), z.unknown()),
          );
          entries = adapter.parseEntriesFromContent(parsedContent.content);
        } catch {
          entries = adapter.parseEntriesFromContent(summary.content);
        }

        logger.info("Retrieved summary", {
          conversationId: parsed.data.conversationId,
          entryCount: entries.length,
        });

        const formatted = formatAsList(entries, {
          title: (e) => e.title,
          subtitle: (e) =>
            e.content.slice(0, 100) + (e.content.length > 100 ? "..." : ""),
          header: `## Summary (${entries.length} entries)`,
        });

        return {
          success: true,
          data: {
            conversationId: parsed.data.conversationId,
            created: summary.created,
            updated: summary.updated,
            entryCount: entries.length,
            entries,
            metadata: summary.metadata,
          },
          formatted,
        };
      } catch (error) {
        logger.error("Failed to retrieve summary", {
          conversationId: parsed.data.conversationId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  };
}

/**
 * List all conversation summaries
 */
export function createListTool(
  context: ServicePluginContext,
  _config: SummaryConfig,
  logger: Logger,
): PluginTool {
  const summaryService = new SummaryService(context.entityService);
  const adapter = new SummaryAdapter();

  return {
    name: "summary_list",
    description: "List all conversation summaries",
    inputSchema: listParamsSchema.shape,
    visibility: "public",
    handler: async (params): Promise<ToolResponse> => {
      const parsed = listParamsSchema.safeParse(params);
      if (!parsed.success) {
        throw new Error(`Invalid parameters: ${parsed.error.message}`);
      }

      const limit = parsed.data.limit ?? 10;

      try {
        const summaries = await summaryService.getAllSummaries();

        // Apply limit
        const limitedSummaries = summaries.slice(0, limit);

        const summaryList = limitedSummaries.map((summary) => {
          // Parse entries from content
          let entries;
          try {
            const parsedContent = parseMarkdownWithFrontmatter(
              summary.content,
              z.record(z.string(), z.unknown()),
            );
            entries = adapter.parseEntriesFromContent(parsedContent.content);
          } catch {
            entries = adapter.parseEntriesFromContent(summary.content);
          }

          const conversationId = summary.id.replace("summary-", "");
          return {
            conversationId,
            created: summary.created,
            updated: summary.updated,
            entryCount: entries.length,
            lastEntry: entries[0]?.title ?? "No entries",
          };
        });

        logger.info("Listed summaries", { count: summaryList.length });

        const formatted = formatAsList(summaryList, {
          title: (s) => s.conversationId,
          subtitle: (s) => `${s.entryCount} entries - ${s.lastEntry}`,
          header: `## Summaries (${summaryList.length})`,
        });

        return {
          success: true,
          data: {
            summaries: summaryList,
            total: summaryList.length,
          },
          formatted,
        };
      } catch (error) {
        logger.error("Failed to list summaries", {
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  };
}

/**
 * Export a summary as formatted markdown
 */
export function createExportTool(
  context: ServicePluginContext,
  _config: SummaryConfig,
  logger: Logger,
): PluginTool {
  const summaryService = new SummaryService(context.entityService);

  return {
    name: "summary_export",
    description: "Export summary as formatted markdown",
    inputSchema: exportParamsSchema.shape,
    visibility: "public",
    handler: async (params): Promise<ToolResponse> => {
      const parsed = exportParamsSchema.safeParse(params);
      if (!parsed.success) {
        throw new Error(`Invalid parameters: ${parsed.error.message}`);
      }

      try {
        const markdown = await summaryService.exportSummary(
          parsed.data.conversationId,
        );

        if (!markdown) {
          logger.info("No summary found for export", {
            conversationId: parsed.data.conversationId,
          });
          return {
            success: false,
            data: {
              message: `No summary found for conversation ${parsed.data.conversationId}`,
            },
            formatted: `_No summary found for conversation ${parsed.data.conversationId}_`,
          };
        }

        logger.info("Exported summary", {
          conversationId: parsed.data.conversationId,
        });

        return {
          success: true,
          data: {
            conversationId: parsed.data.conversationId,
            markdown,
          },
          formatted: markdown,
        };
      } catch (error) {
        logger.error("Failed to export summary", {
          conversationId: parsed.data.conversationId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  };
}

/**
 * Delete a conversation summary
 */
export function createDeleteTool(
  context: ServicePluginContext,
  _config: SummaryConfig,
  logger: Logger,
): PluginTool {
  const summaryService = new SummaryService(context.entityService);

  return {
    name: "summary_delete",
    description: "Delete a conversation summary",
    inputSchema: deleteParamsSchema.shape,
    visibility: "anchor",
    handler: async (params): Promise<ToolResponse> => {
      const parsed = deleteParamsSchema.safeParse(params);
      if (!parsed.success) {
        throw new Error(`Invalid parameters: ${parsed.error.message}`);
      }

      try {
        const success = await summaryService.deleteSummary(
          parsed.data.conversationId,
        );

        if (!success) {
          logger.info("No summary found to delete", {
            conversationId: parsed.data.conversationId,
          });
          return {
            success: false,
            data: {
              message: `No summary found for conversation ${parsed.data.conversationId}`,
            },
            formatted: `_No summary found for conversation ${parsed.data.conversationId}_`,
          };
        }

        logger.info("Deleted summary", {
          conversationId: parsed.data.conversationId,
        });

        return {
          success: true,
          data: {
            message: `Summary deleted for conversation ${parsed.data.conversationId}`,
          },
          formatted: `Summary deleted for conversation **${parsed.data.conversationId}**`,
        };
      } catch (error) {
        logger.error("Failed to delete summary", {
          conversationId: parsed.data.conversationId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
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
  const summaryService = new SummaryService(context.entityService);

  return {
    name: "summary_stats",
    description: "Get summary statistics",
    inputSchema: z.object({}).shape,
    visibility: "public",
    handler: async (_params): Promise<ToolResponse> => {
      try {
        const stats = await summaryService.getStatistics();

        logger.info("Retrieved summary statistics", stats);

        const formatted = formatAsEntity(stats, {
          title: "Summary Statistics",
        });

        return {
          success: true,
          data: stats,
          formatted,
        };
      } catch (error) {
        logger.error("Failed to get summary statistics", {
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
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
