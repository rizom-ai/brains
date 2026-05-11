import type { EntityPluginContext, Message } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { getErrorMessage } from "@brains/utils";
import { SUMMARY_AI_TEMPLATE_NAME } from "./constants";
import { buildSummaryExtractionPrompt } from "./summary-prompt";
import type {
  SummaryConfig,
  SummaryEntry,
  SummaryTimeRange,
} from "../schemas/summary";
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

export interface ExtractedConversationMemoryItem {
  text: string;
  timeRange: SummaryTimeRange;
  sourceMessageCount: number;
}

export interface SummaryExtraction {
  entries: SummaryEntry[];
  decisions: ExtractedConversationMemoryItem[];
  actionItems: ExtractedConversationMemoryItem[];
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

  public async extract(messages: Message[]): Promise<SummaryExtraction> {
    if (messages.length === 0) {
      return { entries: [], decisions: [], actionItems: [] };
    }

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

      const extractedEntries = result.entries.slice(0, this.config.maxEntries);
      const entries = extractedEntries
        .map((entry) => this.toSummaryEntry(entry, messages))
        .filter((entry): entry is SummaryEntry => entry !== null);

      return {
        entries: this.withSystemConstraints(entries, messages),
        decisions: this.toMemoryItems(extractedEntries, messages, "decisions"),
        actionItems: this.toMemoryItems(
          extractedEntries,
          messages,
          "actionItems",
        ),
      };
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
    };
  }

  private toMemoryItems(
    entries: ExtractedSummaryEntry[],
    messages: Message[],
    field: "decisions" | "actionItems",
  ): ExtractedConversationMemoryItem[] {
    return entries.flatMap((entry) => {
      const timeRange = this.getEntryTimeRange(entry, messages);
      if (!timeRange) return [];
      const sourceMessageCount =
        Math.min(messages.length, entry.endMessageIndex) -
        Math.max(1, entry.startMessageIndex) +
        1;
      return entry[field]
        .map((text) => text.trim())
        .filter((text) => this.isValidMemoryItemText(text, field))
        .map((text) => ({
          text,
          timeRange,
          sourceMessageCount: Math.max(0, sourceMessageCount),
        }));
    });
  }

  private isValidMemoryItemText(
    text: string,
    field: "decisions" | "actionItems",
  ): boolean {
    if (!/[\p{L}\p{N}]/u.test(text)) return false;
    if (field === "actionItems") {
      return !/\b(no specific task|no specific action|no substantive topic|no durable topic)\b/i.test(
        text,
      );
    }
    return true;
  }

  private getEntryTimeRange(
    entry: ExtractedSummaryEntry,
    messages: Message[],
  ): SummaryTimeRange | null {
    const startIndex = Math.max(1, entry.startMessageIndex);
    const endIndex = Math.min(messages.length, entry.endMessageIndex);
    if (endIndex < startIndex) return null;

    const startMessage = messages[startIndex - 1];
    const endMessage = messages[endIndex - 1];
    if (!startMessage || !endMessage) return null;

    return {
      start: startMessage.timestamp,
      end: endMessage.timestamp,
    };
  }
}
