import type { Logger } from "@brains/types";
import type { ProgressNotification } from "@brains/utils";
import type { IEntityService as EntityService } from "@brains/entity-service";
import type { SiteContentEntityType } from "@brains/types";
import type { RouteDefinition, SectionDefinition } from "@brains/view-registry";
import type { PluginContext } from "@brains/plugin-utils";
import type {
  GenerateOptions,
  GenerateResult,
  ContentGenerationJob,
} from "../types";

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
    private readonly entityService: EntityService,
    private readonly logger: Logger,
    private readonly pluginContext: PluginContext,
  ) {}

  /**
   * Generate content synchronously (blocks until complete)
   */
  async generateSync(
    options: GenerateOptions,
    routes: RouteDefinition[],
    generateCallback: (
      route: RouteDefinition,
      sectionId: SectionDefinition,
      progress: ProgressNotification,
    ) => Promise<{
      content: string;
    }>,
    targetEntityType: SiteContentEntityType,
  ): Promise<GenerateResult> {
    return this.generateWithProgress(
      options,
      routes,
      async (route, sectionId, progress) => {
        return generateCallback(route, sectionId, {
          progress: progress.current,
          total: progress.total,
          message: progress.message,
        });
      },
      targetEntityType,
    );
  }

  /**
   * Generate content asynchronously (queues jobs and returns immediately)
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

        // Queue the job
        await this.pluginContext.enqueueContentGeneration({
          templateName: job.templateName,
          context: {
            data: {
              ...job,
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

  /**
   * Generate content with progress tracking (private helper)
   */
  private async generateWithProgress(
    options: GenerateOptions,
    routes: RouteDefinition[],
    generateCallback: (
      route: RouteDefinition,
      sectionId: SectionDefinition,
      progress: { current: number; total: number; message: string },
    ) => Promise<{
      content: string;
    }>,
    targetEntityType: SiteContentEntityType,
  ): Promise<GenerateResult> {
    this.logger.info("Starting content generation", { options });

    const result: GenerateResult = {
      success: true,
      sectionsGenerated: 0,
      totalSections: 0,
      generated: [],
      skipped: [],
      errors: [],
    };

    // Calculate total sections
    for (const route of routes) {
      const pageId = route.id;
      if (options.pageId && pageId !== options.pageId) {
        continue;
      }

      const sectionsToGenerate = options.sectionId
        ? route.sections.filter((s) => s.id === options.sectionId)
        : route.sections;

      result.totalSections += sectionsToGenerate.length;
    }

    let currentSection = 0;

    for (const route of routes) {
      const pageId = route.id;

      // Apply page filter if specified
      if (options.pageId && pageId !== options.pageId) {
        continue;
      }

      const sectionsToGenerate = options.sectionId
        ? route.sections.filter((s) => s.id === options.sectionId)
        : route.sections;

      for (const sectionDefinition of sectionsToGenerate) {
        currentSection++;
        const progress = {
          current: currentSection,
          total: result.totalSections,
          message: `Generating ${pageId}/${sectionDefinition.id}`,
        };

        try {
          // Generate entity ID using simplified pattern
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

          // Check if entity already exists
          const existingEntity = await this.entityService.getEntity(
            targetEntityType,
            entityId,
          );

          if (existingEntity) {
            result.skipped.push({
              pageId,
              sectionId: sectionDefinition.id,
              reason: "Entity already exists",
            });
            continue;
          }

          // Generate content
          const generationResult = await generateCallback(
            route,
            sectionDefinition,
            progress,
          );
          const content = generationResult.content;

          // Create entity
          const newEntity = {
            id: entityId,
            entityType: targetEntityType,
            pageId,
            sectionId: sectionDefinition.id,
            content,
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
          };

          await this.entityService.createEntityAsync(newEntity);

          result.generated.push({
            pageId,
            sectionId: sectionDefinition.id,
            entityId,
            entityType: targetEntityType,
          });

          result.sectionsGenerated++;

          this.logger.debug("Successfully generated content", {
            pageId,
            sectionId: sectionDefinition.id,
            entityId,
          });
        } catch (error) {
          const errorMessage = `Failed to generate ${pageId}/${sectionDefinition.id}: ${error instanceof Error ? error.message : String(error)}`;
          result.errors?.push(errorMessage);
          result.success = false;

          this.logger.error("Failed to generate content", {
            pageId,
            sectionId: sectionDefinition.id,
            error: errorMessage,
          });
        }
      }
    }

    this.logger.info("Content generation completed", {
      sectionsGenerated: result.sectionsGenerated,
      totalSections: result.totalSections,
      skipped: result.skipped.length,
      errors: result.errors?.length ?? 0,
    });

    return result;
  }
}
