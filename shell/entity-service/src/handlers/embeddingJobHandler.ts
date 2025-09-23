import { z } from "@brains/utils";
import type { EntityDB } from "../db";
import { entities } from "../schema/entities";
import type { EmbeddingJobData } from "../types";
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
  private db: EntityDB;
  private messageBus?: MessageBus;

  /**
   * Get the singleton instance
   */
  public static getInstance(
    db: EntityDB,
    embeddingService: IEmbeddingService,
    messageBus?: MessageBus,
  ): EmbeddingJobHandler {
    EmbeddingJobHandler.instance ??= new EmbeddingJobHandler(
      db,
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
    db: EntityDB,
    embeddingService: IEmbeddingService,
    messageBus?: MessageBus,
  ): EmbeddingJobHandler {
    return new EmbeddingJobHandler(db, embeddingService, messageBus);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(
    db: EntityDB,
    embeddingService: IEmbeddingService,
    messageBus?: MessageBus,
  ) {
    this.logger = Logger.getInstance().child("EmbeddingJobHandler");
    this.embeddingService = embeddingService;
    this.db = db;
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

      // Upsert the complete entity with embedding (handles both create and update)
      await this.db
        .insert(entities)
        .values({
          id: data.id,
          entityType: data.entityType,
          content: data.content,
          metadata: data.metadata,
          created: data.created,
          updated: data.updated,
          contentWeight: data.contentWeight,
          embedding,
        })
        .onConflictDoUpdate({
          target: [entities.id, entities.entityType],
          set: {
            content: data.content,
            metadata: data.metadata,
            updated: data.updated,
            contentWeight: data.contentWeight,
            embedding,
          },
        });

      // Emit entity event after successful save
      if (this.messageBus) {
        const eventType = data.operation === 'create' ? "entity:created" : "entity:updated";
        this.logger.info(
          `Emitting ${eventType} event for ${data.entityType}:${data.id} after entity saved`,
        );
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
