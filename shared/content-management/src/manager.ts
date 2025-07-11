import type { Logger } from "@brains/types";
import type { ProgressCallback } from "@brains/utils";
import type { IEntityService as EntityService } from "@brains/entity-service";
import type { PluginContext } from "@brains/plugin-utils";
import type { RouteDefinition, SectionDefinition } from "@brains/view-registry";
import type { BatchJobStatus } from "@brains/job-queue";
import type { ProgressEventContext } from "@brains/db";
import { GenerationOperations } from "./operations/generation";
import { DerivationOperations } from "./operations/derivation";
import { EntityQueryService } from "./services/entity-query";
import {
  waitForContentJobs,
  getContentJobStatuses,
  type ContentGenerationResult,
} from "./services/job-tracking";
import type {
  SiteContent,
  SiteContentEntityType,
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
  ): Promise<SiteContent | null> {
    return this.entityQuery.getContent(entityType, entityId);
  }

  /**
   * Get all content for a specific page
   */
  async getPageContent(
    entityType: SiteContentEntityType,
    pageId: string,
  ): Promise<SiteContent[]> {
    return this.entityQuery.getPageContent(entityType, pageId);
  }

  /**
   * Get content for a specific page section
   */
  async getSectionContent(
    entityType: SiteContentEntityType,
    pageId: string,
    sectionId: string,
    generateId: (
      type: SiteContentEntityType,
      pageId: string,
      sectionId: string,
    ) => string,
  ): Promise<SiteContent | null> {
    return this.entityQuery.getSectionContent(
      entityType,
      pageId,
      sectionId,
      generateId,
    );
  }

  /**
   * Get all content entities of a specific type
   */
  async getAllContent(
    entityType: SiteContentEntityType,
  ): Promise<SiteContent[]> {
    return this.entityQuery.getAllContent(entityType);
  }

  /**
   * Check if content exists for a page/section
   */
  async contentExists(
    entityType: SiteContentEntityType,
    pageId: string,
    sectionId: string,
    generateId: (
      type: SiteContentEntityType,
      pageId: string,
      sectionId: string,
    ) => string,
  ): Promise<boolean> {
    return this.entityQuery.contentExists(
      entityType,
      pageId,
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
  ): Promise<SiteContent[]> {
    return this.entityQuery.queryContent(entityType, filter);
  }

  /**
   * Get page statistics across multiple entity types
   */
  async getPageStats(
    pageId: string,
    entityTypes: SiteContentEntityType[],
  ): Promise<Record<SiteContentEntityType, number> & { total: number }> {
    return this.entityQuery.getPageStats(pageId, entityTypes);
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
    pageId?: string;
  }): Promise<SiteContent[]> {
    if (options.pageId) {
      return this.getPageContent("site-content-preview", options.pageId);
    }
    return this.getAllContent("site-content-preview");
  }

  /**
   * Get production entities for a page (convenience method)
   */
  async getProductionEntities(options: {
    pageId?: string;
  }): Promise<SiteContent[]> {
    if (options.pageId) {
      return this.getPageContent("site-content-production", options.pageId);
    }
    return this.getAllContent("site-content-production");
  }

  /**
   * Check if content exists (convenience method with default generate function)
   */
  async exists(
    pageId: string,
    sectionId: string,
    type: "preview" | "production",
    generateId?: (
      type: SiteContentEntityType,
      pageId: string,
      sectionId: string,
    ) => string,
  ): Promise<boolean> {
    const entityType: SiteContentEntityType =
      type === "preview" ? "site-content-preview" : "site-content-production";

    const defaultGenerateId = (
      entityType: SiteContentEntityType,
      pageId: string,
      sectionId: string,
    ): string => `${entityType}:${pageId}:${sectionId}`;

    return this.contentExists(
      entityType,
      pageId,
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
      metadata: ProgressEventContext;
      priority?: number;
    },
    routes: RouteDefinition[],
    templateResolver: (sectionId: SectionDefinition) => string,
    targetEntityType: SiteContentEntityType,
    siteConfig?: Record<string, unknown>,
  ): Promise<string> {
    this.logger.info("Starting batch async content generation", { options });

    const operations: Array<{
      type: string;
      entityId?: string;
      entityType?: string;
      options?: Record<string, unknown>;
    }> = [];

    // Build operations for all sections
    for (const route of routes) {
      const pageId = route.id;
      if (options.pageId && pageId !== options.pageId) {
        continue;
      }

      const sectionsToGenerate = options.sectionId
        ? route.sections.filter((s) => s.id === options.sectionId)
        : route.sections;

      for (const sectionDefinition of sectionsToGenerate) {
        // Skip sections that already have content
        if (sectionDefinition.content) {
          this.logger.debug("Skipping section with existing content", {
            pageId,
            sectionId: sectionDefinition.id,
          });
          continue;
        }

        const entityId = `${pageId}:${sectionDefinition.id}`;

        // Skip if dry run
        if (options.dryRun) {
          this.logger.debug("Dry run: would generate", {
            pageId,
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
              pageId,
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
    const batchOptions: { priority?: number; maxRetries?: number } = {};
    if (options.priority !== undefined) {
      batchOptions.priority = options.priority;
    }

    const batchId = await this.pluginContext.enqueueBatch(
      operations,
      options.source,
      options.metadata,
      batchOptions,
    );

    this.logger.info("Batch content generation queued", {
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
      metadata: ProgressEventContext;
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

    const batchOptions: { priority?: number; maxRetries?: number } = {};
    if (options.priority !== undefined) {
      batchOptions.priority = options.priority;
    }

    const batchId = await this.pluginContext.enqueueBatch(
      operations,
      options.source,
      options.metadata,
      batchOptions,
    );

    this.logger.info("Batch promotion queued", {
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
      metadata: ProgressEventContext;
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

    const batchOptions: { priority?: number; maxRetries?: number } = {};
    if (options.priority !== undefined) {
      batchOptions.priority = options.priority;
    }

    const batchId = await this.pluginContext.enqueueBatch(
      operations,
      options.source,
      options.metadata,
      batchOptions,
    );

    this.logger.info("Batch rollback queued", {
      batchId,
      entityCount: productionIds.length,
    });

    return batchId;
  }

  /**
   * Get batch operation status
   */
  async getBatchStatus(batchId: string): Promise<BatchJobStatus | null> {
    return this.pluginContext.getBatchStatus(batchId);
  }
}
