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

      return result.entries
        .slice(0, this.config.maxEntries)
        .map((entry) => this.toSummaryEntry(entry, messages))
        .filter((entry): entry is SummaryEntry => entry !== null);
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
      decisions: this.config.includeDecisions ? entry.decisions : [],
      actionItems: this.config.includeActionItems ? entry.actionItems : [],
    };
  }
}
