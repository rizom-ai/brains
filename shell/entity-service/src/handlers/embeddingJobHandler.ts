import { z } from "@brains/utils";
import type {
  EntityService as IEntityService,
  EmbeddingJobData,
} from "../types";
import type { IEmbeddingService } from "@brains/embedding-service";
import { Logger } from "@brains/utils";
import type { JobHandler } from "@brains/job-queue";
import type { ProgressReporter } from "@brains/utils";
import type { MessageBus } from "@brains/messaging-service";

/**
 * Zod schema for embedding job data validation
 * Content is NOT in job data - fetched fresh from entity when processing
 */
const embeddingJobDataSchema = z.object({
  id: z.string().min(1, "Entity ID is required"),
  entityType: z.string().min(1, "Entity type is required"),
  contentHash: z.string().min(1, "Content hash is required"),
  operation: z.enum(["create", "update"]),
});

/**
 * Job handler for embedding generation
 * Processes entities to generate embeddings using the EmbeddingService
 * Implements Component Interface Standardization pattern
 */
export class EmbeddingJobHandler implements JobHandler<"embedding"> {
  private static instance: EmbeddingJobHandler | null = null;
  private logger: Logger;
  private embeddingService: IEmbeddingService;
  private entityService: IEntityService;
  private messageBus?: MessageBus;

  /**
   * Get the singleton instance
   */
  public static getInstance(
    entityService: IEntityService,
    embeddingService: IEmbeddingService,
    messageBus?: MessageBus,
  ): EmbeddingJobHandler {
    EmbeddingJobHandler.instance ??= new EmbeddingJobHandler(
      entityService,
      embeddingService,
      messageBus,
    );
    return EmbeddingJobHandler.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    EmbeddingJobHandler.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(
    entityService: IEntityService,
    embeddingService: IEmbeddingService,
    messageBus?: MessageBus,
  ): EmbeddingJobHandler {
    return new EmbeddingJobHandler(entityService, embeddingService, messageBus);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(
    entityService: IEntityService,
    embeddingService: IEmbeddingService,
    messageBus?: MessageBus,
  ) {
    this.logger = Logger.getInstance().child("EmbeddingJobHandler");
    this.embeddingService = embeddingService;
    this.entityService = entityService;
    if (messageBus) {
      this.messageBus = messageBus;
    }
  }

  /**
   * Process an embedding job
   * Generates embedding for entity content and stores it in the embeddings table
   * Entity must already exist in entities table (stored immediately by createEntity/updateEntity)
   */
  public async process(
    data: EmbeddingJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<void> {
    try {
      this.logger.debug("Processing embedding job", {
        jobId,
        entityId: data.id,
        entityType: data.entityType,
        contentHash: data.contentHash,
      });

      // Report initial progress
      await progressReporter.report({
        progress: 0,
        total: 2,
        message: `Generating embedding for ${data.entityType} ${data.id}`,
      });

      // Fetch fresh entity - content is NOT stored in job data to avoid
      // large base64 data bloating job queue and dashboard hydration props
      const currentEntity = await this.entityService.getEntity(
        data.entityType,
        data.id,
      );

      if (!currentEntity) {
        this.logger.warn("Entity no longer exists, skipping embedding job", {
          jobId,
          entityId: data.id,
          entityType: data.entityType,
          operation: data.operation,
        });
        return;
      }

      // Check if content has changed since job was queued (staleness detection)
      if (currentEntity.contentHash !== data.contentHash) {
        this.logger.info(
          "Entity content changed since job created, skipping stale embedding",
          {
            jobId,
            entityId: data.id,
            entityType: data.entityType,
            jobContentHash: data.contentHash,
            currentContentHash: currentEntity.contentHash,
          },
        );
        return;
      }

      // Generate embedding using fresh content from entity
      const embedding = await this.embeddingService.generateEmbedding(
        currentEntity.content,
      );

      // Report progress after embedding generation
      await progressReporter.report({
        progress: 1,
        total: 2,
        message: `Storing embedding for ${data.entityType} ${data.id}`,
      });

      // Store the embedding in the embeddings table
      await this.entityService.storeEmbedding({
        entityId: data.id,
        entityType: data.entityType,
        embedding,
        contentHash: data.contentHash,
      });

      // Emit entity:embedding:ready event after successful save
      // Note: entity:created is now emitted by createEntity() when entity is first persisted
      if (this.messageBus) {
        this.logger.debug(
          `Emitting entity:embedding:ready event for ${data.entityType}:${data.id}`,
        );

        await this.messageBus.send(
          "entity:embedding:ready",
          {
            entityType: data.entityType,
            entityId: data.id,
            entity: currentEntity,
          },
          "entity-service",
          undefined,
          undefined,
          true, // broadcast
        );
      }

      // Report completion
      await progressReporter.report({
        progress: 2,
        total: 2,
        message: `Completed embedding for ${data.entityType} ${data.id}`,
      });

      this.logger.debug("Embedding job completed successfully", {
        jobId,
        entityId: data.id,
        embeddingDimensions: embedding.length,
      });
    } catch (error) {
      this.logger.error("Embedding job failed", {
        jobId,
        entityId: data.id,
        entityType: data.entityType,
        error,
      });
      throw error;
    }
  }

  /**
   * Handle embedding job errors
   * Provides additional logging and context for debugging
   */
  public async onError(
    error: Error,
    data: EmbeddingJobData,
    jobId: string,
  ): Promise<void> {
    this.logger.error("Embedding job error handler called", {
      jobId,
      entityId: data.id,
      entityType: data.entityType,
      contentHash: data.contentHash,
      errorMessage: error.message,
      errorStack: error.stack,
    });

    // Could add additional error handling here:
    // - Mark entity as failed in database
    // - Send alerts for critical entities
    // - Retry with different embedding service
    // - Store error details for analysis
  }

  /**
   * Validate and parse embedding job data using Zod schema
   * Ensures type safety and data integrity
   */
  public validateAndParse(data: unknown): EmbeddingJobData | null {
    try {
      const result = embeddingJobDataSchema.parse(data);

      this.logger.debug("Embedding job data validation successful", {
        entityId: result.id,
        entityType: result.entityType,
        contentHash: result.contentHash,
      });

      return result;
    } catch (error) {
      this.logger.warn("Invalid embedding job data", {
        data,
        validationError: error instanceof z.ZodError ? error.issues : error,
      });
      return null;
    }
  }
}
