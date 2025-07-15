import type { Logger } from "@brains/utils";
import type { ProgressCallback } from "@brains/utils";
import type { EntityService } from "@brains/entity-service";
import type { PluginContext } from "@brains/plugin-utils";
import type {
  RouteDefinition,
  SectionDefinition,
  SiteContentEntityType,
} from "@brains/view-registry";
import type { JobContext, JobOptions } from "@brains/db";
import { GenerationOperations } from "./operations/generation";
import { DerivationOperations } from "./operations/derivation";
import { EntityQueryService } from "./services/entity-query";
import {
  waitForContentJobs,
  getContentJobStatuses,
  type ContentGenerationResult,
} from "./services/job-tracking";
import type {
  SiteContentEntity,
  GenerateOptions,
  ContentGenerationJob,
  DeriveOptions,
} from "./types";

/**
 * ContentManager facade that provides a unified interface for content management operations
 *
 * This facade integrates:
 * - GenerationOperations: Content generation and regeneration
 * - DerivationOperations: Content transformation between entity types
 * - EntityQueryService: Content querying and retrieval
 *
 * All dependencies (EntityService, Logger, PluginContext) are required for full functionality
 */
export class ContentManager {
  private static instance: ContentManager | null = null;

  private readonly generationOps: GenerationOperations;
  private readonly derivationOps: DerivationOperations;
  private readonly entityQuery: EntityQueryService;
  private readonly pluginContext: PluginContext;
  private readonly logger: Logger;

  // Singleton access
  public static getInstance(
    entityService: EntityService,
    logger: Logger,
    pluginContext: PluginContext,
  ): ContentManager {
    ContentManager.instance ??= new ContentManager(
      entityService,
      logger,
      pluginContext,
    );
    return ContentManager.instance;
  }

  // Testing reset
  public static resetInstance(): void {
    ContentManager.instance = null;
  }

  // Isolated instance creation
  public static createFresh(
    entityService: EntityService,
    logger: Logger,
    pluginContext: PluginContext,
  ): ContentManager {
    return new ContentManager(entityService, logger, pluginContext);
  }

  // Private constructor to enforce factory methods
  private constructor(
    entityService: EntityService,
    logger: Logger,
    pluginContext: PluginContext,
  ) {
    this.pluginContext = pluginContext;
    this.logger = logger.child("ContentManager");
    // Always available services
    this.entityQuery = EntityQueryService.createFresh(entityService, logger);
    this.generationOps = GenerationOperations.createFresh(
      entityService,
      logger,
      pluginContext,
    );
    this.derivationOps = DerivationOperations.createFresh(
      entityService,
      logger,
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
   * Wait for content generation jobs to complete with progress tracking
   */
  async waitForContentJobs(
    jobs: ContentGenerationJob[],
    timeoutMs: number = 60000,
    progressCallback?: ProgressCallback,
  ): Promise<ContentGenerationResult[]> {
    return waitForContentJobs(
      jobs,
      this.pluginContext,
      timeoutMs,
      progressCallback,
    );
  }

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
  // Content Derivation Operations
  // ========================================

  /**
   * Derive content (queues jobs and returns immediately)
   */
  async derive(
    sourceEntityId: string,
    sourceEntityType: SiteContentEntityType,
    targetEntityType: SiteContentEntityType,
    options: DeriveOptions = {},
  ): Promise<{ jobId: string }> {
    return this.derivationOps.derive(
      sourceEntityId,
      sourceEntityType,
      targetEntityType,
      options,
    );
  }

  // ========================================
  // Batch Async Operations
  // ========================================

  /**
   * Generate all content using batch operations
   * This queues all sections as a single batch job for better tracking
   */
  async generateAll(
    options: GenerateOptions & {
      source: string;
      metadata: JobContext;
      priority?: number;
    },
    routes: RouteDefinition[],
    templateResolver: (sectionId: SectionDefinition) => string,
    targetEntityType: SiteContentEntityType,
    siteConfig?: Record<string, unknown>,
  ): Promise<string> {
    this.logger.debug("Starting batch async content generation", { options });

    const operations: Array<{
      type: string;
      entityId?: string;
      entityType?: string;
      options?: Record<string, unknown>;
    }> = [];

    // Build operations for all sections
    for (const route of routes) {
      const routeId = route.id;
      if (options.routeId && routeId !== options.routeId) {
        continue;
      }

      const sectionsToGenerate = options.sectionId
        ? route.sections.filter((s) => s.id === options.sectionId)
        : route.sections;

      for (const sectionDefinition of sectionsToGenerate) {
        // Skip sections that already have content
        if (sectionDefinition.content) {
          this.logger.debug("Skipping section with existing content", {
            routeId,
            sectionId: sectionDefinition.id,
          });
          continue;
        }

        const entityId = `${routeId}:${sectionDefinition.id}`;

        // Skip if dry run
        if (options.dryRun) {
          this.logger.debug("Dry run: would generate", {
            routeId,
            sectionId: sectionDefinition.id,
            entityId,
          });
          continue;
        }

        // Create operation with correct structure for content-generation job
        // Only pass serializable data - no complex objects
        const jobData: Record<string, unknown> = {
          templateName: templateResolver(sectionDefinition),
          context: {
            data: {
              jobId: `generate-${entityId}-${Date.now()}`,
              entityId,
              entityType: targetEntityType,
              operation: "generate",
              routeId,
              sectionId: sectionDefinition.id,
              templateName: templateResolver(sectionDefinition),
              siteConfig,
            },
          },
          // Include entity information for saving after generation
          entityId,
          entityType: targetEntityType,
        };

        operations.push({
          type: "content-generation",
          entityId,
          entityType: targetEntityType,
          options: jobData,
        });
      }
    }

    if (operations.length === 0) {
      throw new Error("No operations to perform");
    }

    // Queue as batch operation with metadata
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

    this.logger.debug("Batch content generation queued", {
      batchId,
      operationCount: operations.length,
    });

    return batchId;
  }

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
      entityId: id,
      entityType: "site-content-preview" as const,
      options: {
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
      entityId: id,
      entityType: "site-content-production" as const,
      options: {
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

}
