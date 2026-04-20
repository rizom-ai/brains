import type { EntityPluginContext } from "@brains/plugins";
import { BaseJobHandler } from "@brains/plugins";
import type { Logger, ProgressReporter } from "@brains/utils";
import { getErrorMessage, z, PROGRESS_STEPS, JobResult } from "@brains/utils";
import {
  TopicMergeSynthesizer,
  type ITopicMergeSynthesizer,
} from "../lib/topic-merge-synthesizer";
import { TopicService } from "../lib/topic-service";

const topicProcessingJobDataSchema = z.object({
  topic: z.object({
    title: z.string(),
    content: z.string(),
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
  action: "created" | "merged" | "skipped" | "failed";
  topicId?: string;
  topicTitle: string;
  message?: string;
  error?: string;
}

/**
 * Job handler for processing individual extracted topics.
 * Creates topic entities by slug — skips if topic already exists (preserves user edits).
 */
export class TopicProcessingHandler extends BaseJobHandler<
  "topic-processing",
  TopicProcessingJobData,
  TopicProcessingResult
> {
  private topicService: TopicService;
  private topicMergeSynthesizer: ITopicMergeSynthesizer;

  constructor(
    context: EntityPluginContext,
    logger: Logger,
    topicMergeSynthesizer?: ITopicMergeSynthesizer,
  ) {
    super(logger, {
      schema: topicProcessingJobDataSchema,
      jobTypeName: "topic-processing",
    });
    this.topicService = new TopicService(context.entityService, logger);
    this.topicMergeSynthesizer =
      topicMergeSynthesizer ?? new TopicMergeSynthesizer(context, logger);
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
        progress: PROGRESS_STEPS.GENERATE,
        message: `Creating topic: ${topic.title}`,
      });

      if (autoMerge) {
        const candidate = await this.topicService.findMergeCandidate(
          topic,
          mergeSimilarityThreshold,
        );

        if (candidate) {
          const synthesized = await this.topicMergeSynthesizer.synthesize({
            existingTopic: candidate.topic,
            incomingTopic: topic,
          });

          const merged = await this.topicService.applySynthesizedMerge({
            existingId: candidate.topic.id,
            synthesized,
            aliasCandidates: [candidate.title, topic.title],
          });

          if (!merged) {
            throw new Error(`Failed to merge topic: ${topic.title}`);
          }

          await progressReporter.report({
            progress: PROGRESS_STEPS.COMPLETE,
            message: `Topic merged into: ${synthesized.title}`,
          });

          return {
            success: true,
            action: "merged",
            topicId: merged.id,
            topicTitle: synthesized.title,
            message: `Successfully merged topic into: ${synthesized.title}`,
          };
        }
      }

      // createTopic skips if topic with same slug already exists
      const created = await this.topicService.createTopic({
        title: topic.title,
        content: topic.content,
      });

      if (!created) {
        throw new Error(`Failed to create topic: ${topic.title}`);
      }

      await progressReporter.report({
        progress: PROGRESS_STEPS.COMPLETE,
        message: `Topic created: ${topic.title}`,
      });

      return {
        success: true,
        action: "created",
        topicId: created.id,
        topicTitle: topic.title,
        message: `Successfully created topic: ${topic.title}`,
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
