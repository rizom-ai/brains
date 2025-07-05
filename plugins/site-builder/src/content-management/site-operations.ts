import type { Logger, SiteContent } from "@brains/types";
import { ContentManager } from "@brains/content-management";
import type { IEntityService as EntityService } from "@brains/entity-service";
import type { PluginContext } from "@brains/plugin-utils";
import type {
  PromoteOptions,
  PromoteResult,
  RollbackOptions,
  RollbackResult,
} from "./types";

/**
 * Site-specific content operations for preview/production workflow
 *
 * This class provides site-builder specific operations like promote and rollback
 * that are built on top of the shared ContentManager's derive functionality.
 */
export class SiteOperations {
  private contentManager: ContentManager;

  constructor(
    entityService: EntityService,
    private readonly logger: Logger,
    private readonly pluginContext: PluginContext,
  ) {
    this.contentManager = ContentManager.createFresh(
      entityService,
      logger,
      pluginContext,
    );
  }

  /**
   * Promote preview content to production
   * Uses ContentManager's derive functionality under the hood
   */
  async promoteSync(options: PromoteOptions): Promise<PromoteResult> {
    this.logger.info("Starting promote operation", { options });

    const result: PromoteResult = {
      success: true,
      promoted: [],
      skipped: [],
      errors: [],
    };

    try {
      // Get preview entities to promote based on options
      const previewEntities = await this.getFilteredEntities(
        "site-content-preview",
        options,
      );

      for (const previewEntity of previewEntities) {
        try {
          if (options.dryRun) {
            this.logger.debug("Dry run: would promote", {
              previewId: previewEntity.id,
              page: previewEntity.pageId,
              section: previewEntity.sectionId,
            });
            continue;
          }

          // Use derive to create/update production from preview
          const deriveResult = await this.contentManager.deriveSync(
            previewEntity.id,
            "site-content-preview",
            "site-content-production",
            { deleteSource: false }, // Keep preview entity
          );

          result.promoted.push({
            pageId: previewEntity.pageId,
            sectionId: previewEntity.sectionId,
            previewId: previewEntity.id,
            productionId: deriveResult.derivedEntityId,
          });

          this.logger.debug("Promoted entity", {
            previewId: previewEntity.id,
            productionId: deriveResult.derivedEntityId,
          });
        } catch (error) {
          const errorMessage = `Failed to promote ${previewEntity.pageId}/${previewEntity.sectionId}: ${
            error instanceof Error ? error.message : String(error)
          }`;
          result.errors?.push(errorMessage);
          result.success = false;
          this.logger.error("Failed to promote entity", {
            error: errorMessage,
          });
        }
      }

      this.logger.info("Promote operation completed", {
        promoted: result.promoted.length,
        errors: result.errors?.length ?? 0,
      });

      return result;
    } catch (error) {
      const errorMessage = `Promote operation failed: ${
        error instanceof Error ? error.message : String(error)
      }`;
      result.errors = [errorMessage];
      result.success = false;
      this.logger.error("Promote operation failed", { error: errorMessage });
      return result;
    }
  }

  /**
   * Rollback production content (removes production entities)
   */
  async rollbackSync(options: RollbackOptions): Promise<RollbackResult> {
    this.logger.info("Starting rollback operation", { options });

    const result: RollbackResult = {
      success: true,
      rolledBack: [],
      skipped: [],
      errors: [],
    };

    try {
      // Get production entities to rollback based on options
      const productionEntities = await this.getFilteredEntities(
        "site-content-production",
        options,
      );

      for (const productionEntity of productionEntities) {
        try {
          if (options.dryRun) {
            this.logger.debug("Dry run: would rollback", {
              productionId: productionEntity.id,
              page: productionEntity.pageId,
              section: productionEntity.sectionId,
            });
            continue;
          }

          // Delete the production entity
          await this.pluginContext.entityService.deleteEntity(
            "site-content-production",
            productionEntity.id,
          );

          result.rolledBack.push({
            pageId: productionEntity.pageId,
            sectionId: productionEntity.sectionId,
            productionId: productionEntity.id,
          });

          this.logger.debug("Rolled back entity", {
            productionId: productionEntity.id,
          });
        } catch (error) {
          const errorMessage = `Failed to rollback ${productionEntity.pageId}/${productionEntity.sectionId}: ${
            error instanceof Error ? error.message : String(error)
          }`;
          result.errors?.push(errorMessage);
          result.success = false;
          this.logger.error("Failed to rollback entity", {
            error: errorMessage,
          });
        }
      }

      this.logger.info("Rollback operation completed", {
        rolledBack: result.rolledBack.length,
        errors: result.errors?.length ?? 0,
      });

      return result;
    } catch (error) {
      const errorMessage = `Rollback operation failed: ${
        error instanceof Error ? error.message : String(error)
      }`;
      result.errors = [errorMessage];
      result.success = false;
      this.logger.error("Rollback operation failed", { error: errorMessage });
      return result;
    }
  }

  /**
   * Promote all preview content to production
   */
  async promoteAllSync(): Promise<PromoteResult> {
    return this.promoteSync({ dryRun: false });
  }

  /**
   * Helper to get filtered entities based on options
   */
  private async getFilteredEntities(
    entityType: "site-content-preview" | "site-content-production",
    options: PromoteOptions | RollbackOptions,
  ): Promise<SiteContent[]> {
    // Handle specific sections if provided
    if (options.sections && options.sections.length > 0 && options.pageId) {
      const entities = [];
      for (const sectionId of options.sections) {
        const entity = await this.contentManager.getSectionContent(
          entityType,
          options.pageId,
          sectionId,
          (type, page, section) => `${type}:${page}:${section}`,
        );
        if (entity) {
          entities.push(entity);
        }
      }
      return entities;
    }

    // Handle single section
    if (options.sectionId && options.pageId) {
      const entity = await this.contentManager.getSectionContent(
        entityType,
        options.pageId,
        options.sectionId,
        (type, page, section) => `${type}:${page}:${section}`,
      );
      return entity ? [entity] : [];
    }

    // Handle page-level operations
    if (options.pageId) {
      return this.contentManager.getPageContent(entityType, options.pageId);
    }

    // Get all entities
    return this.contentManager.getAllContent(entityType);
  }
}
