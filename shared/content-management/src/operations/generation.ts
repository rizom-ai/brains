import type { Logger } from "@brains/utils";
import type { EntityService } from "@brains/entity-service";
import type { SiteContentEntityType } from "@brains/view-registry";
import type { RouteDefinition, SectionDefinition } from "@brains/view-registry";
import type { PluginContext } from "@brains/plugin-utils";
import type { GenerateOptions, ContentGenerationJob } from "../types";
import type { JobOptions } from "@brains/db";
import type { ContentGenerationJobData } from "@brains/content-generator";

/**
 * Generate deterministic entity ID for site content
 * Format: ${routeId}:${sectionId}
 */
function generateContentId(routeId: string, sectionId: string): string {
  return `${routeId}:${sectionId}`;
}

/**
 * Content generation operations
 * Handles AI-driven content generation and regeneration
 */
export class GenerationOperations {
  // Create a new instance
  constructor(
    private readonly entityService: EntityService,
    private readonly logger: Logger,
    private readonly pluginContext: PluginContext,
  ) {}

  /**
   * Generate content (queues jobs and returns immediately)
   */
  async generate(
    rawOptions: Partial<GenerateOptions>,
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
    // Apply defaults to options
    const options: GenerateOptions = {
      dryRun: false,
      force: false,
      ...rawOptions,
    };
    this.logger.info("Starting async content generation", { options });

    const jobs: ContentGenerationJob[] = [];
    const operations: Array<{
      type: string;
      data: ContentGenerationJobData;
    }> = [];
    let totalSections = 0;
    let queuedSections = 0;

    for (const route of routes) {
      // Apply page filter if specified
      const routeId = route.id;
      if (options.routeId && routeId !== options.routeId) {
        continue;
      }

      const sectionsToGenerate = options.sectionId
        ? route.sections.filter((s) => s.id === options.sectionId)
        : route.sections;

      totalSections += sectionsToGenerate.length;

      for (const sectionDefinition of sectionsToGenerate) {
        const entityId = generateContentId(routeId, sectionDefinition.id);

        // Check if content already exists (unless force flag is set)
        if (!options.force && !options.dryRun) {
          const existingEntity = await this.entityService.getEntity(
            targetEntityType,
            `${targetEntityType}:${entityId}`,
          );

          if (existingEntity) {
            this.logger.debug("Content already exists, skipping", {
              routeId,
              sectionId: sectionDefinition.id,
              entityId,
            });
            continue;
          }
        }

        // Skip if dry run
        if (options.dryRun) {
          this.logger.debug("Dry run: would generate", {
            routeId,
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
          routeId,
          sectionId: sectionDefinition.id,
          templateName: templateResolver(sectionDefinition),
          route,
          sectionDefinition,
        };

        jobs.push(job);
        queuedSections++;

        // Create properly typed job data for batch
        const jobData: ContentGenerationJobData = {
          templateName: job.templateName,
          entityId: job.entityId,
          entityType: job.entityType,
          context: {
            data: {
              jobId: job.jobId,
              entityId: job.entityId,
              entityType: job.entityType,
              operation: job.operation,
              routeId: job.routeId,
              sectionId: job.sectionId,
              templateName: job.templateName,
              siteConfig,
            },
          },
        };

        operations.push({
          type: "content-generation",
          data: jobData,
        });
      }
    }

    // Queue as batch operation
    const batchId =
      operations.length > 0
        ? await this.pluginContext.enqueueBatch(operations, jobOptions)
        : `empty-batch-${Date.now()}`;

    this.logger.info("Async content generation queued", {
      totalSections,
      queuedSections,
      jobCount: jobs.length,
      batchId,
    });

    return {
      jobs,
      totalSections,
      queuedSections,
      batchId,
    };
  }
}
