import {
  type ServicePluginContext,
  type Logger,
  type PluginTool,
  type ToolResponse,
  parseMarkdownWithFrontmatter,
} from "@brains/plugins";
import { z, formatAsList } from "@brains/utils";
import { SummaryService } from "../lib/summary-service";
import { SummaryAdapter } from "../adapters/summary-adapter";
import type { SummaryConfig } from "../schemas/summary";

// Schema for tool parameters
const getParamsSchema = z.object({
  conversationId: z.string(),
});

/**
 * Get summary for a conversation by conversationId
 * Note: This tool exists because it looks up by conversationId (domain-specific),
 * not by entity ID. For entity-based operations, use system_get/system_list.
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
    description:
      "Get a conversation's summary with key discussion points. Use when users want to review what was discussed.",
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
 * Create all summary tools
 * Note: list/export/delete/stats functionality removed - use system tools instead:
 * - system_list with entityType="summary" for listing
 * - system_get for reading full content (can be exported as markdown)
 * - AI can calculate stats from list results
 */
export function createSummaryTools(
  context: ServicePluginContext,
  config: SummaryConfig,
  logger: Logger,
): PluginTool[] {
  return [createGetTool(context, config, logger)];
}
