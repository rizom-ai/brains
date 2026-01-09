import { z, computeContentHash } from "@brains/utils";
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
 */
const embeddingJobDataSchema = z.object({
  id: z.string().min(1, "Entity ID is required"),
  entityType: z.string().min(1, "Entity type is required"),
  content: z.string().min(1, "Content is required"),
  metadata: z.record(z.string(), z.unknown()).default({}),
  created: z.number().int().positive("Created timestamp must be positive"),
  updated: z.number().int().positive("Updated timestamp must be positive"),
  contentWeight: z
    .number()
    .min(0)
    .max(1, "Content weight must be between 0 and 1"),
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
   * Generates embedding for entity content and upserts the complete entity
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
        contentLength: data.content.length,
      });

      // Report initial progress
      await progressReporter.report({
        progress: 0,
        total: 2,
        message: `Generating embedding for ${data.entityType} ${data.id}`,
      });

      // For UPDATE operations only: check if entity still exists and content matches
      // For CREATE operations, the entity doesn't exist yet - that's expected
      // This prevents stale UPDATE jobs from overwriting current entity data
      if (data.operation === "update") {
        const currentEntity = await this.entityService.getEntity(
          data.entityType,
          data.id,
        );

        if (!currentEntity) {
          this.logger.warn("Entity no longer exists, skipping update job", {
            jobId,
            entityId: data.id,
            entityType: data.entityType,
          });
          return;
        }

        const jobContentHash = computeContentHash(data.content);
        if (currentEntity.contentHash !== jobContentHash) {
          this.logger.info(
            "Entity content changed since job created, skipping stale embedding",
            {
              jobId,
              entityId: data.id,
              entityType: data.entityType,
              jobContentHash,
              currentContentHash: currentEntity.contentHash,
            },
          );
          return;
        }
      }

      // Generate embedding for the entity content
      const embedding = await this.embeddingService.generateEmbedding(
        data.content,
      );

      // Report progress after embedding generation
      await progressReporter.report({
        progress: 1,
        total: 2,
        message: `Storing embedding for ${data.entityType} ${data.id}`,
      });

      // Store the entity with embedding through the entity service
      await this.entityService.storeEntityWithEmbedding({
        id: data.id,
        entityType: data.entityType,
        content: data.content,
        metadata: data.metadata,
        created: data.created,
        updated: data.updated,
        contentWeight: data.contentWeight,
        embedding,
      });

      // Emit appropriate event after successful save
      // - entity:created for new entities (triggers site rebuilds, etc.)
      // - entity:embedding:ready for embedding updates (doesn't trigger rebuilds)
      if (this.messageBus) {
        const eventType =
          data.operation === "create"
            ? "entity:created"
            : "entity:embedding:ready";
        this.logger.debug(
          `Emitting ${eventType} event for ${data.entityType}:${data.id} after entity saved`,
        );

        // Fetch the full entity from the database to get the properly structured entity
        const entity = await this.entityService.getEntity(
          data.entityType,
          data.id,
        );

        if (!entity) {
          this.logger.error("Failed to fetch entity after save", {
            entityType: data.entityType,
            entityId: data.id,
          });
          // Still send the event with minimal data
          await this.messageBus.send(
            eventType,
            {
              entityType: data.entityType,
              entityId: data.id,
              metadata: data.metadata,
            },
            "entity-service",
            undefined,
            undefined,
            true, // broadcast
          );
        } else {
          await this.messageBus.send(
            eventType,
            {
              entityType: data.entityType,
              entityId: data.id,
              entity, // Full, properly structured entity
            },
            "entity-service",
            undefined,
            undefined,
            true, // broadcast
          );
        }
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
      contentLength: data.content.length,
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
        contentLength: result.content.length,
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
