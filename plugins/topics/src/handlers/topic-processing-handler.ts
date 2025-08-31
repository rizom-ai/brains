import type {
  JobHandler,
  ServicePluginContext,
  ProgressReporter,
  Logger,
} from "@brains/plugins";
import { z } from "@brains/utils";
import { TopicService } from "../lib/topic-service";

// Schema for processing single topic job data
const topicProcessingJobDataSchema = z.object({
  topic: z.object({
    title: z.string(),
    summary: z.string(),
    content: z.string(),
    sources: z.array(z.string()), // TopicSource is just a string
    keywords: z.array(z.string()),
  }),
  conversationId: z.string(),
  autoMerge: z.boolean().optional(),
  mergeSimilarityThreshold: z.number().min(0).max(1).optional(),
});

type TopicProcessingJobData = z.infer<typeof topicProcessingJobDataSchema>;

interface TopicProcessingResult {
  success: boolean;
  action: "created" | "merged" | "failed";
  topicId?: string;
  topicTitle: string;
  message?: string;
  error?: string;
}

/**
 * Job handler for processing individual extracted topics
 * This handler is used by the batch extraction process to handle each topic separately
 */
export class TopicProcessingHandler
  implements JobHandler<string, TopicProcessingJobData, TopicProcessingResult>
{
  private topicService: TopicService;

  constructor(
    context: ServicePluginContext,
    private readonly logger: Logger,
  ) {
    this.topicService = new TopicService(context.entityService, logger);
  }

  async process(
    data: TopicProcessingJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<TopicProcessingResult> {
    const { topic, autoMerge = false, mergeSimilarityThreshold = 0.8 } = data;

    this.logger.info("Processing extracted topic", {
      jobId,
      title: topic.title,
      conversationId: data.conversationId,
    });

    try {
      await progressReporter.report({
        progress: 10,
        message: `Checking for similar topics: ${topic.title}`,
      });

      // Check if a similar topic already exists
      const searchResults = await this.topicService.searchTopics(topic.title);

      let action: "created" | "merged";
      let topicId: string;

      // Check if we should merge with existing topic
      const shouldMerge =
        autoMerge &&
        searchResults.length > 0 &&
        searchResults[0] &&
        searchResults[0].score >= mergeSimilarityThreshold;

      if (shouldMerge && searchResults[0]) {
        const topResult = searchResults[0];
        await progressReporter.report({
          progress: 50,
          message: `Merging with existing topic (similarity: ${Math.round(
            topResult.score * 100,
          )}%)`,
        });

        // Update existing topic instead of creating new
        await this.topicService.updateTopic(topResult.entity.id, {
          sources: topic.sources,
          keywords: topic.keywords,
        });

        this.logger.info("Merged with existing topic", {
          topicId: topResult.entity.id,
          title: topic.title,
          similarityScore: topResult.score,
        });

        action = "merged";
        topicId = topResult.entity.id;
      } else {
        await progressReporter.report({
          progress: 50,
          message: `Creating new topic: ${topic.title}`,
        });

        // Create new topic
        const created = await this.topicService.createTopic({
          title: topic.title,
          summary: topic.summary,
          content: topic.content,
          sources: topic.sources,
          keywords: topic.keywords,
        });

        if (!created) {
          throw new Error(`Failed to create topic: ${topic.title}`);
        }

        this.logger.info("Created new topic", {
          title: topic.title,
          id: created.id,
        });

        action = "created";
        topicId = created.id;
      }

      await progressReporter.report({
        progress: 100,
        message: `Topic ${action}: ${topic.title}`,
      });

      return {
        success: true,
        action,
        topicId,
        topicTitle: topic.title,
        message: `Successfully ${action} topic: ${topic.title}`,
      };
    } catch (error) {
      this.logger.error("Topic processing failed", {
        jobId,
        title: topic.title,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        action: "failed",
        topicTitle: topic.title,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  validateAndParse(data: unknown): TopicProcessingJobData | null {
    const result = topicProcessingJobDataSchema.safeParse(data);
    if (!result.success) {
      this.logger.error("Invalid topic processing job data", {
        error: result.error.format(),
      });
      return null;
    }

    return result.data;
  }
}
