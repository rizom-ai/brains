import { ServicePlugin } from "@brains/plugins";
import {
  conversationDigestPayloadSchema,
  type ServicePluginContext,
  type Logger,
  type ConversationDigestPayload,
} from "@brains/plugins";
import type { MessageWithPayload } from "@brains/messaging-service";
import { DigestHandler } from "./handlers/digest-handler";
import type { SummaryEntity } from "./schemas/summary";
import { summaryConfigSchema, type SummaryConfig } from "./schemas/summary";
import { createSummaryTools } from "./tools/index";
import type { PluginTool } from "@brains/plugins";
// import { createSummaryCommands } from "./commands/index";
// import type { Command } from "@brains/plugins";
import packageJson from "../package.json";

/**
 * Summary plugin for conversation summarization
 * Subscribes to conversation digest events and maintains chronological summaries
 */
export class SummaryPlugin extends ServicePlugin<SummaryConfig> {
  private digestHandler: DigestHandler | null = null;

  constructor(config?: Partial<SummaryConfig>) {
    super("summary", packageJson, config ?? {}, summaryConfigSchema);
  }

  /**
   * Initialize the plugin and set up digest subscription
   */
  public async initialize(
    context: ServicePluginContext,
    logger: Logger,
  ): Promise<void> {
    this.context = context;

    // Parse and validate configuration
    this.config = summaryConfigSchema.parse(this.config);

    // Initialize digest handler
    this.digestHandler = new DigestHandler(context, logger);

    // Subscribe to conversation digest events
    if (this.config.enableAutoSummary) {
      context.subscribe("conversation.digest", async (message) => {
        const payload = conversationDigestPayloadSchema.parse(message.payload);
        await this.handleDigestMessage({ ...message, payload });
        return { success: true };
      });
      this.logger.info("Summary plugin subscribed to digest events");
    }

    this.logger.info("Summary plugin initialized", {
      version: this.version,
      autoSummary: this.config.enableAutoSummary,
    });
  }

  /**
   * Register MCP tools
   */
  protected override async getTools(): Promise<PluginTool[]> {
    if (!this.context) {
      throw new Error("Plugin not initialized");
    }
    return createSummaryTools(this.context, this.config, this.logger);
  }

  // TODO: Add commands
  // protected override async getCommands(): Promise<Command[]> {
  //   return [];
  // }

  /**
   * Handle incoming digest messages
   */
  private async handleDigestMessage(
    message: MessageWithPayload<ConversationDigestPayload>,
  ): Promise<void> {
    if (!this.digestHandler) {
      this.logger.error("Digest handler not initialized");
      return;
    }

    try {
      await this.digestHandler.handleDigest(message.payload);
    } catch (err) {
      this.logger.error("Failed to handle digest message", {
        messageId: message.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Get summary for a conversation
   */
  public async getSummary(
    conversationId: string,
  ): Promise<SummaryEntity | null> {
    if (!this.context) {
      throw new Error("Plugin not initialized");
    }

    const summaryId = `summary-${conversationId}`;

    try {
      return await this.context.entityService.getEntity<SummaryEntity>(
        "summary",
        summaryId,
      );
    } catch {
      this.logger.debug("Summary not found", { summaryId });
      return null;
    }
  }

  /**
   * Delete summary for a conversation
   */
  public async deleteSummary(conversationId: string): Promise<boolean> {
    if (!this.context) {
      throw new Error("Plugin not initialized");
    }

    const summaryId = `summary-${conversationId}`;

    try {
      await this.context.entityService.deleteEntity("summary", summaryId);
      this.logger.info("Summary deleted", { summaryId });
      return true;
    } catch (error) {
      this.logger.error("Failed to delete summary", {
        summaryId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Get all summaries (for management/export purposes)
   */
  public async getAllSummaries(): Promise<SummaryEntity[]> {
    if (!this.context) {
      throw new Error("Plugin not initialized");
    }

    try {
      return await this.context.entityService.listEntities<SummaryEntity>(
        "summary",
        {
          limit: 1000, // Get all summaries
        },
      );
    } catch (error) {
      this.logger.error("Failed to get all summaries", {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Export summary as markdown
   */
  public async exportSummary(conversationId: string): Promise<string | null> {
    const summary = await this.getSummary(conversationId);
    if (!summary) {
      return null;
    }
    return summary.content;
  }

  /**
   * Get summary statistics
   */
  public async getStatistics(): Promise<{
    totalSummaries: number;
    totalEntries: number;
    averageEntriesPerSummary: number;
  }> {
    const summaries = await this.getAllSummaries();

    let totalEntries = 0;
    for (const summary of summaries) {
      totalEntries += summary.metadata?.entryCount ?? 0;
    }

    return {
      totalSummaries: summaries.length,
      totalEntries,
      averageEntriesPerSummary:
        summaries.length > 0 ? totalEntries / summaries.length : 0,
    };
  }

  /**
   * Clean up resources
   */
  public async cleanup(): Promise<void> {
    // Subscriptions are managed automatically by the plugin system
    this.digestHandler = null;
    this.logger.info("Summary plugin cleaned up");
  }
}
