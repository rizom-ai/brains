import { ServicePlugin } from "@brains/plugins";
import {
  conversationDigestPayloadSchema,
  type ServicePluginContext,
  type ConversationDigestPayload,
  type MessageWithPayload,
} from "@brains/plugins";
import { DigestHandler } from "./handlers/digest-handler";
import type { SummaryEntity } from "./schemas/summary";
import {
  summaryConfigSchema,
  summarySchema,
  type SummaryConfig,
} from "./schemas/summary";
import { SummaryAdapter } from "./adapters/summary-adapter";
import { createSummaryTools } from "./tools/index";
import type { PluginTool } from "@brains/plugins";
import { summaryListTemplate } from "./templates/summary-list";
import { summaryDetailTemplate } from "./templates/summary-detail";
import { summaryAiResponseTemplate } from "./templates/summary-ai-response";
import { SummaryDataSource } from "./datasources/summary-datasource";
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
   * Get the current configuration
   */
  public getConfig(): SummaryConfig {
    return this.config;
  }

  /**
   * Register the plugin and set up digest subscription
   */
  override async onRegister(context: ServicePluginContext): Promise<void> {
    // Call parent onRegister first to set up base functionality
    await super.onRegister(context);

    // Register the summary entity type with its adapter
    context.entities.register("summary", summarySchema, new SummaryAdapter());

    // Register templates
    context.templates.register({
      "summary-list": summaryListTemplate,
      "summary-detail": summaryDetailTemplate,
      "ai-response": summaryAiResponseTemplate,
    });

    // Register datasource for templates
    const summaryDataSource = new SummaryDataSource(
      context.entityService,
      this.logger,
    );
    context.entities.registerDataSource(summaryDataSource);

    // Initialize digest handler using singleton pattern
    this.digestHandler = DigestHandler.getInstance(context, this.logger);

    // Subscribe to conversation digest events
    if (this.config.enableAutoSummary) {
      context.messaging.subscribe("conversation:digest", async (message) => {
        const payload = conversationDigestPayloadSchema.parse(message.payload);
        await this.handleDigestMessage({ ...message, payload });
        return { success: true };
      });
      this.logger.debug("Summary plugin subscribed to digest events");
    }
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
      this.logger.error("Plugin context not initialized");
      throw new Error("Plugin not initialized");
    }

    try {
      const entity = await this.context.entityService.getEntity<SummaryEntity>(
        "summary",
        conversationId,
      );
      return entity ?? null;
    } catch (error) {
      this.logger.debug("Summary not found", {
        conversationId,
        error: error instanceof Error ? error.message : String(error),
      });
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

    try {
      await this.context.entityService.deleteEntity("summary", conversationId);
      this.logger.info("Summary deleted", { conversationId });
      return true;
    } catch (error) {
      this.logger.error("Failed to delete summary", {
        conversationId,
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
      totalEntries += summary.metadata.entryCount;
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
