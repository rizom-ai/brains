import type {
  ServicePluginContext,
  JobContext,
  JobOptions,
} from "@brains/plugins";
import type { RouteDefinition, SectionDefinition } from "../types/routes";
import type { GenerateOptions } from "../types/content-schemas";
import type { RouteRegistry } from "./route-registry";

/**
 * Site content operations - handles content generation
 */
export class SiteContentOperations {
  constructor(
    private readonly context: ServicePluginContext,
    private readonly routeRegistry: RouteRegistry,
  ) {}

  /**
   * Create JobOptions from metadata
   */
  private createJobOptions(
    metadata: Partial<JobContext> | undefined,
    defaultSource: string,
  ): JobOptions | undefined {
    if (!metadata) return undefined;

    return {
      source: metadata.operationType ?? defaultSource,
      rootJobId: metadata.rootJobId ?? `${defaultSource}-${Date.now()}`,
      metadata: {
        operationType: metadata.operationType ?? "content_operations",
        progressToken: metadata.progressToken,
        pluginId: metadata.pluginId ?? "site-builder",
      },
    };
  }

  /**
   * Generate content for routes
   */
  async generate(
    options: GenerateOptions,
    siteConfig?: Record<string, unknown>,
    metadata?: Partial<JobContext>,
  ): Promise<{
    jobs: Array<{ jobId: string; routeId: string; sectionId: string }>;
    totalSections: number;
    queuedSections: number;
    batchId: string;
  }> {
    const logger = this.context.logger.child("SiteContentOperations");

    // Get all routes from registry
    const routes = this.routeRegistry.list();

    // Filter routes based on options
    let targetRoutes = routes;
    if (options.routeId) {
      targetRoutes = routes.filter((r) => r.id === options.routeId);
      if (targetRoutes.length === 0) {
        throw new Error(`Route not found: ${options.routeId}`);
      }
    }

    // Collect all sections to generate
    const sectionsToGenerate: Array<{
      route: RouteDefinition;
      section: SectionDefinition;
    }> = [];

    for (const route of targetRoutes) {
      for (const section of route.sections) {
        // Filter by sectionId if specified
        if (options.sectionId && section.id !== options.sectionId) {
          continue;
        }

        // Skip sections with static content
        if (section.content) {
          logger.debug("Section has static content, skipping", {
            routeId: route.id,
            sectionId: section.id,
          });
          continue;
        }

        // Check template capabilities
        if (section.template) {
          const capabilities = this.context.templates.getCapabilities(
            section.template,
          );

          if (!capabilities) {
            logger.warn("Template not found, skipping section", {
              routeId: route.id,
              sectionId: section.id,
              templateName: section.template,
            });
            continue;
          }

          if (!capabilities.canGenerate) {
            logger.debug("Template doesn't support generation, skipping", {
              routeId: route.id,
              sectionId: section.id,
              templateName: section.template,
              capabilities,
            });
            continue;
          }
        } else {
          logger.debug("Section has no template, skipping", {
            routeId: route.id,
            sectionId: section.id,
          });
          continue;
        }

        // Check if content already exists (unless force is true)
        if (!options.force && !options.dryRun) {
          const entityId = `${route.id}:${section.id}`;
          const existing = await this.context.entityService.getEntity(
            "site-content",
            entityId,
          );
          if (existing) {
            logger.debug("Content already exists, skipping", {
              routeId: route.id,
              sectionId: section.id,
            });
            continue;
          }
        }

        sectionsToGenerate.push({ route, section });
      }
    }

    const totalSections = sectionsToGenerate.length;

    if (options.dryRun) {
      return {
        jobs: [],
        totalSections,
        queuedSections: totalSections,
        batchId: `dry-run-${Date.now()}`,
      };
    }

    // Queue generation jobs
    const jobs: Array<{ jobId: string; routeId: string; sectionId: string }> =
      [];
    const batchJobs: Array<{
      type: string;
      data: Record<string, unknown>;
    }> = [];

    for (const { route, section } of sectionsToGenerate) {
      const entityId = `${route.id}:${section.id}`;

      // Template name is already scoped in the route definition
      const templateName = section.template;

      const jobData: Record<string, unknown> = {
        routeId: route.id,
        sectionId: section.id,
        entityId,
        entityType: "site-content",
        templateName,
        context: {
          prompt:
            typeof section.content === "string" ? section.content : undefined,
          data: {
            routeId: route.id,
            sectionId: section.id,
            routeTitle: route.title,
            routeDescription: route.description,
            sectionContent: section.content,
          },
          conversationId: "system",
        },
        siteConfig,
      };

      batchJobs.push({
        type: "shell:content-generation",
        data: jobData,
      });
    }

    // Queue all jobs as a batch
    if (batchJobs.length > 0) {
      const jobOptions = this.createJobOptions(
        metadata,
        "site:content-generation",
      );
      const batchId = jobOptions
        ? await this.context.jobs.enqueueBatch(batchJobs, jobOptions)
        : await this.context.jobs.enqueueBatch(batchJobs);

      // Create job entries for tracking
      for (let i = 0; i < sectionsToGenerate.length; i++) {
        const item = sectionsToGenerate[i];
        if (item) {
          jobs.push({
            jobId: `${batchId}-${i}`,
            routeId: item.route.id,
            sectionId: item.section.id,
          });
        }
      }

      return {
        jobs,
        totalSections,
        queuedSections: jobs.length,
        batchId,
      };
    }

    return {
      jobs: [],
      totalSections,
      queuedSections: 0,
      batchId: `empty-${Date.now()}`,
    };
  }
}
