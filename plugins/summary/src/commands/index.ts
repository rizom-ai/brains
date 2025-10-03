import type {
  Command,
  CommandResponse,
  ServicePluginContext,
} from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import { z } from "@brains/utils";
import type { Logger } from "@brains/utils";
import type { SummaryConfig } from "../schemas/summary";
import { SummaryService } from "../lib/summary-service";
import { SummaryAdapter } from "../adapters/summary-adapter";

/**
 * Create summary-list command
 */
export function createListCommand(
  context: ServicePluginContext,
  _config: SummaryConfig,
  _logger: Logger,
): Command {
  const summaryService = new SummaryService(context.entityService);
  const adapter = new SummaryAdapter();

  return {
    name: "summary-list",
    description: "List all conversation summaries",
    usage: "/summary-list [--limit <number>]",
    handler: async (args, _context): Promise<CommandResponse> => {
      try {
        // Parse limit argument
        let limit = 10;
        for (let i = 0; i < args.length; i++) {
          if (args[i] === "--limit" && args[i + 1]) {
            limit = parseInt(args[i + 1] as string, 10);
            if (isNaN(limit) || limit < 1 || limit > 100) {
              return {
                type: "message",
                message: "Limit must be a number between 1 and 100",
              };
            }
          }
        }

        const summaries = await summaryService.getAllSummaries();

        if (summaries.length === 0) {
          return {
            type: "message",
            message: "No summaries found",
          };
        }

        // Sort and limit for display
        const displaySummaries = summaries
          .sort(
            (a, b) =>
              new Date(b.updated).getTime() - new Date(a.updated).getTime(),
          )
          .slice(0, limit);

        // Format for CLI
        const formatted = displaySummaries
          .map((summary) => {
            const conversationId = summary.metadata.conversationId;
            const entryCount = summary.metadata.entryCount;
            const lastUpdated = new Date(summary.updated).toLocaleDateString();

            // Get first entry title as preview
            let entries;
            try {
              const parsed = parseMarkdownWithFrontmatter(
                summary.content,
                z.record(z.string(), z.unknown()),
              );
              entries = adapter.parseEntriesFromContent(parsed.content);
            } catch {
              entries = adapter.parseEntriesFromContent(summary.content);
            }
            const preview = entries[0]?.title ?? "No entries";

            return [
              `**${conversationId}** | ${entryCount} entries | ${lastUpdated}`,
              `Latest: ${preview}`,
            ].join("\n");
          })
          .join("\n\n");

        return {
          type: "message",
          message: `📋 **Found ${displaySummaries.length} summaries:**\n\n${formatted}`,
        };
      } catch (error) {
        return {
          type: "message",
          message: `Error: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}

/**
 * Create summary-get command
 */
export function createGetCommand(
  context: ServicePluginContext,
  _config: SummaryConfig,
  _logger: Logger,
): Command {
  const summaryService = new SummaryService(context.entityService);

  return {
    name: "summary-get",
    description: "Get summary for a specific conversation",
    usage: "/summary-get <conversation-id>",
    handler: async (args, _context): Promise<CommandResponse> => {
      try {
        if (args.length === 0) {
          return {
            type: "message",
            message: "Usage: /summary-get <conversation-id>",
          };
        }

        const conversationId = args[0] as string;
        const summary = await summaryService.getSummary(conversationId);

        if (!summary) {
          return {
            type: "message",
            message: `No summary found for conversation: ${conversationId}`,
          };
        }

        // Use the raw markdown content for display
        const content = await summaryService.exportSummary(conversationId);

        return {
          type: "message",
          message: content ?? "Error retrieving summary content",
        };
      } catch (error) {
        return {
          type: "message",
          message: `Error getting summary: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}

/**
 * Create summary-export command
 */
export function createExportCommand(
  context: ServicePluginContext,
  _config: SummaryConfig,
  _logger: Logger,
): Command {
  const summaryService = new SummaryService(context.entityService);

  return {
    name: "summary-export",
    description: "Export summary as markdown",
    usage: "/summary-export <conversation-id>",
    handler: async (args, _context): Promise<CommandResponse> => {
      try {
        if (args.length === 0) {
          return {
            type: "message",
            message: "Usage: /summary-export <conversation-id>",
          };
        }

        const conversationId = args[0] as string;
        const content = await summaryService.exportSummary(conversationId);

        if (!content) {
          return {
            type: "message",
            message: `No summary found for conversation: ${conversationId}`,
          };
        }

        return {
          type: "message",
          message: `📄 **Summary Export**\n\n\`\`\`markdown\n${content}\n\`\`\``,
        };
      } catch (error) {
        return {
          type: "message",
          message: `Error exporting summary: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}

/**
 * Create summary-delete command
 */
export function createDeleteCommand(
  context: ServicePluginContext,
  _config: SummaryConfig,
  _logger: Logger,
): Command {
  const summaryService = new SummaryService(context.entityService);

  return {
    name: "summary-delete",
    description: "Delete a conversation summary",
    usage: "/summary-delete <conversation-id>",
    handler: async (args, _context): Promise<CommandResponse> => {
      try {
        if (args.length === 0) {
          return {
            type: "message",
            message: "Usage: /summary-delete <conversation-id>",
          };
        }

        const conversationId = args[0] as string;

        // Check if exists and delete
        const existingSummary = await summaryService.getSummary(conversationId);
        if (!existingSummary) {
          return {
            type: "message",
            message: `No summary found for conversation: ${conversationId}`,
          };
        }

        const deleted = await summaryService.deleteSummary(conversationId);

        return {
          type: "message",
          message: deleted
            ? `✅ Deleted summary for conversation: ${conversationId}`
            : `❌ Failed to delete summary for conversation: ${conversationId}`,
        };
      } catch (error) {
        return {
          type: "message",
          message: `Error deleting summary: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}

/**
 * Create summary-stats command
 */
export function createStatsCommand(
  context: ServicePluginContext,
  _config: SummaryConfig,
  _logger: Logger,
): Command {
  const summaryService = new SummaryService(context.entityService);

  return {
    name: "summary-stats",
    description: "Get summary statistics",
    usage: "/summary-stats",
    handler: async (_args, _context): Promise<CommandResponse> => {
      try {
        const stats = await summaryService.getStatistics();

        return {
          type: "message",
          message: [
            `📊 **Summary Statistics**`,
            ``,
            `**Summaries:** ${stats.totalSummaries}`,
            `**Total Entries:** ${stats.totalEntries}`,
            `**Avg Entries/Summary:** ${stats.averageEntriesPerSummary.toFixed(1)}`,
            ``,
            stats.totalSummaries === 0
              ? `Summaries are created automatically every 10 messages.`
              : `Use /summary-list to see all summaries.`,
          ].join("\n"),
        };
      } catch (error) {
        return {
          type: "message",
          message: `Error: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}

/**
 * Create all summary commands (for backwards compatibility)
 */
export function createSummaryCommands(
  context: ServicePluginContext,
  config: SummaryConfig,
  logger: Logger,
): Command[] {
  return [
    createListCommand(context, config, logger),
    createGetCommand(context, config, logger),
    createExportCommand(context, config, logger),
    createDeleteCommand(context, config, logger),
    createStatsCommand(context, config, logger),
  ];
}
