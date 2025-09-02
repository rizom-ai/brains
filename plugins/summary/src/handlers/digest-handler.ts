import type {
  Logger,
  ServicePluginContext,
  ConversationDigestPayload,
} from "@brains/plugins";
import { SummaryExtractor } from "../lib/summary-extractor";
import type { SummaryEntity } from "../schemas/summary";

/**
 * Handler for conversation digest events
 * Processes digests and updates summary entities
 */
export class DigestHandler {
  private extractor: SummaryExtractor;

  constructor(
    private readonly context: ServicePluginContext,
    private readonly logger: Logger,
  ) {
    this.extractor = new SummaryExtractor(context, logger);
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
            summaryId,
            "summary",
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
      const updatedContent = this.extractor.applyDecision(
        decision,
        existingEntity?.content ?? null,
        digest.conversationId,
      );

      // Save the updated summary
      const summaryEntity: SummaryEntity = {
        id: summaryId,
        entityType: "summary",
        content: updatedContent,
        created: existingEntity?.created ?? digest.timestamp,
        updated: digest.timestamp,
        metadata: {
          conversationId: digest.conversationId,
          entryCount: updatedContent.split("### [").length - 1, // Count entries
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
