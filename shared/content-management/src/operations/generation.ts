import type { Logger } from "@brains/utils";
import type { EntityService } from "@brains/entity-service";
import type { SiteContentEntityType } from "@brains/view-registry";
import type { RouteDefinition, SectionDefinition } from "@brains/view-registry";
import type { PluginContext } from "@brains/plugin-utils";
import type { GenerateOptions, ContentGenerationJob } from "../types";
import type { JobOptions } from "@brains/db";

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
    jobOptions: JobOptions,
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

        // Queue the job using generic enqueueJob method
        // Only pass the data that the job handler actually needs
        await this.pluginContext.enqueueJob(
          "content-generation",
          {
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
          },
          jobOptions,
        );

        this.logger.debug("Queued content generation job", {
          jobId: job.jobId,
          routeId,
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
