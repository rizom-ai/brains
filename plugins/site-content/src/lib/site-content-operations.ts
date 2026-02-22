import type {
  ServicePluginContext,
  JobContext,
  JobOptions,
  RouteDefinition,
  SectionDefinition,
} from "@brains/plugins";
import type { GenerateOptions } from "../schemas/generate-options";

export class SiteContentOperations {
  constructor(private readonly context: ServicePluginContext) {}

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
        pluginId: metadata.pluginId ?? "site-content",
      },
    };
  }

  private async fetchRoutes(): Promise<RouteDefinition[]> {
    const response = await this.context.messaging.send(
      "site-builder:routes:list",
      {},
    );
    if ("noop" in response) {
      throw new Error(
        "No handler for site-builder:routes:list — is site-builder plugin loaded?",
      );
    }
    if (!response.success || !response.data) {
      throw new Error("Failed to fetch routes from site-builder");
    }
    return response.data as RouteDefinition[];
  }

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

    const routes = await this.fetchRoutes();

    let targetRoutes = routes;
    if (options.routeId) {
      targetRoutes = routes.filter((r) => r.id === options.routeId);
      if (targetRoutes.length === 0) {
        throw new Error(`Route not found: ${options.routeId}`);
      }
    }

    const sectionsToGenerate: Array<{
      route: RouteDefinition;
      section: SectionDefinition;
    }> = [];

    for (const route of targetRoutes) {
      for (const section of route.sections) {
        if (options.sectionId && section.id !== options.sectionId) {
          continue;
        }

        if (section.content) {
          logger.debug("Section has static content, skipping", {
            routeId: route.id,
            sectionId: section.id,
          });
          continue;
        }

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

    const jobs: Array<{ jobId: string; routeId: string; sectionId: string }> =
      [];
    const batchJobs: Array<{
      type: string;
      data: Record<string, unknown>;
    }> = [];

    for (const { route, section } of sectionsToGenerate) {
      const entityId = `${route.id}:${section.id}`;
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

    if (batchJobs.length > 0) {
      const jobOptions = this.createJobOptions(
        metadata,
        "site:content-generation",
      );
      const batchId = await this.context.jobs.enqueueBatch(
        batchJobs,
        jobOptions,
      );

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
