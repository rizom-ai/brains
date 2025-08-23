import { z } from "zod";
import type {
  JobHandler,
  ServicePluginContext,
  ProgressReporter,
} from "@brains/plugins";

/**
 * Zod schema for promotion job data (preview -> production)
 */
export const siteContentPromotionSchema = z.object({
  entityId: z.string(),
  sourceEntityType: z.literal("site-content-preview"),
  targetEntityType: z.literal("site-content-production"),
  options: z
    .object({
      deleteSource: z.boolean().optional().default(false),
    })
    .optional(),
});

/**
 * Zod schema for rollback job data (production -> preview)
 */
export const siteContentRollbackSchema = z.object({
  entityId: z.string(),
  sourceEntityType: z.literal("site-content-production"),
  targetEntityType: z.literal("site-content-preview"),
  options: z
    .object({
      deleteSource: z.boolean().optional().default(false),
    })
    .optional(),
});

/**
 * Combined schema for site content derivation job data
 */
export const siteContentDerivationJobDataSchema = z.union([
  siteContentPromotionSchema,
  siteContentRollbackSchema,
]);

export type SiteContentDerivationJobData = z.infer<
  typeof siteContentDerivationJobDataSchema
>;

/**
 * Job handler for site content derivation (promote/rollback)
 */
export class SiteContentDerivationJobHandler
  implements JobHandler<"content-derivation">
{
  constructor(private readonly context: ServicePluginContext) {}

  /**
   * Process a site content derivation job
   */
  public async process(
    data: SiteContentDerivationJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<{ entityId: string; success: boolean }> {
    const logger = this.context.logger.child("SiteContentDerivationJobHandler");

    try {
      logger.debug("Processing site content derivation job", {
        jobId,
        entityId: data.entityId,
        sourceEntityType: data.sourceEntityType,
        targetEntityType: data.targetEntityType,
      });

      const isPromotion =
        data.sourceEntityType === "site-content-preview" &&
        data.targetEntityType === "site-content-production";

      if (isPromotion) {
        // Promote: preview -> production
        await progressReporter.report({
          message: `Promoting ${data.entityId} to production`,
          progress: 0,
          total: 2,
        });

        // Get the source entity
        const source = await this.context.entityService.getEntity(
          data.sourceEntityType,
          data.entityId,
        );

        if (!source) {
          throw new Error(
            `Source entity not found: ${data.sourceEntityType}:${data.entityId}`,
          );
        }

        // The ID stays the same (routeId:sectionId), only entity type changes
        const targetId = data.entityId;

        // Create the production entity
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
        const existingTarget = await this.context.entityService.getEntity(
          data.targetEntityType,
          targetId,
        );

        // Create or update the entity
        let result: { entityId: string; jobId: string };
        if (existingTarget) {
          result = await this.context.entityService.updateEntity({
            ...existingTarget,
            ...derivedEntity,
          });
        } else {
          result = await this.context.entityService.createEntity(derivedEntity);
        }

        // Optionally delete the preview
        if (data.options?.deleteSource) {
          await this.context.entityService.deleteEntity(
            data.sourceEntityType,
            data.entityId,
          );
        }

        await progressReporter.report({
          message: `Promoted ${data.entityId} to production`,
          progress: 2,
          total: 2,
        });

        logger.info("Site content promoted to production", {
          jobId,
          sourceEntityId: data.entityId,
          targetEntityId: result.entityId,
        });

        return {
          entityId: result.entityId,
          success: true,
        };
      } else {
        // Rollback: production -> preview
        await progressReporter.report({
          message: `Rolling back ${data.entityId} to preview`,
          progress: 0,
          total: 2,
        });

        // Get the source entity (production)
        const source = await this.context.entityService.getEntity(
          data.sourceEntityType,
          data.entityId,
        );

        if (!source) {
          throw new Error(
            `Source entity not found: ${data.sourceEntityType}:${data.entityId}`,
          );
        }

        // The ID stays the same (routeId:sectionId), only entity type changes
        const targetId = data.entityId;

        // Create the preview entity from production
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
        const existingTarget = await this.context.entityService.getEntity(
          data.targetEntityType,
          targetId,
        );

        let result: { entityId: string; jobId: string };
        if (existingTarget) {
          result = await this.context.entityService.updateEntity({
            ...existingTarget,
            ...derivedEntity,
          });
        } else {
          result = await this.context.entityService.createEntity(derivedEntity);
        }

        // Optionally delete the production version
        if (data.options?.deleteSource) {
          await this.context.entityService.deleteEntity(
            data.sourceEntityType,
            data.entityId,
          );
        }

        await progressReporter.report({
          message: `Rolled back ${data.entityId} to preview`,
          progress: 2,
          total: 2,
        });

        logger.info("Site content rolled back to preview", {
          jobId,
          sourceEntityId: data.entityId,
          targetEntityId: result.entityId,
        });

        return {
          entityId: result.entityId,
          success: true,
        };
      }
    } catch (error) {
      logger.error("Site content derivation job failed", {
        jobId,
        entityId: data.entityId,
        error,
      });
      throw error;
    }
  }

  /**
   * Validate and parse job data
   */
  public validateAndParse(data: unknown): SiteContentDerivationJobData | null {
    try {
      return siteContentDerivationJobDataSchema.parse(data);
    } catch (error) {
      this.context.logger.warn("Invalid site content derivation job data", {
        data,
        error,
      });
      return null;
    }
  }
}
