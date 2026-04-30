import type {
  EntityPluginContext,
  ConversationDigestPayload,
} from "@brains/plugins";
import type { Logger } from "@brains/utils";
import {
  parseMarkdownWithFrontmatter,
  generateMarkdownWithFrontmatter,
} from "@brains/plugins";
import { getErrorMessage, z } from "@brains/utils";
import { computeContentHash } from "@brains/utils/hash";
import { SummaryExtractor } from "../lib/summary-extractor";
import { SummaryAdapter } from "../adapters/summary-adapter";
import type { SummaryEntity, SummaryLogEntry } from "../schemas/summary";

const conversationMetadataSchema = z
  .object({
    channelName: z.string().optional(),
  })
  .passthrough();

function parseConversationMetadata(
  metadata: string | null,
): z.infer<typeof conversationMetadataSchema> {
  if (!metadata) return {};
  try {
    const parsed: unknown = JSON.parse(metadata);
    const result = conversationMetadataSchema.safeParse(parsed);
    return result.success ? result.data : {};
  } catch {
    return {};
  }
}

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
    context: EntityPluginContext,
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
    context: EntityPluginContext,
    logger: Logger,
  ): DigestHandler {
    return new DigestHandler(context, logger);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(
    private readonly context: EntityPluginContext,
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

      const conversation = await this.context.conversations.get(
        digest.conversationId,
      );
      if (!conversation) {
        throw new Error(`Conversation ${digest.conversationId} not found`);
      }
      const { channelId, interfaceType } = conversation;
      const conversationMetadata = parseConversationMetadata(
        conversation.metadata,
      );
      const channelName = conversationMetadata.channelName ?? channelId;

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
        contentHash: computeContentHash(contentWithFrontmatter),
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
        error: getErrorMessage(error),
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
