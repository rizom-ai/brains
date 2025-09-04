import type {
  Logger,
  ServicePluginContext,
  ConversationDigestPayload,
} from "@brains/plugins";
import { SummaryExtractor } from "../lib/summary-extractor";
import { SummaryAdapter } from "../adapters/summary-adapter";
import type { SummaryEntity } from "../schemas/summary";

/**
 * Handler for conversation digest events
 * Processes digests and updates summary entities
 * Simplified to work with natural language summaries
 */
export class DigestHandler {
  private static instance: DigestHandler | null = null;
  private extractor: SummaryExtractor;
  private adapter: SummaryAdapter;

  /**
   * Get singleton instance
   */
  public static getInstance(
    context: ServicePluginContext,
    logger: Logger,
  ): DigestHandler {
    DigestHandler.instance ??= new DigestHandler(context, logger);
    return DigestHandler.instance;
  }

  /**
   * Reset singleton instance (for testing)
   */
  public static resetInstance(): void {
    DigestHandler.instance = null;
  }

  /**
   * Create fresh instance (for testing)
   */
  public static createFresh(
    context: ServicePluginContext,
    logger: Logger,
  ): DigestHandler {
    return new DigestHandler(context, logger);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(
    private readonly context: ServicePluginContext,
    private readonly logger: Logger,
  ) {
    this.extractor = SummaryExtractor.createFresh(context, logger);
    this.adapter = new SummaryAdapter();
  }

  /**
   * Process a conversation digest and update the summary
   */
  public async handleDigest(digest: ConversationDigestPayload): Promise<void> {
    const summaryId = `summary-${digest.conversationId}`;

    try {
      this.logger.info("Processing digest for conversation", {
        conversationId: digest.conversationId,
        messageCount: digest.messageCount,
        windowSize: digest.windowSize,
      });

      // Get existing summary if it exists
      let existingEntity: SummaryEntity | null = null;
      try {
        existingEntity =
          await this.context.entityService.getEntity<SummaryEntity>(
            "summary",
            summaryId,
          );
      } catch {
        // Entity doesn't exist yet, that's fine
        this.logger.debug("No existing summary found", { summaryId });
      }

      // Analyze the digest and decide how to update
      const decision = await this.extractor.analyzeDigest(
        digest,
        existingEntity?.content ?? null,
      );

      // Apply the decision to create/update the summary
      let updatedContent: string;
      if (decision.action === "create") {
        // Create new summary with first entry
        updatedContent = this.adapter.addOrUpdateEntry(
          null,
          decision.entry,
          digest.conversationId,
          false,
        );
      } else if (decision.action === "update") {
        // Update existing entry
        updatedContent = this.adapter.addOrUpdateEntry(
          existingEntity?.content ?? null,
          decision.entry,
          digest.conversationId,
          true,
          decision.entryIndex,
        );
      } else {
        // Append new entry
        updatedContent = this.adapter.addOrUpdateEntry(
          existingEntity?.content ?? null,
          decision.entry,
          digest.conversationId,
          false,
        );
      }

      // Parse the content to get metadata
      const body = this.adapter.parseSummaryContent(updatedContent);

      // Update totalMessages with the window end (approximate total)
      body.totalMessages = digest.windowEnd;
      updatedContent = this.adapter.createSummaryContent(body);

      // Save the updated summary
      const summaryEntity: SummaryEntity = {
        id: summaryId,
        entityType: "summary",
        content: updatedContent,
        created: existingEntity?.created ?? digest.timestamp,
        updated: digest.timestamp,
        metadata: {
          conversationId: digest.conversationId,
          entryCount: body.entries.length,
          totalMessages: digest.windowEnd,
          lastUpdated: digest.timestamp,
        },
      };

      await this.context.entityService.upsertEntity(summaryEntity);

      this.logger.info("Summary updated successfully", {
        conversationId: digest.conversationId,
        action: decision.action,
        entryCount: summaryEntity.metadata?.entryCount,
      });
    } catch (error) {
      this.logger.error("Failed to process digest", {
        conversationId: digest.conversationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Handle multiple digests in batch (useful for catch-up scenarios)
   */
  public async handleDigestBatch(
    digests: ConversationDigestPayload[],
  ): Promise<void> {
    for (const digest of digests) {
      await this.handleDigest(digest);
    }
  }
}
