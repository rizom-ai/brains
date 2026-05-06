import type { EntityPluginContext, Message } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { getErrorMessage } from "@brains/utils";
import { SUMMARY_AI_TEMPLATE_NAME } from "./constants";
import { buildSummaryExtractionPrompt } from "./summary-prompt";
import type { SummaryConfig, SummaryEntry } from "../schemas/summary";
import {
  summaryExtractionResultSchema,
  type ExtractedSummaryEntry,
} from "../schemas/extraction";

function tokenizeConstraint(value: string): string[] {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 5 && token !== "constraint"),
    ),
  );
}

function entryMentionsConstraint(
  entry: SummaryEntry,
  constraint: string,
): boolean {
  const tokens = tokenizeConstraint(constraint);
  if (tokens.length === 0) return false;

  const entryText = [entry.summary, ...entry.keyPoints].join(" ").toLowerCase();
  const matched = tokens.filter((token) => entryText.includes(token)).length;
  return matched >= Math.min(3, tokens.length);
}

export class SummaryExtractor {
  constructor(
    private readonly context: EntityPluginContext,
    private readonly logger: Logger,
    private readonly config: SummaryConfig,
  ) {}

  public async extract(messages: Message[]): Promise<SummaryEntry[]> {
    if (messages.length === 0) return [];

    const prompt = buildSummaryExtractionPrompt({
      messages,
      config: this.config,
    });

    try {
      const raw = await this.context.ai.generate<unknown>({
        prompt,
        templateName: SUMMARY_AI_TEMPLATE_NAME,
        data: { schema: summaryExtractionResultSchema },
      });
      const result = summaryExtractionResultSchema.parse(raw);

      const entries = result.entries
        .slice(0, this.config.maxEntries)
        .map((entry) => this.toSummaryEntry(entry, messages))
        .filter((entry): entry is SummaryEntry => entry !== null);

      return this.withSystemConstraints(entries, messages);
    } catch (error) {
      this.logger.error("Summary extraction failed", {
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  private withSystemConstraints(
    entries: SummaryEntry[],
    messages: Message[],
  ): SummaryEntry[] {
    if (!this.config.includeKeyPoints) return entries;

    const constraints = messages
      .filter((message) => message.role === "system")
      .map((message) => {
        const match = message.content.match(/^\s*constraint:\s*(.+)$/i);
        if (!match?.[1]) return null;
        return {
          text: `Constraint: ${match[1].trim()}`,
          timestamp: message.timestamp,
        };
      })
      .filter(
        (constraint): constraint is { text: string; timestamp: string } =>
          constraint !== null,
      );

    if (constraints.length === 0) return entries;

    const firstConstraint = constraints[0];
    if (!firstConstraint) return entries;

    if (entries.length === 0) {
      return [
        {
          title: "Conversation constraints",
          summary: constraints.map((constraint) => constraint.text).join(" "),
          timeRange: {
            start: firstConstraint.timestamp,
            end:
              constraints[constraints.length - 1]?.timestamp ??
              firstConstraint.timestamp,
          },
          sourceMessageCount: constraints.length,
          keyPoints: constraints.map((constraint) => constraint.text),
          decisions: [],
          actionItems: [],
        },
      ];
    }

    const [firstEntry, ...rest] = entries;
    if (!firstEntry) return entries;

    const missingConstraints = constraints.filter(
      (constraint) => !entryMentionsConstraint(firstEntry, constraint.text),
    );
    if (missingConstraints.length === 0) return entries;

    return [
      {
        ...firstEntry,
        timeRange: {
          start:
            firstConstraint.timestamp < firstEntry.timeRange.start
              ? firstConstraint.timestamp
              : firstEntry.timeRange.start,
          end: firstEntry.timeRange.end,
        },
        sourceMessageCount:
          firstEntry.sourceMessageCount + missingConstraints.length,
        keyPoints: [
          ...missingConstraints.map((constraint) => constraint.text),
          ...firstEntry.keyPoints,
        ],
      },
      ...rest,
    ];
  }

  private toSummaryEntry(
    entry: ExtractedSummaryEntry,
    messages: Message[],
  ): SummaryEntry | null {
    const startIndex = Math.max(1, entry.startMessageIndex);
    const endIndex = Math.min(messages.length, entry.endMessageIndex);
    if (endIndex < startIndex) return null;

    const startMessage = messages[startIndex - 1];
    const endMessage = messages[endIndex - 1];
    if (!startMessage || !endMessage) return null;

    return {
      title: entry.title,
      summary: entry.summary,
      timeRange: {
        start: startMessage.timestamp,
        end: endMessage.timestamp,
      },
      sourceMessageCount: endIndex - startIndex + 1,
      keyPoints: this.config.includeKeyPoints ? entry.keyPoints : [],
      decisions: this.config.includeDecisions ? entry.decisions : [],
      actionItems: this.config.includeActionItems ? entry.actionItems : [],
    };
  }
}
