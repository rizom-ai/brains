import { z } from "zod";
import { Logger } from "@brains/utils";
import type { JobHandler } from "@brains/job-queue";
import type { IEntityService } from "@brains/entity-service";

/**
 * Zod schema for content derivation job data validation
 */
export const contentDerivationJobDataSchema = z.object({
  entityId: z.string(),
  sourceEntityType: z.string(),
  targetEntityType: z.string().nullable(), // null means delete the source
  options: z.object({
    deleteSource: z.boolean().optional().default(false),
  }).optional(),
});

export type ContentDerivationJobData = z.infer<
  typeof contentDerivationJobDataSchema
>;

/**
 * Job handler for content derivation
 * Derives content from one entity type to another, or deletes if no target
 * Implements Component Interface Standardization pattern
 */
export class ContentDerivationJobHandler
  implements JobHandler<"content-derivation">
{
  private static instance: ContentDerivationJobHandler | null = null;
  private logger: Logger;
  private entityService: IEntityService;

  /**
   * Get the singleton instance
   */
  public static getInstance(
    entityService: IEntityService,
  ): ContentDerivationJobHandler {
    ContentDerivationJobHandler.instance ??= new ContentDerivationJobHandler(
      entityService,
    );
    return ContentDerivationJobHandler.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    ContentDerivationJobHandler.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(
    entityService: IEntityService,
  ): ContentDerivationJobHandler {
    return new ContentDerivationJobHandler(entityService);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(entityService: IEntityService) {
    this.logger = Logger.getInstance().child("ContentDerivationJobHandler");
    this.entityService = entityService;
  }

  /**
   * Process a content derivation job
   * If targetEntityType is provided, derives to that type
   * If targetEntityType is null, deletes the source entity
   */
  public async process(
    data: ContentDerivationJobData,
    jobId: string,
  ): Promise<{ entityId: string; success: boolean }> {
    try {
      this.logger.debug("Processing content derivation job", {
        jobId,
        entityId: data.entityId,
        sourceEntityType: data.sourceEntityType,
        targetEntityType: data.targetEntityType,
        deleteSource: data.options?.deleteSource,
      });

      if (data.targetEntityType) {
        // Derive to target entity type
        const derivedEntity = await this.entityService.deriveEntity(
          data.entityId,
          data.sourceEntityType,
          data.targetEntityType,
          { deleteSource: data.options?.deleteSource ?? false },
        );

        this.logger.info("Content derivation completed successfully", {
          jobId,
          sourceEntityId: data.entityId,
          derivedEntityId: derivedEntity.id,
          sourceType: data.sourceEntityType,
          targetType: data.targetEntityType,
        });

        // Verify the derived entity exists
        const verification = await this.entityService.getEntity(
          data.targetEntityType,
          derivedEntity.id,
        );
        
        this.logger.info("Derivation verification", {
          jobId,
          derivedEntityId: derivedEntity.id,
          exists: !!verification,
          verificationType: verification?.entityType,
        });

        return {
          entityId: derivedEntity.id,
          success: true,
        };
      } else {
        // No target type means delete the source
        const success = await this.entityService.deleteEntity(
          data.sourceEntityType,
          data.entityId,
        );

        if (success) {
          this.logger.info("Content deletion completed successfully", {
            jobId,
            deletedEntityId: data.entityId,
            entityType: data.sourceEntityType,
          });
        } else {
          this.logger.warn("Content deletion completed but entity not found", {
            jobId,
            entityId: data.entityId,
            entityType: data.sourceEntityType,
          });
        }

        return {
          entityId: data.entityId,
          success,
        };
      }
    } catch (error) {
      this.logger.error("Content derivation job failed", {
        jobId,
        entityId: data.entityId,
        sourceEntityType: data.sourceEntityType,
        targetEntityType: data.targetEntityType,
        error,
      });
      throw error;
    }
  }

  /**
   * Handle content derivation job errors
   * Provides additional logging and context for debugging
   */
  public async onError(
    error: Error,
    data: ContentDerivationJobData,
    jobId: string,
  ): Promise<void> {
    this.logger.error("Content derivation job error handler called", {
      jobId,
      entityId: data.entityId,
      sourceEntityType: data.sourceEntityType,
      targetEntityType: data.targetEntityType,
      options: data.options,
      errorMessage: error.message,
      errorStack: error.stack,
    });

    // Could add additional error handling here:
    // - Notify user of failed operation
    // - Attempt recovery if needed
    // - Store error details for analysis
  }

  /**
   * Validate and parse content derivation job data using Zod schema
   * Ensures type safety and data integrity
   */
  public validateAndParse(data: unknown): ContentDerivationJobData | null {
    try {
      const result = contentDerivationJobDataSchema.parse(data);

      this.logger.debug("Content derivation job data validation successful", {
        entityId: result.entityId,
        sourceEntityType: result.sourceEntityType,
        targetEntityType: result.targetEntityType,
        options: result.options,
      });

      return result;
    } catch (error) {
      this.logger.warn("Invalid content derivation job data", {
        data,
        validationError: error instanceof z.ZodError ? error.errors : error,
      });
      return null;
    }
  }
}