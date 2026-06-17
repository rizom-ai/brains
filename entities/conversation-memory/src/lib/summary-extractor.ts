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

export class SummaryExtractor {
  private readonly context: EntityPluginContext;
  private readonly logger: Logger;
  private readonly config: SummaryConfig;
  constructor(
    context: EntityPluginContext,
    logger: Logger,
    config: SummaryConfig,
  ) {
    this.context = context;
    this.logger = logger;
    this.config = config;
  }

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
        entries,
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
