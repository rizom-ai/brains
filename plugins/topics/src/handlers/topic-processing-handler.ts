import type { ServicePluginContext } from "@brains/plugins";
import { BaseJobHandler } from "@brains/plugins";
import type { Logger, ProgressReporter } from "@brains/utils";
import { getErrorMessage, z, PROGRESS_STEPS, JobResult } from "@brains/utils";
import { TopicService } from "../lib/topic-service";

// Schema for processing single topic job data
const topicProcessingJobDataSchema = z.object({
  topic: z.object({
    title: z.string(),
    content: z.string(),
    sources: z.array(
      z.object({
        slug: z.string(),
        title: z.string(),
        type: z.string(),
        entityId: z.string(),
        contentHash: z.string(),
      }),
    ),
    keywords: z.array(z.string()),
    relevanceScore: z.number().min(0).max(1),
  }),
  sourceEntityId: z.string(),
  sourceEntityType: z.string(),
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
export class TopicProcessingHandler extends BaseJobHandler<
  "topic-processing",
  TopicProcessingJobData,
  TopicProcessingResult
> {
  private topicService: TopicService;

  constructor(context: ServicePluginContext, logger: Logger) {
    super(logger, {
      schema: topicProcessingJobDataSchema,
      jobTypeName: "topic-processing",
    });
    this.topicService = new TopicService(context.entityService, logger);
  }

  async process(
    data: TopicProcessingJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<TopicProcessingResult> {
    const { topic, autoMerge = false, mergeSimilarityThreshold = 0.85 } = data;

    this.logger.debug("Processing extracted topic", {
      jobId,
      title: topic.title,
      sourceEntityId: data.sourceEntityId,
      sourceEntityType: data.sourceEntityType,
    });

    try {
      await progressReporter.report({
        progress: PROGRESS_STEPS.INIT,
        message: `Checking for similar topics: ${topic.title}`,
      });

      // Check if a similar topic already exists by title and key terms
      // Only merge if extremely similar (95%+ match)
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
          progress: PROGRESS_STEPS.GENERATE,
          message: `Merging with existing topic (similarity: ${Math.round(
            topResult.score * 100,
          )}%)`,
        });

        // Update existing topic instead of creating new
        await this.topicService.updateTopic(topResult.entity.id, {
          sources: topic.sources,
          keywords: topic.keywords,
        });

        this.logger.debug("Merged with existing topic", {
          topicId: topResult.entity.id,
          title: topic.title,
          similarityScore: topResult.score,
        });

        action = "merged";
        topicId = topResult.entity.id;
      } else {
        await progressReporter.report({
          progress: PROGRESS_STEPS.GENERATE,
          message: `Creating new topic: ${topic.title}`,
        });

        // Create new topic
        const created = await this.topicService.createTopic({
          title: topic.title,
          content: topic.content,
          sources: topic.sources,
          keywords: topic.keywords,
        });

        if (!created) {
          throw new Error(`Failed to create topic: ${topic.title}`);
        }

        this.logger.debug("Created new topic", {
          title: topic.title,
          id: created.id,
        });

        action = "created";
        topicId = created.id;
      }

      await progressReporter.report({
        progress: PROGRESS_STEPS.COMPLETE,
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
        error: getErrorMessage(error),
      });

      return {
        ...JobResult.failure(error),
        action: "failed",
        topicTitle: topic.title,
      };
    }
  }

  protected override summarizeDataForLog(
    data: TopicProcessingJobData,
  ): Record<string, unknown> {
    return {
      topicTitle: data.topic.title,
      sourceEntityId: data.sourceEntityId,
      sourceEntityType: data.sourceEntityType,
    };
  }
}
