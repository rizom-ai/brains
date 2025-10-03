import type {
  Logger,
  ServicePluginContext,
  ConversationDigestPayload,
} from "@brains/plugins";
import {
  parseMarkdownWithFrontmatter,
  generateMarkdownWithFrontmatter,
} from "@brains/plugins";
import { z } from "@brains/utils";
import { SummaryExtractor } from "../lib/summary-extractor";
import { SummaryAdapter } from "../adapters/summary-adapter";
import type { SummaryEntity, SummaryLogEntry } from "../schemas/summary";

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
    try {
      this.logger.debug("Processing digest for conversation", {
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
            digest.conversationId,
          );
      } catch {
        // Entity doesn't exist yet, that's fine
        this.logger.debug("No existing summary found", {
          conversationId: digest.conversationId,
        });
      }

      // Analyze the digest and decide how to update
      const decision = await this.extractor.analyzeDigest(
        digest,
        existingEntity?.content ?? null,
      );

      // Parse existing entries if we have an existing entity
      let entries: SummaryLogEntry[] = [];
      if (existingEntity?.content) {
        try {
          const parsed = parseMarkdownWithFrontmatter(
            existingEntity.content,
            z.record(z.string(), z.unknown()),
          );
          entries = this.adapter.parseEntriesFromContent(parsed.content);
        } catch {
          // Fallback: parse content without frontmatter
          entries = this.adapter.parseEntriesFromContent(
            existingEntity.content,
          );
        }
      }

      // Apply the decision to update entries
      const shouldUpdate = decision.action === "update";
      const entryIndex =
        decision.action === "update" ? decision.entryIndex : undefined;
      const updatedEntries = this.adapter.manageEntries(
        entries,
        decision.entry,
        shouldUpdate,
        entryIndex,
      );

      // Create the content body (without frontmatter)
      const contentBody = this.adapter.createContentBody(updatedEntries);

      // Fetch conversation to get channel name
      const conversation = await this.context.getConversation(
        digest.conversationId,
      );
      if (!conversation?.metadata) {
        throw new Error(
          `Conversation ${digest.conversationId} not found or missing metadata`,
        );
      }
      const conversationMetadata = JSON.parse(conversation.metadata);
      const { channelName, channelId, interfaceType } = conversationMetadata;

      // Prepare metadata
      const metadata = {
        conversationId: digest.conversationId,
        channelName,
        channelId,
        interfaceType,
        entryCount: updatedEntries.length,
        totalMessages: digest.windowEnd,
      };

      // Create content with frontmatter
      const contentWithFrontmatter = generateMarkdownWithFrontmatter(
        contentBody,
        metadata,
      );

      // Save the updated summary
      const summaryEntity: SummaryEntity = {
        id: digest.conversationId,
        entityType: "summary",
        content: contentWithFrontmatter,
        created: existingEntity?.created ?? digest.timestamp,
        updated: digest.timestamp,
        metadata,
      };

      await this.context.entityService.upsertEntity(summaryEntity);

      this.logger.debug("Summary updated successfully", {
        conversationId: digest.conversationId,
        action: decision.action,
        entryCount: summaryEntity.metadata.entryCount,
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
