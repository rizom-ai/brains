import type { EntityPluginContext } from "@brains/plugins";
import { BaseJobHandler } from "@brains/plugins";
import type { Logger, ProgressReporter } from "@brains/utils";
import { getErrorMessage, z, PROGRESS_STEPS, JobResult } from "@brains/utils";
import {
  TopicMergeSynthesizer,
  type ITopicMergeSynthesizer,
} from "../lib/topic-merge-synthesizer";
import { TopicService } from "../lib/topic-service";
import { TopicIndex } from "../lib/topic-index";

const extractedTopicSchema = z.object({
  title: z.string(),
  content: z.string(),
  relevanceScore: z.number().min(0).max(1),
});

export const topicProcessingBatchJobDataSchema = z.object({
  topics: z.array(extractedTopicSchema),
  sourceEntityId: z.string(),
  sourceEntityType: z.string(),
  autoMerge: z.boolean().optional(),
  mergeSimilarityThreshold: z.number().min(0).max(1).optional(),
});

export type TopicProcessingBatchJobData = z.infer<
  typeof topicProcessingBatchJobDataSchema
>;

interface TopicProcessingBatchResult {
  success: boolean;
  created: number;
  merged: number;
  skipped: number;
  failed: number;
  error?: string;
}

/**
 * Job handler for processing a batch of extracted topics.
 *
 * It preloads existing topics once, then keeps an in-memory index in sync as
 * topics are created or merged so later topics in the same batch can see
 * earlier mutations without re-listing all topics.
 */
export class TopicProcessingBatchHandler extends BaseJobHandler<
  "topic-processing-batch",
  TopicProcessingBatchJobData,
  TopicProcessingBatchResult
> {
  private readonly topicService: TopicService;
  private readonly topicMergeSynthesizer: ITopicMergeSynthesizer;

  constructor(
    context: EntityPluginContext,
    logger: Logger,
    topicMergeSynthesizer?: ITopicMergeSynthesizer,
  ) {
    super(logger, {
      schema: topicProcessingBatchJobDataSchema,
      jobTypeName: "topic-processing-batch",
    });
    this.topicService = new TopicService(context.entityService, logger);
    this.topicMergeSynthesizer =
      topicMergeSynthesizer ?? new TopicMergeSynthesizer(context, logger);
  }

  async process(
    data: TopicProcessingBatchJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<TopicProcessingBatchResult> {
    const { topics, autoMerge = false, mergeSimilarityThreshold = 0.85 } = data;

    this.logger.debug("Processing extracted topic batch", {
      jobId,
      sourceEntityId: data.sourceEntityId,
      sourceEntityType: data.sourceEntityType,
      topicCount: topics.length,
    });

    try {
      await progressReporter.report({
        progress: PROGRESS_STEPS.GENERATE,
        message: `Processing ${topics.length} extracted topics`,
      });

      const topicIndex = await TopicIndex.create(this.topicService);
      let created = 0;
      let merged = 0;
      let skipped = 0;
      let failed = 0;

      for (const topic of topics) {
        try {
          if (autoMerge) {
            const candidate = topicIndex.findMergeCandidate(
              topic,
              mergeSimilarityThreshold,
            );

            if (candidate) {
              const synthesized = await this.topicMergeSynthesizer.synthesize({
                existingTopic: candidate.topic,
                incomingTopic: topic,
              });

              const mergedTitle = candidate.title;
              const mergedTopic = await this.topicService.applySynthesizedMerge(
                {
                  existingId: candidate.topic.id,
                  synthesized: {
                    ...synthesized,
                    title: mergedTitle,
                  },
                  aliasCandidates: [topic.title],
                },
              );

              if (!mergedTopic) {
                throw new Error(`Failed to merge topic: ${topic.title}`);
              }

              topicIndex.set(mergedTopic);
              merged++;
              continue;
            }
          }

          if (topicIndex.hasSlug(topic.title)) {
            skipped++;
            continue;
          }

          const createResult = await this.topicService.createTopicOptimistic({
            title: topic.title,
            content: topic.content,
          });

          if (!createResult.topic) {
            throw new Error(`Failed to create topic: ${topic.title}`);
          }

          topicIndex.set(createResult.topic);
          if (createResult.created) {
            created++;
          } else {
            skipped++;
          }
        } catch (error) {
          failed++;
          this.logger.error("Topic batch item failed", {
            jobId,
            title: topic.title,
            error: getErrorMessage(error),
          });
        }
      }

      await progressReporter.report({
        progress: PROGRESS_STEPS.COMPLETE,
        message: `Processed ${topics.length} extracted topics`,
      });

      return {
        success: failed === 0,
        created,
        merged,
        skipped,
        failed,
      };
    } catch (error) {
      this.logger.error("Topic batch processing failed", {
        jobId,
        sourceEntityId: data.sourceEntityId,
        sourceEntityType: data.sourceEntityType,
        error: getErrorMessage(error),
      });

      return {
        ...JobResult.failure(error),
        created: 0,
        merged: 0,
        skipped: 0,
        failed: topics.length,
      };
    }
  }

  protected override summarizeDataForLog(
    data: TopicProcessingBatchJobData,
  ): Record<string, unknown> {
    return {
      topicCount: data.topics.length,
      sourceEntityId: data.sourceEntityId,
      sourceEntityType: data.sourceEntityType,
    };
  }
}
