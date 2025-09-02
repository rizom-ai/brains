import type {
  Logger,
  ServicePluginContext,
  ConversationDigestPayload,
} from "@brains/plugins";
import type {
  SummaryLogEntry,
  AiDecisionResult,
  AiSummaryResult,
} from "../schemas/summary";
import { SummaryAdapter } from "../adapters/summary-adapter";

/**
 * Decision on how to handle a new digest
 */
export type DigestDecision =
  | { action: "create"; entry: SummaryLogEntry }
  | { action: "update"; entryIndex: number; entry: SummaryLogEntry }
  | { action: "append"; entry: SummaryLogEntry };

/**
 * Service for extracting summaries from conversation digests using AI
 */
export class SummaryExtractor {
  private adapter: SummaryAdapter;

  constructor(
    private readonly context: ServicePluginContext,
    private readonly logger: Logger,
  ) {
    this.adapter = new SummaryAdapter();
  }

  /**
   * Analyze digest and existing summary to decide how to update
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

    // Prepare the messages for AI analysis
    const messagesText = digest.messages
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n\n");

    // Prepare recent summaries for context
    const recentSummariesText = recentEntries
      .map((e, i) => `Entry ${i + 1} (${e.title}):\n${e.content}`)
      .join("\n\n---\n\n");

    try {
      // First, analyze if we should update an existing entry or create new
      const decisionPrompt = `You are analyzing a conversation to create or update a summary log.

${
  recentEntries.length > 0
    ? `Recent summary entries (newest first):
${recentSummariesText}

`
    : ""
}New messages (${digest.windowStart}-${digest.windowEnd}):
${messagesText}

Analyze the new messages and determine:
1. Do they continue discussing the same topic as any of the recent entries?
2. Or do they represent a new topic/phase of conversation?

If continuing an existing topic, specify which entry index (0 = most recent).
If new topic, suggest a title for the new entry.

Return JSON with:
{
  "decision": "update" or "new",
  "entryIndex": (number, only if decision is "update"),
  "title": "Brief topic title",
  "reasoning": "Why you made this decision"
}`;

      const decisionResult =
        await this.context.generateContent<AiDecisionResult>({
          templateName: "digest-decision",
          prompt: decisionPrompt,
          conversationHistory: digest.conversationId,
        });

      this.logger.debug("AI decision", decisionResult);

      // Now generate the actual summary content
      const summaryPrompt = `Create a ${decisionResult.decision === "update" ? "continuation summary" : "new summary"} for these messages.

Messages (${digest.windowStart}-${digest.windowEnd}):
${messagesText}

${
  decisionResult.decision === "update" &&
  decisionResult.entryIndex !== undefined &&
  decisionResult.entryIndex >= 0 &&
  decisionResult.entryIndex < recentEntries.length
    ? `Existing summary to update:
${recentEntries[decisionResult.entryIndex]?.content ?? ""}`
    : ""
}

Provide a concise chronological summary (2-3 paragraphs) that:
- Captures the main discussion points
- Notes any decisions made
- Identifies action items
- Maintains narrative flow

Also extract:
- Key points (as array of strings)
- Decisions (as array of strings, if any)
- Action items (as array of strings, if any)
- Active participants (as array of unique names)

Return JSON with:
{
  "content": "The summary text",
  "keyPoints": ["point1", "point2"],
  "decisions": ["decision1"],
  "actionItems": ["action1"],
  "participants": ["name1", "name2"]
}`;

      const summaryResult = await this.context.generateContent<AiSummaryResult>(
        {
          templateName: "summary-content",
          prompt: summaryPrompt,
          conversationHistory: digest.conversationId,
        },
      );

      // Create the log entry
      const entry: SummaryLogEntry = {
        title: decisionResult.title,
        content: summaryResult.content,
        created: digest.timestamp,
        updated: digest.timestamp,
        windowStart: digest.windowStart,
        windowEnd: digest.windowEnd,
        keyPoints: summaryResult.keyPoints,
        decisions: summaryResult.decisions,
        actionItems: summaryResult.actionItems,
        participants: summaryResult.participants,
      };

      // Return the decision
      if (!existingContent) {
        return { action: "create", entry };
      } else if (
        decisionResult.decision === "update" &&
        decisionResult.entryIndex !== undefined &&
        decisionResult.entryIndex >= 0
      ) {
        return {
          action: "update",
          entryIndex: decisionResult.entryIndex,
          entry,
        };
      } else {
        return { action: "append", entry };
      }
    } catch (error) {
      this.logger.error("Failed to analyze digest", {
        conversationId: digest.conversationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Apply the decision to create or update the summary
   */
  public applyDecision(
    decision: DigestDecision,
    existingContent: string | null,
    conversationId: string,
  ): string {
    switch (decision.action) {
      case "create":
        return this.adapter.addOrUpdateEntry(
          null,
          decision.entry,
          conversationId,
          false,
        );

      case "update":
        return this.adapter.addOrUpdateEntry(
          existingContent,
          decision.entry,
          conversationId,
          true,
          decision.entryIndex,
        );

      case "append":
        return this.adapter.addOrUpdateEntry(
          existingContent,
          decision.entry,
          conversationId,
          false,
        );
    }
  }
}
