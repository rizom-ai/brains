import type { Logger } from "@brains/utils";
import { ContentManager } from "@brains/content-management";
import type { EntityService } from "@brains/entity-service";
import type { PluginContext } from "@brains/plugin-utils";
import type { JobContext } from "@brains/db";
import type { PromoteOptions, RollbackOptions } from "./types";
import type { SiteContentEntity } from "@brains/content-management";

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
    pluginContext: PluginContext,
  ) {
    this.contentManager = new ContentManager(
      entityService,
      logger,
      pluginContext,
    );
  }

  /**
   * Promote preview content to production
   * Returns a batch ID for async tracking
   */
  async promote(
    options: PromoteOptions,
    metadata: JobContext,
  ): Promise<string> {
    this.logger.info("Starting promote operation", { options });

    try {
      // Get preview entities to promote based on options
      const previewEntities = await this.getFilteredEntities(
        "site-content-preview",
        options,
      );

      if (options.dryRun) {
        // For dry run, log what would be promoted and return mock batch ID
        for (const previewEntity of previewEntities) {
          this.logger.debug("Dry run: would promote", {
            previewId: previewEntity.id,
            route: previewEntity.routeId,
            section: previewEntity.sectionId,
          });
        }
        return `dry-run-${Date.now()}`;
      }

      if (previewEntities.length === 0) {
        throw new Error("No entities to promote");
      }

      // Use batch promote for all entities
      const entityIds = previewEntities.map((e) => e.id);

      const batchId = await this.contentManager.promote(entityIds, {
        source: "plugin:site-builder",
        metadata,
      });

      this.logger.info("Promote operation queued", {
        batchId,
        entityCount: entityIds.length,
      });

      return batchId;
    } catch (error) {
      const errorMessage = `Promote operation failed: ${
        error instanceof Error ? error.message : String(error)
      }`;
      this.logger.error("Promote operation failed", { error: errorMessage });
      throw new Error(errorMessage);
    }
  }

  /**
   * Rollback production content (removes production entities)
   * Returns a batch ID for async tracking
   */
  async rollback(
    options: RollbackOptions,
    metadata: JobContext,
  ): Promise<string> {
    this.logger.info("Starting rollback operation", { options });

    try {
      // Get production entities to rollback based on options
      const productionEntities = await this.getFilteredEntities(
        "site-content-production",
        options,
      );

      if (options.dryRun) {
        // For dry run, log what would be rolled back and return mock batch ID
        for (const productionEntity of productionEntities) {
          this.logger.debug("Dry run: would rollback", {
            productionId: productionEntity.id,
            route: productionEntity.routeId,
            section: productionEntity.sectionId,
          });
        }
        return `dry-run-${Date.now()}`;
      }

      if (productionEntities.length === 0) {
        throw new Error("No entities to rollback");
      }

      // Use batch rollback for all entities
      const entityIds = productionEntities.map((e) => e.id);

      const batchId = await this.contentManager.rollback(entityIds, {
        source: "plugin:site-builder",
        metadata,
      });

      this.logger.info("Rollback operation queued", {
        batchId,
        entityCount: entityIds.length,
      });

      return batchId;
    } catch (error) {
      const errorMessage = `Rollback operation failed: ${
        error instanceof Error ? error.message : String(error)
      }`;
      this.logger.error("Rollback operation failed", { error: errorMessage });
      throw new Error(errorMessage);
    }
  }

  /**
   * Helper to get filtered entities based on options
   */
  private async getFilteredEntities(
    entityType: "site-content-preview" | "site-content-production",
    options: PromoteOptions | RollbackOptions,
  ): Promise<SiteContentEntity[]> {
    // Handle specific sections if provided
    if (options.sections && options.sections.length > 0 && options.routeId) {
      const entities = [];
      for (const sectionId of options.sections) {
        const entity = await this.contentManager.getSectionContent(
          entityType,
          options.routeId,
          sectionId,
          (type, route, section) => `${type}:${route}:${section}`,
        );
        if (entity) {
          entities.push(entity);
        }
      }
      return entities;
    }

    // Handle single section
    if (options.sectionId && options.routeId) {
      const entity = await this.contentManager.getSectionContent(
        entityType,
        options.routeId,
        options.sectionId,
        (type, route, section) => `${type}:${route}:${section}`,
      );
      return entity ? [entity] : [];
    }

    // Handle route-level operations
    if (options.routeId) {
      return this.contentManager.getRouteContent(entityType, options.routeId);
    }

    // Get all entities
    return this.contentManager.getAllContent(entityType);
  }
}
