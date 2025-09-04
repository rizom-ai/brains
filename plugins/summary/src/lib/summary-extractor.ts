import type {
  Logger,
  ServicePluginContext,
  ConversationDigestPayload,
} from "@brains/plugins";
import type { SummaryLogEntry } from "../schemas/summary";
import { SummaryAdapter } from "../adapters/summary-adapter";
import { z } from "@brains/utils";

/**
 * Simple schema for AI response
 */
const aiResponseSchema = z.object({
  action: z.enum(["update", "new"]),
  index: z.number().optional(),
  title: z.string(),
  summary: z.string(),
});

type AiResponse = z.infer<typeof aiResponseSchema>;

/**
 * Decision on how to handle a new digest
 */
export type DigestDecision =
  | { action: "create"; entry: SummaryLogEntry }
  | { action: "update"; entryIndex: number; entry: SummaryLogEntry }
  | { action: "append"; entry: SummaryLogEntry };

/**
 * Service for extracting summaries from conversation digests using AI
 * Simplified to use a single AI call for both decision and content
 */
export class SummaryExtractor {
  private static instance: SummaryExtractor | null = null;
  private adapter: SummaryAdapter;

  /**
   * Get singleton instance
   */
  public static getInstance(
    context: ServicePluginContext,
    logger: Logger,
  ): SummaryExtractor {
    SummaryExtractor.instance ??= new SummaryExtractor(context, logger);
    return SummaryExtractor.instance;
  }

  /**
   * Reset singleton instance (for testing)
   */
  public static resetInstance(): void {
    SummaryExtractor.instance = null;
  }

  /**
   * Create fresh instance (for testing)
   */
  public static createFresh(
    context: ServicePluginContext,
    logger: Logger,
  ): SummaryExtractor {
    return new SummaryExtractor(context, logger);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(
    private readonly context: ServicePluginContext,
    private readonly logger: Logger,
  ) {
    this.adapter = new SummaryAdapter();
  }

  /**
   * Analyze digest and create/update summary with a single AI call
   */
  public async analyzeDigest(
    digest: ConversationDigestPayload,
    existingContent: string | null,
  ): Promise<DigestDecision> {
    this.logger.info("Analyzing digest for conversation", {
      conversationId: digest.conversationId,
      messageCount: digest.messageCount,
      windowSize: digest.windowSize,
    });

    // Get the last 3 entries if they exist
    const recentEntries = existingContent
      ? this.adapter.getRecentEntries(existingContent, 3)
      : [];

    // Format recent entries for context
    const recentContext =
      recentEntries.length > 0
        ? `Recent summary entries (newest first):
${recentEntries
  .map((e, i) => `${i + 1}. [${e.created}] ${e.title}\n   ${e.content}`)
  .join("\n\n")}`
        : "No existing summaries for this conversation.";

    // Format messages for AI
    const messagesText = digest.messages
      .map((m) => `[${m.role}]: ${m.content}`)
      .join("\n");

    // Single AI prompt for both decision and content generation
    const prompt = `Analyze this conversation digest and create or update a summary entry.

${recentContext}

New messages (${digest.windowStart} to ${digest.windowEnd}):
${messagesText}

Instructions:
1. Determine if this continues an existing topic or is a new topic
2. If it continues the most recent topic, set action to "update" with index 0
3. If it's a new topic, set action to "new"
4. Write a natural summary paragraph that includes key points, decisions, and action items as appropriate

Respond with a JSON object with these fields:
- action: "update" or "new"
- index: 0 if updating most recent (omit for new)
- title: Brief topic description
- summary: Natural paragraph summarizing the conversation`;

    try {
      const response = await this.context.generateContent<AiResponse>({
        prompt,
        templateName: "summary:ai-response",
        data: {
          schema: aiResponseSchema,
        },
      });

      const now = new Date().toISOString();
      const entry: SummaryLogEntry = {
        title: response.title,
        content: response.summary,
        created: now,
        updated: now,
      };

      // Return the appropriate decision based on AI response
      if (
        response.action === "update" &&
        response.index === 0 &&
        recentEntries.length > 0
      ) {
        return { action: "update", entryIndex: 0, entry };
      }

      // Default to creating/appending a new entry
      return existingContent
        ? { action: "append", entry }
        : { action: "create", entry };
    } catch (error) {
      this.logger.error("Failed to generate summary", {
        error: error instanceof Error ? error.message : String(error),
      });

      // Fallback: create a basic entry
      const now = new Date().toISOString();
      const entry: SummaryLogEntry = {
        title: `Messages ${digest.windowStart}-${digest.windowEnd}`,
        content: `Conversation from messages ${digest.windowStart} to ${digest.windowEnd}. ${digest.messages.length} messages exchanged.`,
        created: now,
        updated: now,
      };

      return existingContent
        ? { action: "append", entry }
        : { action: "create", entry };
    }
  }
}
