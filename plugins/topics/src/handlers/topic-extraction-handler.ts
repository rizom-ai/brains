import type {
  JobHandler,
  ServicePluginContext,
  ProgressReporter,
  Logger,
} from "@brains/plugins";
import { z } from "zod";
import { TopicExtractor } from "../lib/topic-extractor";
import { TopicService } from "../lib/topic-service";
import type { TopicsPluginConfig } from "../schemas/config";

// Schema for extraction job data
const extractionJobDataSchema = z.object({
  timeWindowHours: z.number().min(1).optional(),
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
  private topicService: TopicService;

  constructor(
    context: ServicePluginContext,
    private readonly config: TopicsPluginConfig,
    private readonly logger: Logger,
  ) {
    this.topicExtractor = new TopicExtractor(context, logger);

    this.topicService = new TopicService(context.entityService, logger);
  }

  async process(
    data: ExtractionJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<ExtractionJobResult> {
    this.logger.info("Starting topic extraction job", { jobId });

    try {
      await progressReporter.report({
        progress: 10,
        message: "Extracting topics from conversations",
      });

      // Extract topics from recent conversations
      const extractedTopics =
        await this.topicExtractor.extractFromConversations(
          data.timeWindowHours ?? this.config.extractionWindowHours ?? 24,
          data.minRelevanceScore ?? this.config.minRelevanceScore ?? 0.5,
        );

      this.logger.info(`Extracted ${extractedTopics.length} topics`);
      await progressReporter.report({
        progress: 30,
        message: `Processing ${extractedTopics.length} topics`,
      });

      // Process each extracted topic
      let processed = 0;
      let mergedCount = 0;
      for (const extractedTopic of extractedTopics) {
        processed++;
        const progress = 30 + (processed / extractedTopics.length) * 60;
        await progressReporter.report({
          progress,
          message: `Processing topic ${processed}/${extractedTopics.length}`,
        });
        // Check if a similar topic already exists
        const searchResults = await this.topicService.searchTopics(
          extractedTopic.title,
        );

        let shouldCreateNew = true;

        if (this.config.autoMerge && searchResults.length > 0) {
          // Check similarity with existing topics
          for (const existingTopic of searchResults) {
            // Simple similarity check based on keywords overlap
            const existingKeywords = new Set(existingTopic.metadata.keywords);
            const commonKeywords = extractedTopic.keywords.filter((k) =>
              existingKeywords.has(k),
            );

            const similarity =
              commonKeywords.length /
              Math.max(
                extractedTopic.keywords.length,
                existingTopic.metadata.keywords.length,
              );

            if (similarity >= (this.config.mergeSimilarityThreshold ?? 0.8)) {
              // Update existing topic instead of creating new
              await this.topicService.updateTopic(existingTopic.id, {
                sources: extractedTopic.sources,
                keywords: [
                  ...new Set([
                    ...existingTopic.metadata.keywords,
                    ...extractedTopic.keywords,
                  ]),
                ],
                relevanceScore: Math.max(
                  existingTopic.metadata.relevanceScore,
                  extractedTopic.relevanceScore,
                ),
              });

              this.logger.info("Updated existing topic", {
                topicId: existingTopic.id,
              });
              shouldCreateNew = false;
              mergedCount++;
              break;
            }
          }
        }

        if (shouldCreateNew) {
          // Create new topic
          await this.topicService.createTopic({
            title: extractedTopic.title,
            summary: extractedTopic.summary,
            content: extractedTopic.content,
            sources: extractedTopic.sources,
            keywords: extractedTopic.keywords,
            relevanceScore: extractedTopic.relevanceScore,
          });

          this.logger.info("Created new topic", {
            title: extractedTopic.title,
          });
        }
      }

      await progressReporter.report({
        progress: 100,
        message: "Topic extraction complete",
      });

      return {
        success: true,
        extractedCount: extractedTopics.length,
        mergedCount: mergedCount,
        message: `Successfully extracted ${extractedTopics.length} topics`,
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
      return null;
    }

    // Apply defaults
    return {
      timeWindowHours:
        result.data.timeWindowHours ?? this.config.extractionWindowHours ?? 24,
      minRelevanceScore:
        result.data.minRelevanceScore ?? this.config.minRelevanceScore ?? 0.5,
    };
  }
}
