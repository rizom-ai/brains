import type {
  JobHandler,
  ServicePluginContext,
  ProgressReporter,
  Logger,
  Message,
} from "@brains/plugins";
import { z } from "@brains/utils";
import { TopicExtractor } from "../lib/topic-extractor";
import { TopicService } from "../lib/topic-service";
import type { TopicsPluginConfig } from "../schemas/config";

// Schema for extraction job data
const extractionJobDataSchema = z.object({
  conversationId: z.string(), // Required - always process one conversation
  startIdx: z.number().min(1).optional(),
  endIdx: z.number().min(1).optional(),
  windowSize: z.number().min(10).max(100).optional(),
  minRelevanceScore: z.number().min(0).max(1).optional(),
});

type ExtractionJobData = z.infer<typeof extractionJobDataSchema>;

interface ExtractionJobResult {
  success: boolean;
  extractedCount: number;
  mergedCount: number;
  message?: string;
  error?: string;
}

/**
 * Job handler for extracting topics from conversations
 */
export class TopicExtractionHandler
  implements JobHandler<string, ExtractionJobData, ExtractionJobResult>
{
  private topicExtractor: TopicExtractor;

  constructor(
    private readonly context: ServicePluginContext,
    private readonly config: TopicsPluginConfig,
    private readonly logger: Logger,
  ) {
    this.topicExtractor = new TopicExtractor(context, logger);
  }

  async process(
    data: ExtractionJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<ExtractionJobResult> {
    // Determine the range to process
    const startIdx = data.startIdx;
    const endIdx = data.endIdx;
    const windowSize = data.windowSize ?? this.config.windowSize ?? 30;

    // If no specific range provided, we'll handle it differently
    let messages: Message[];

    if (!startIdx || !endIdx) {
      // Get the most recent messages using limit
      messages = await this.context.getMessages(data.conversationId, {
        limit: windowSize,
      });

      if (messages.length === 0) {
        return {
          success: true,
          extractedCount: 0,
          mergedCount: 0,
          message: "No messages in conversation",
        };
      }

      // We'll pass these messages directly to the extractor
      // No need to calculate indices
    } else {
      // Get specific range of messages
      messages = await this.context.getMessages(data.conversationId, {
        range: { start: startIdx, end: endIdx },
      });
    }

    this.logger.info("Starting topic extraction job", {
      jobId,
      conversationId: data.conversationId,
      messageCount: messages.length,
    });

    try {
      await progressReporter.report({
        progress: 10,
        message: `Extracting topics from ${messages.length} messages`,
      });

      // Extract topics from messages
      const extractedTopics =
        startIdx && endIdx
          ? await this.topicExtractor.extractFromConversationWindow(
              data.conversationId,
              startIdx,
              endIdx,
              data.minRelevanceScore ?? this.config.minRelevanceScore ?? 0.5,
            )
          : await this.topicExtractor.extractFromMessages(
              data.conversationId,
              messages,
              data.minRelevanceScore ?? this.config.minRelevanceScore ?? 0.5,
            );

      this.logger.info(`Extracted ${extractedTopics.length} topics`);

      if (extractedTopics.length === 0) {
        await progressReporter.report({
          progress: 100,
          message: "No topics found to extract",
        });
        return {
          success: true,
          extractedCount: 0,
          mergedCount: 0,
          message: "No topics found to extract",
        };
      }

      await progressReporter.report({
        progress: 30,
        message: `Processing ${extractedTopics.length} topics`,
      });

      // Process each topic individually (used by system digest events)
      let processed = 0;
      let mergedCount = 0;

      for (const topic of extractedTopics) {
        processed++;
        await progressReporter.report({
          progress: 30 + (processed / extractedTopics.length) * 60,
          message: `Processing topic ${processed}/${extractedTopics.length}`,
        });

        // Process the topic directly
        const topicService = new TopicService(
          this.context.entityService,
          this.logger,
        );
        const searchResults = await topicService.searchTopics(topic.title);

        if (
          this.config.autoMerge &&
          searchResults.length > 0 &&
          searchResults[0] &&
          searchResults[0].score >=
            (this.config.mergeSimilarityThreshold ?? 0.8)
        ) {
          await topicService.updateTopic(searchResults[0].entity.id, {
            sources: topic.sources,
            keywords: topic.keywords,
          });
          mergedCount++;
        } else {
          await topicService.createTopic({
            title: topic.title,
            summary: topic.summary,
            content: topic.content,
            sources: topic.sources,
            keywords: topic.keywords,
          });
        }
      }

      await progressReporter.report({
        progress: 100,
        message: `Completed: ${extractedTopics.length - mergedCount} created, ${mergedCount} merged`,
      });

      return {
        success: true,
        extractedCount: extractedTopics.length,
        mergedCount: 0, // Will be determined by batch processing
        message: `Successfully queued ${extractedTopics.length} topics for processing`,
      };
    } catch (error) {
      this.logger.error("Topic extraction failed", {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error instanceof Error
        ? error
        : new Error("Topic extraction failed");
    }
  }

  validateAndParse(data: unknown): ExtractionJobData | null {
    const result = extractionJobDataSchema.safeParse(data);
    if (!result.success) {
      this.logger.error("Invalid extraction job data", {
        error: result.error.format(),
      });
      return null;
    }

    return result.data;
  }
}
