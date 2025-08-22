import { z } from "zod";
import { Logger } from "@brains/utils";
import type { JobHandler } from "@brains/job-queue";
import type { EntityService } from "@brains/entity-service";
import type { ProgressReporter } from "@brains/utils";

/**
 * Zod schema for content derivation job data validation
 */
export const contentDerivationJobDataSchema = z.object({
  entityId: z.string(),
  sourceEntityType: z.string(),
  targetEntityType: z.string().nullable(), // null means delete the source
  options: z
    .object({
      deleteSource: z.boolean().optional().default(false),
    })
    .optional(),
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
  private entityService: EntityService;

  /**
   * Get the singleton instance
   */
  public static getInstance(
    entityService: EntityService,
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
    entityService: EntityService,
  ): ContentDerivationJobHandler {
    return new ContentDerivationJobHandler(entityService);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(entityService: EntityService) {
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
    progressReporter: ProgressReporter,
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
        // Report derivation start
        await progressReporter.report({
          message: `Deriving ${data.sourceEntityType} to ${data.targetEntityType}`,
          progress: 0,
          total: 2,
        });

        // Get the source entity
        const source = await this.entityService.getEntity(
          data.sourceEntityType,
          data.entityId,
        );

        if (!source) {
          throw new Error(
            `Source entity not found: ${data.sourceEntityType}:${data.entityId}`,
          );
        }

        // Convert the ID to the target entity type
        // For content entities, we need to replace the entity type prefix
        const sourceIdParts = data.entityId.split(":");
        let targetId: string;

        if (
          sourceIdParts.length === 3 &&
          (data.sourceEntityType === "site-content-preview" ||
            data.sourceEntityType === "site-content-production")
        ) {
          // This is a site content entity with format "type:routeId:sectionId"
          targetId = `${data.targetEntityType}:${sourceIdParts[1]}:${sourceIdParts[2]}`;
        } else {
          // For other entity types, keep the same ID
          targetId = data.entityId;
        }

        // Create the derived entity by copying source fields
        const {
          created: _created,
          updated: _updated,
          entityType: _entityType,
          id: _id,
          ...contentFields
        } = source;

        const derivedEntity = {
          ...contentFields,
          id: targetId,
          entityType: data.targetEntityType,
        };

        // Check if target already exists
        const existingTarget = await this.entityService.getEntity(
          data.targetEntityType,
          targetId,
        );

        // Create or update the entity
        let result: { entityId: string; jobId: string };
        if (existingTarget) {
          result = await this.entityService.updateEntity({
            ...existingTarget,
            ...derivedEntity,
          });
        } else {
          result = await this.entityService.createEntity(derivedEntity);
        }

        // Optionally delete the source (after creating target)
        if (data.options?.deleteSource) {
          await this.entityService.deleteEntity(
            data.sourceEntityType,
            data.entityId,
          );
        }

        this.logger.info("Content derivation job queued", {
          jobId,
          sourceEntityId: data.entityId,
          targetEntityId: result.entityId,
          createJobId: result.jobId,
          sourceType: data.sourceEntityType,
          targetType: data.targetEntityType,
          deleteSource: data.options?.deleteSource,
        });

        // Note: We don't wait for the entity creation job to complete
        // to avoid deadlock in single-worker environments.
        // The entity will be created asynchronously.

        // Report completion
        await progressReporter.report({
          message: `Derived ${data.sourceEntityType} to ${data.targetEntityType}`,
          progress: 2,
          total: 2,
        });

        return {
          entityId: result.entityId,
          success: true,
        };
      } else {
        // Report deletion start
        await progressReporter.report({
          message: `Deleting ${data.sourceEntityType} entity`,
          progress: 1,
          total: 2,
        });

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

        // Report completion
        await progressReporter.report({
          message: `Deleted ${data.sourceEntityType} entity`,
          progress: 2,
          total: 2,
        });

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
