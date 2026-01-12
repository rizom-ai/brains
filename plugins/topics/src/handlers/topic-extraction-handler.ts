import type { ServicePluginContext, BaseEntity } from "@brains/plugins";
import { BaseJobHandler } from "@brains/plugins";
import type { Logger, ProgressReporter } from "@brains/utils";
import { z, createId, computeContentHash } from "@brains/utils";
import { TopicExtractor } from "../lib/topic-extractor";

// Schema for extraction job data
export const topicExtractionJobDataSchema = z.object({
  entityId: z.string(),
  entityType: z.string(),
  entityContent: z.string(),
  entityMetadata: z.record(z.unknown()),
  entityCreated: z.string(),
  entityUpdated: z.string(),
  minRelevanceScore: z.number().min(0).max(1),
  autoMerge: z.boolean(),
  mergeSimilarityThreshold: z.number().min(0).max(1),
});

export type TopicExtractionJobData = z.infer<
  typeof topicExtractionJobDataSchema
>;

interface TopicExtractionResult {
  success: boolean;
  topicsExtracted: number;
  batchId?: string;
  error?: string;
}

/**
 * Job handler for extracting topics from an entity using AI
 * This runs asynchronously so it doesn't block entity creation
 */
export class TopicExtractionHandler extends BaseJobHandler<
  "topic-extraction",
  TopicExtractionJobData,
  TopicExtractionResult
> {
  private topicExtractor: TopicExtractor;
  private readonly context: ServicePluginContext;

  constructor(context: ServicePluginContext, logger: Logger) {
    super(logger, {
      schema: topicExtractionJobDataSchema,
      jobTypeName: "topic-extraction",
    });
    this.context = context;
    this.topicExtractor = new TopicExtractor(context, logger);
  }

  async process(
    data: TopicExtractionJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<TopicExtractionResult> {
    const {
      entityId,
      entityType,
      entityContent,
      entityMetadata,
      entityCreated,
      entityUpdated,
      minRelevanceScore,
      autoMerge,
      mergeSimilarityThreshold,
    } = data;

    this.logger.debug("Starting topic extraction job", {
      jobId,
      entityId,
      entityType,
      contentLength: entityContent.length,
    });

    try {
      await progressReporter.report({
        progress: 10,
        message: `Extracting topics from ${entityType}: ${entityId}`,
      });

      // Reconstruct entity for extraction
      const entity: BaseEntity = {
        id: entityId,
        entityType,
        content: entityContent,
        contentHash: computeContentHash(entityContent),
        metadata: entityMetadata,
        created: entityCreated,
        updated: entityUpdated,
      };

      // Extract topics using AI (this is the slow part that was blocking)
      const extractedTopics = await this.topicExtractor.extractFromEntity(
        entity,
        minRelevanceScore,
      );

      await progressReporter.report({
        progress: 60,
        message: `Extracted ${extractedTopics.length} topics`,
      });

      if (extractedTopics.length === 0) {
        this.logger.debug("No topics found in entity", {
          entityId,
          entityType,
        });

        await progressReporter.report({
          progress: 100,
          message: "No topics found",
        });

        return {
          success: true,
          topicsExtracted: 0,
        };
      }

      // Queue batch of topic processing jobs
      const operations = extractedTopics.map((topic) => ({
        type: "topics:process-single",
        data: {
          topic,
          sourceEntityId: entityId,
          sourceEntityType: entityType,
          autoMerge,
          mergeSimilarityThreshold,
        },
        metadata: {
          operationType: "data_processing" as const,
          operationTarget: topic.title,
        },
      }));

      const rootJobId = createId();
      const batchId = await this.context.jobs.enqueueBatch(operations, {
        priority: 5, // Low priority - background processing
        source: "topics-plugin",
        rootJobId,
        metadata: {
          operationType: "batch_processing" as const,
          operationTarget: `process topics for ${entityType}:${entityId}`,
          pluginId: "topics",
        },
      });

      await progressReporter.report({
        progress: 100,
        message: `Queued ${extractedTopics.length} topics for processing`,
      });

      this.logger.debug("Queued topic processing batch", {
        batchId,
        entityId,
        entityType,
        topicsExtracted: extractedTopics.length,
      });

      return {
        success: true,
        topicsExtracted: extractedTopics.length,
        batchId,
      };
    } catch (error) {
      this.logger.error("Topic extraction job failed", {
        jobId,
        entityId,
        entityType,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        topicsExtracted: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  protected override summarizeDataForLog(
    data: TopicExtractionJobData,
  ): Record<string, unknown> {
    return {
      entityId: data.entityId,
      entityType: data.entityType,
      contentLength: data.entityContent.length,
    };
  }
}
