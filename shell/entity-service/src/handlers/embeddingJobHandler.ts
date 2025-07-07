import { z } from "zod";
import type { EntityWithoutEmbedding, DrizzleDB } from "@brains/db";
import { entities } from "@brains/db";
import type { IEmbeddingService } from "@brains/embedding-service";
import { Logger } from "@brains/utils";
import type { JobHandler } from "@brains/job-queue";

/**
 * Zod schema for embedding job data validation
 */
const embeddingJobDataSchema = z.object({
  id: z.string().min(1, "Entity ID is required"),
  entityType: z.string().min(1, "Entity type is required"),
  content: z.string().min(1, "Content is required"),
  metadata: z.record(z.unknown()).default({}),
  created: z.number().int().positive("Created timestamp must be positive"),
  updated: z.number().int().positive("Updated timestamp must be positive"),
  contentWeight: z
    .number()
    .min(0)
    .max(1, "Content weight must be between 0 and 1"),
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
  private db: DrizzleDB;

  /**
   * Get the singleton instance
   */
  public static getInstance(
    db: DrizzleDB,
    embeddingService: IEmbeddingService,
  ): EmbeddingJobHandler {
    EmbeddingJobHandler.instance ??= new EmbeddingJobHandler(
      db,
      embeddingService,
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
    db: DrizzleDB,
    embeddingService: IEmbeddingService,
  ): EmbeddingJobHandler {
    return new EmbeddingJobHandler(db, embeddingService);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(db: DrizzleDB, embeddingService: IEmbeddingService) {
    this.logger = Logger.getInstance().child("EmbeddingJobHandler");
    this.embeddingService = embeddingService;
    this.db = db;
  }

  /**
   * Process an embedding job
   * Generates embedding for entity content and upserts the complete entity
   */
  public async process(
    data: EntityWithoutEmbedding,
    jobId: string,
  ): Promise<void> {
    try {
      this.logger.debug("Processing embedding job", {
        jobId,
        entityId: data.id,
        entityType: data.entityType,
        contentLength: data.content.length,
      });

      // Generate embedding for the entity content
      const embedding = await this.embeddingService.generateEmbedding(
        data.content,
      );

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
    data: EntityWithoutEmbedding,
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
  public validateAndParse(data: unknown): EntityWithoutEmbedding | null {
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
        validationError: error instanceof z.ZodError ? error.errors : error,
      });
      return null;
    }
  }
}
