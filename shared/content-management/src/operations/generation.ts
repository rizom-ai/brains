import type { Logger } from "@brains/types";
import type { IEntityService as EntityService } from "@brains/entity-service";
import type { SiteContentEntityType } from "@brains/types";
import type { RouteDefinition, SectionDefinition } from "@brains/view-registry";
import type { PluginContext } from "@brains/plugin-utils";
import type { GenerateOptions, ContentGenerationJob } from "../types";

/**
 * Generate deterministic entity ID for site content
 * Format: ${pageId}:${sectionId}
 */
function generateContentId(pageId: string, sectionId: string): string {
  return `${pageId}:${sectionId}`;
}

/**
 * Content generation operations
 * Handles AI-driven content generation and regeneration
 */
export class GenerationOperations {
  private static instance: GenerationOperations | null = null;

  // Singleton access
  public static getInstance(
    entityService: EntityService,
    logger: Logger,
    pluginContext: PluginContext,
  ): GenerationOperations {
    GenerationOperations.instance ??= new GenerationOperations(
      entityService,
      logger,
      pluginContext,
    );
    return GenerationOperations.instance;
  }

  // Testing reset
  public static resetInstance(): void {
    GenerationOperations.instance = null;
  }

  // Isolated instance creation
  public static createFresh(
    entityService: EntityService,
    logger: Logger,
    pluginContext: PluginContext,
  ): GenerationOperations {
    return new GenerationOperations(entityService, logger, pluginContext);
  }

  // Private constructor to enforce factory methods
  private constructor(
    _entityService: EntityService, // TODO: Use for checking if entities already exist before queuing
    private readonly logger: Logger,
    private readonly pluginContext: PluginContext,
  ) {}

  /**
   * Generate content (queues jobs and returns immediately)
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
    this.logger.info("Starting async content generation", { options });

    const jobs: ContentGenerationJob[] = [];
    let totalSections = 0;
    let queuedSections = 0;

    for (const route of routes) {
      // Apply page filter if specified
      const pageId = route.id;
      if (options.pageId && pageId !== options.pageId) {
        continue;
      }

      const sectionsToGenerate = options.sectionId
        ? route.sections.filter((s) => s.id === options.sectionId)
        : route.sections;

      totalSections += sectionsToGenerate.length;

      for (const sectionDefinition of sectionsToGenerate) {
        const entityId = generateContentId(pageId, sectionDefinition.id);

        // Skip if dry run
        if (options.dryRun) {
          this.logger.debug("Dry run: would generate", {
            pageId,
            sectionId: sectionDefinition.id,
            entityId,
          });
          continue;
        }

        // Create content generation job
        const job: ContentGenerationJob = {
          jobId: `generate-${entityId}-${Date.now()}`,
          entityId,
          entityType: targetEntityType,
          operation: "generate",
          pageId,
          sectionId: sectionDefinition.id,
          templateName: templateResolver(sectionDefinition),
          route,
          sectionDefinition,
        };

        jobs.push(job);
        queuedSections++;

        // Queue the job using generic enqueueJob method
        // Only pass the data that the job handler actually needs
        await this.pluginContext.enqueueJob("content-generation", {
          templateName: job.templateName,
          entityId: job.entityId,
          entityType: job.entityType,
          context: {
            data: {
              jobId: job.jobId,
              entityId: job.entityId,
              entityType: job.entityType,
              operation: job.operation,
              pageId: job.pageId,
              sectionId: job.sectionId,
              templateName: job.templateName,
              siteConfig,
            },
          },
        });

        this.logger.debug("Queued content generation job", {
          jobId: job.jobId,
          pageId,
          sectionId: sectionDefinition.id,
        });
      }
    }

    this.logger.info("Async content generation queued", {
      totalSections,
      queuedSections,
      jobCount: jobs.length,
    });

    return {
      jobs,
      totalSections,
      queuedSections,
    };
  }
}
