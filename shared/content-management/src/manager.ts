import type { Logger } from "@brains/types";
import type { ProgressNotification } from "@brains/utils";
import type { IEntityService as EntityService } from "@brains/entity-service";
import type { PluginContext } from "@brains/plugin-utils";
import type { RouteDefinition, SectionDefinition } from "@brains/view-registry";
import { GenerationOperations } from "./operations/generation";
import { DerivationOperations } from "./operations/derivation";
import { EntityQueryService } from "./services/entity-query";
import { JobTrackingService } from "./services/job-tracking";
import type {
  SiteContent,
  SiteContentEntityType,
  GenerateOptions,
  GenerateResult,
  ContentGenerationJob,
  DeriveOptions,
  DeriveResult,
} from "./types";
import type {
  ProgressCallback,
  ContentGenerationResult,
} from "./services/job-tracking";

/**
 * ContentManager facade that provides a unified interface for content management operations
 *
 * This facade integrates:
 * - GenerationOperations: Content generation and regeneration
 * - DerivationOperations: Content transformation between entity types
 * - EntityQueryService: Content querying and retrieval
 * - JobTrackingService: Async job monitoring and progress tracking
 *
 * All dependencies (EntityService, Logger, PluginContext) are required for full functionality
 */
export class ContentManager {
  private static instance: ContentManager | null = null;

  private readonly generationOps: GenerationOperations;
  private readonly derivationOps: DerivationOperations;
  private readonly entityQuery: EntityQueryService;
  private readonly jobTracking: JobTrackingService;

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

    // Async services
    this.jobTracking = JobTrackingService.createFresh(pluginContext, logger);
  }

  // ========================================
  // Content Generation Operations
  // ========================================

  /**
   * Generate content synchronously for specified routes
   */
  async generateSync(
    options: GenerateOptions,
    routes: RouteDefinition[],
    generateCallback: (
      route: RouteDefinition,
      sectionId: SectionDefinition,
      progress: ProgressNotification,
    ) => Promise<{ content: string }>,
    targetEntityType: SiteContentEntityType,
  ): Promise<GenerateResult> {
    return this.generationOps.generateSync(
      options,
      routes,
      generateCallback,
      targetEntityType,
    );
  }

  /**
   * Generate content asynchronously by queuing jobs
   */
  async generateAsync(
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
    return this.generationOps.generateAsync(
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
    progressCallback?: ProgressCallback,
    timeoutMs: number = 60000,
  ): Promise<ContentGenerationResult[]> {
    return this.jobTracking.waitForContentJobs(
      jobs,
      progressCallback,
      timeoutMs,
    );
  }

  /**
   * Get current status summary for content generation jobs
   */
  async getContentJobStatuses(jobs: ContentGenerationJob[]): Promise<{
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    jobs: Array<{
      jobId: string;
      sectionId: string;
      status: "pending" | "processing" | "completed" | "failed";
      error?: string;
    }>;
  }> {
    return this.jobTracking.getContentJobStatuses(jobs);
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
   * Derive content from one entity type to another synchronously
   */
  async deriveSync(
    sourceEntityId: string,
    sourceEntityType: SiteContentEntityType,
    targetEntityType: SiteContentEntityType,
    options: DeriveOptions = {},
  ): Promise<DeriveResult> {
    return this.derivationOps.deriveSync(
      sourceEntityId,
      sourceEntityType,
      targetEntityType,
      options,
    );
  }

  /**
   * Derive content asynchronously (queues jobs and returns immediately)
   */
  async deriveAsync(
    sourceEntityId: string,
    sourceEntityType: SiteContentEntityType,
    targetEntityType: SiteContentEntityType,
    options: DeriveOptions = {},
  ): Promise<{ jobId: string }> {
    return this.derivationOps.deriveAsync(
      sourceEntityId,
      sourceEntityType,
      targetEntityType,
      options,
    );
  }
}
