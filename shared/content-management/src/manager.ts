import type { Logger } from "@brains/utils";
import type { IEntityService } from "@brains/entity-service";
import type { ServicePluginContext } from "@brains/plugins";
import type {
  RouteDefinition,
  SectionDefinition,
  SiteContentEntityType,
} from "@brains/view-registry";
import type { JobContext, JobOptions } from "@brains/db";
import { GenerationOperations } from "./operations/generation";
import { EntityQueryService } from "./services/entity-query";
import { getContentJobStatuses } from "./services/job-tracking";
import type {
  SiteContentEntity,
  GenerateOptions,
  ContentGenerationJob,
} from "./types";
import { convertSiteContentId } from "./utils/id-generator";

/**
 * ContentManager facade that provides a unified interface for content management operations
 *
 * This facade integrates:
 * - GenerationOperations: Content generation and regeneration
 * - EntityQueryService: Content querying and retrieval
 *
 * All dependencies (EntityService, Logger, PluginContext) are required for full functionality
 */
export class ContentManager {
  private readonly generationOps: GenerationOperations;
  private readonly entityQuery: EntityQueryService;
  private readonly pluginContext: ServicePluginContext;
  private readonly logger: Logger;
  private readonly entityService: IEntityService;

  // Create a new instance
  constructor(
    entityService: IEntityService,
    logger: Logger,
    pluginContext: ServicePluginContext,
  ) {
    this.entityService = entityService;
    this.pluginContext = pluginContext;
    this.logger = logger.child("ContentManager");
    // Always available services
    this.entityQuery = new EntityQueryService(entityService, logger);
    this.generationOps = new GenerationOperations(
      entityService,
      logger,
      pluginContext,
    );
  }

  // ========================================
  // Content Generation Operations
  // ========================================

  /**
   * Generate content by queuing jobs
   */
  async generate(
    options: GenerateOptions,
    routes: RouteDefinition[],
    templateResolver: (sectionId: SectionDefinition) => string,
    targetEntityType: SiteContentEntityType,
    jobOptions: JobOptions,
    siteConfig?: Record<string, unknown>,
  ): Promise<{
    jobs: ContentGenerationJob[];
    totalSections: number;
    queuedSections: number;
    batchId: string;
  }> {
    return this.generationOps.generate(
      options,
      routes,
      templateResolver,
      targetEntityType,
      jobOptions,
      siteConfig,
    );
  }

  // ========================================
  // Content Query Operations
  // ========================================

  /**
   * Get content by entity ID
   */
  async getContent(
    entityType: SiteContentEntityType,
    entityId: string,
  ): Promise<SiteContentEntity | null> {
    return this.entityQuery.getContent(entityType, entityId);
  }

  /**
   * Get all content for a specific route
   */
  async getRouteContent(
    entityType: SiteContentEntityType,
    routeId: string,
  ): Promise<SiteContentEntity[]> {
    return this.entityQuery.getRouteContent(entityType, routeId);
  }

  /**
   * Get content for a specific route section
   */
  async getSectionContent(
    entityType: SiteContentEntityType,
    routeId: string,
    sectionId: string,
    generateId: (
      type: SiteContentEntityType,
      routeId: string,
      sectionId: string,
    ) => string,
  ): Promise<SiteContentEntity | null> {
    return this.entityQuery.getSectionContent(
      entityType,
      routeId,
      sectionId,
      generateId,
    );
  }

  /**
   * Get all content entities of a specific type
   */
  async getAllContent(
    entityType: SiteContentEntityType,
  ): Promise<SiteContentEntity[]> {
    return this.entityQuery.getAllContent(entityType);
  }

  /**
   * Check if content exists for a page/section
   */
  async contentExists(
    entityType: SiteContentEntityType,
    routeId: string,
    sectionId: string,
    generateId: (
      type: SiteContentEntityType,
      routeId: string,
      sectionId: string,
    ) => string,
  ): Promise<boolean> {
    return this.entityQuery.contentExists(
      entityType,
      routeId,
      sectionId,
      generateId,
    );
  }

  /**
   * Query content with custom filter criteria
   */
  async queryContent(
    entityType: SiteContentEntityType,
    filter: { metadata?: Record<string, unknown> },
  ): Promise<SiteContentEntity[]> {
    return this.entityQuery.queryContent(entityType, filter);
  }

  /**
   * Get page statistics across multiple entity types
   */
  async getPageStats(
    routeId: string,
    entityTypes: SiteContentEntityType[],
  ): Promise<Record<SiteContentEntityType, number> & { total: number }> {
    return this.entityQuery.getRouteStats(routeId, entityTypes);
  }

  // ========================================
  // Job Tracking Operations
  // ========================================

  /**
   * Get current status of content generation jobs
   */
  async getContentJobStatuses(
    jobs: ContentGenerationJob[],
  ): Promise<Map<string, { status: string; error?: string }>> {
    const jobIds = jobs.map((job) => job.jobId);
    return getContentJobStatuses(jobIds, this.pluginContext);
  }

  // ========================================
  // Convenience Methods
  // ========================================

  /**
   * Get preview entities for a page (convenience method)
   */
  async getPreviewEntities(options: {
    routeId?: string;
  }): Promise<SiteContentEntity[]> {
    if (options.routeId) {
      return this.getRouteContent("site-content-preview", options.routeId);
    }
    return this.getAllContent("site-content-preview");
  }

  /**
   * Get production entities for a page (convenience method)
   */
  async getProductionEntities(options: {
    routeId?: string;
  }): Promise<SiteContentEntity[]> {
    if (options.routeId) {
      return this.getRouteContent("site-content-production", options.routeId);
    }
    return this.getAllContent("site-content-production");
  }

  /**
   * Check if content exists (convenience method with default generate function)
   */
  async exists(
    routeId: string,
    sectionId: string,
    type: "preview" | "production",
    generateId?: (
      type: SiteContentEntityType,
      routeId: string,
      sectionId: string,
    ) => string,
  ): Promise<boolean> {
    const entityType: SiteContentEntityType =
      type === "preview" ? "site-content-preview" : "site-content-production";

    const defaultGenerateId = (
      entityType: SiteContentEntityType,
      routeId: string,
      sectionId: string,
    ): string => `${entityType}:${routeId}:${sectionId}`;

    return this.contentExists(
      entityType,
      routeId,
      sectionId,
      generateId ?? defaultGenerateId,
    );
  }

  // ========================================
  // Batch Async Operations
  // ========================================

  /**
   * Promote multiple preview entities to production
   */
  async promote(
    previewIds: string[],
    options: {
      source: string;
      metadata: JobContext;
      priority?: number;
    },
  ): Promise<string> {
    if (previewIds.length === 0) {
      throw new Error("No entities to promote");
    }

    const operations = previewIds.map((id) => ({
      type: "content-derivation",
      data: {
        entityId: id,
        sourceEntityType: "site-content-preview",
        targetEntityType: "site-content-production",
        // options.deleteSource defaults to false in the handler
      },
    }));

    const jobOptions: JobOptions = {
      source: options.source,
      metadata: options.metadata,
    };
    if (options.priority !== undefined) {
      jobOptions.priority = options.priority;
    }

    const batchId = await this.pluginContext.enqueueBatch(
      operations,
      jobOptions,
    );

    this.logger.debug("Batch promotion queued", {
      batchId,
      entityCount: previewIds.length,
    });

    return batchId;
  }

  /**
   * Rollback multiple production entities
   */
  async rollback(
    productionIds: string[],
    options: {
      source: string;
      metadata: JobContext;
      priority?: number;
    },
  ): Promise<string> {
    if (productionIds.length === 0) {
      throw new Error("No entities to rollback");
    }

    const operations = productionIds.map((id) => ({
      type: "content-derivation",
      data: {
        entityId: id,
        sourceEntityType: "site-content-production",
        targetEntityType: "site-content-preview",
        // options.deleteSource defaults to false in the handler
      },
    }));

    const jobOptions: JobOptions = {
      source: options.source,
      metadata: options.metadata,
    };
    if (options.priority !== undefined) {
      jobOptions.priority = options.priority;
    }

    const batchId = await this.pluginContext.enqueueBatch(
      operations,
      jobOptions,
    );

    this.logger.debug("Batch rollback queued", {
      batchId,
      entityCount: productionIds.length,
    });

    return batchId;
  }

  // ========================================
  // Content Derivation Operations
  // ========================================

  /**
   * Derive content from one entity type to another
   * @param sourceEntityId - The ID of the source entity
   * @param sourceEntityType - The type of the source entity
   * @param targetEntityType - The type of the target entity
   * @param options - Options for the derivation
   * @returns The entity ID and job ID for tracking the async operation
   */
  async deriveContent(
    sourceEntityId: string,
    sourceEntityType: string,
    targetEntityType: string,
    options?: { deleteSource?: boolean },
  ): Promise<{ entityId: string; jobId: string }> {
    // Get the source entity
    const source = await this.entityService.getEntity(
      sourceEntityType,
      sourceEntityId,
    );

    if (!source) {
      throw new Error(
        `Source entity not found: ${sourceEntityType}:${sourceEntityId}`,
      );
    }

    // Convert the ID to the target entity type
    const targetId = convertSiteContentId(
      sourceEntityId,
      targetEntityType as SiteContentEntityType,
    );
    if (!targetId) {
      throw new Error(
        `Cannot convert entity ID from ${sourceEntityType} to ${targetEntityType}: ${sourceEntityId}`,
      );
    }

    // Create the derived entity by copying source fields
    // Exclude auto-generated fields but keep the content and metadata
    const {
      created: _created,
      updated: _updated,
      entityType: _entityType,
      id: _id,
      ...contentFields
    } = source;

    // Create the derived entity with the new ID and type
    const derivedEntity = {
      ...contentFields,
      id: targetId,
      entityType: targetEntityType,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };

    // Check if target entity already exists
    const existingTarget = await this.entityService.getEntity(
      targetEntityType,
      targetId,
    );

    // Create or update the entity and return job info
    let result: { entityId: string; jobId: string };

    if (existingTarget) {
      // Update existing entity
      result = await this.entityService.updateEntity({
        ...existingTarget,
        ...derivedEntity,
      });
      this.logger.debug("Update job created for derived entity", {
        jobId: result.jobId,
        entityId: result.entityId,
      });
    } else {
      // Create new entity
      result = await this.entityService.createEntity(derivedEntity);
      this.logger.debug("Create job created for derived entity", {
        jobId: result.jobId,
        entityId: result.entityId,
      });
    }

    // Optionally delete the source
    // Note: This happens immediately, not after the create/update job completes
    if (options?.deleteSource) {
      await this.entityService.deleteEntity(sourceEntityType, sourceEntityId);
    }

    this.logger.info("Content derivation job created", {
      sourceId: sourceEntityId,
      sourceType: sourceEntityType,
      targetId,
      targetType: targetEntityType,
      jobId: result.jobId,
      deleteSource: options?.deleteSource,
    });

    return result;
  }
}
