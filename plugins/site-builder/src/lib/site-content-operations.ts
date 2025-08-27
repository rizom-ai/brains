import type {
  ServicePluginContext,
  RouteDefinition,
  SectionDefinition,
  JobContext,
  JobOptions,
} from "@brains/plugins";
import type { SiteContentPreview, SiteContentProduction } from "../types";
import type { GenerateOptions } from "../types/content-schemas";

/**
 * Site content operations - handles content generation, promotion, and rollback
 * Replaces ContentManager functionality for site-builder plugin
 */
export class SiteContentOperations {
  constructor(private readonly context: ServicePluginContext) {}

  /**
   * Create JobOptions from metadata
   */
  private createJobOptions(
    metadata: Partial<JobContext> | undefined,
    defaultSource: string,
  ): JobOptions | undefined {
    if (!metadata) return undefined;

    return {
      source: metadata.operationType || defaultSource,
      metadata: {
        rootJobId: metadata.rootJobId || `${defaultSource}-${Date.now()}`,
        operationType: metadata.operationType || "content_operations",
        progressToken: metadata.progressToken,
        pluginId: metadata.pluginId || "site-builder",
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

    // Get all routes from context
    const routes = this.context.listRoutes();

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
          const capabilities = this.context.getTemplateCapabilities(
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
            logger.info("Template doesn't support generation, skipping", {
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
            "site-content-preview",
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

      // Template names need to be scoped for the shell's content-service
      const templateName = section.template;

      const jobData: Record<string, unknown> = {
        routeId: route.id,
        sectionId: section.id,
        entityId,
        entityType: "site-content-preview",
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
        type: "content-generation",
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
        ? await this.context.enqueueBatch(batchJobs, jobOptions)
        : await this.context.enqueueBatch(batchJobs);

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

  /**
   * Get preview entities
   */
  async getPreviewEntities(filters?: {
    routeId?: string;
  }): Promise<Array<{ id: string; routeId: string; sectionId: string }>> {
    // Use listEntities like the old ContentManager implementation did
    const entities =
      await this.context.entityService.listEntities<SiteContentPreview>(
        "site-content-preview",
        { limit: 1000 },
      );

    // Filter by routeId if specified
    const filtered = filters?.routeId
      ? entities.filter((e) => e.routeId === filters.routeId)
      : entities;

    return filtered.map((entity) => ({
      id: entity.id,
      routeId: entity.routeId,
      sectionId: entity.sectionId,
    }));
  }

  /**
   * Get production entities
   */
  async getProductionEntities(filters?: {
    routeId?: string;
  }): Promise<Array<{ id: string; routeId: string; sectionId: string }>> {
    // Use listEntities like the old ContentManager implementation did
    const entities =
      await this.context.entityService.listEntities<SiteContentProduction>(
        "site-content-production",
        { limit: 1000 },
      );

    // Filter by routeId if specified
    const filtered = filters?.routeId
      ? entities.filter((e) => e.routeId === filters.routeId)
      : entities;

    return filtered.map((entity) => ({
      id: entity.id,
      routeId: entity.routeId,
      sectionId: entity.sectionId,
    }));
  }

  /**
   * Promote preview content to production
   */
  async promote(
    entityIds: string[],
    metadata?: Partial<JobContext>,
  ): Promise<string> {
    if (entityIds.length === 0) {
      throw new Error("No entities to promote");
    }

    const batchJobs = entityIds.map((entityId) => ({
      type: "content-derivation",
      data: {
        entityId,
        sourceEntityType: "site-content-preview",
        targetEntityType: "site-content-production",
        options: { deleteSource: false },
      },
    }));

    const jobOptions = this.createJobOptions(
      metadata,
      "site:content-derivation",
    );
    return jobOptions
      ? this.context.enqueueBatch(batchJobs, jobOptions)
      : this.context.enqueueBatch(batchJobs);
  }

  /**
   * Rollback production content
   */
  async rollback(
    entityIds: string[],
    metadata?: Partial<JobContext>,
  ): Promise<string> {
    if (entityIds.length === 0) {
      throw new Error("No entities to rollback");
    }

    const batchJobs = entityIds.map((entityId) => ({
      type: "content-derivation",
      data: {
        entityId,
        sourceEntityType: "site-content-production",
        targetEntityType: "site-content-preview",
      },
    }));

    const jobOptions = this.createJobOptions(
      metadata,
      "site:content-derivation",
    );
    return jobOptions
      ? this.context.enqueueBatch(batchJobs, jobOptions)
      : this.context.enqueueBatch(batchJobs);
  }
}
