import type {
  ServicePluginContext,
  JobContext,
  SectionDefinition,
  Logger,
  GenerateOptions,
} from "@brains/plugins";
import { ContentManager, GenerateOptionsSchema } from "@brains/plugins";
import { z } from "zod";

/**
 * Promote options schema
 */
export const PromoteOptionsSchema = z.object({
  routeId: z.string().optional().describe("Optional: specific route filter"),
  sectionId: z
    .string()
    .optional()
    .describe("Optional: specific section filter"),
  sections: z
    .array(z.string())
    .optional()
    .describe("Optional: batch promote multiple sections"),
  dryRun: z
    .boolean()
    .default(false)
    .describe("Optional: preview changes without executing"),
});

export type PromoteOptions = z.infer<typeof PromoteOptionsSchema>;

/**
 * Rollback options schema
 */
export const RollbackOptionsSchema = z.object({
  routeId: z.string().optional().describe("Optional: specific route filter"),
  sectionId: z
    .string()
    .optional()
    .describe("Optional: specific section filter"),
  sections: z
    .array(z.string())
    .optional()
    .describe("Optional: batch rollback multiple sections"),
  dryRun: z
    .boolean()
    .default(false)
    .describe("Optional: preview changes without executing"),
});

export type RollbackOptions = z.infer<typeof RollbackOptionsSchema>;

/**
 * Service for managing site content operations
 */
export class SiteContentService {
  private contentManager: ContentManager;

  constructor(
    logger: Logger,
    private readonly pluginContext: ServicePluginContext,
    private readonly pluginId: string,
    private readonly siteConfig?: Record<string, unknown>,
  ) {
    this.contentManager = new ContentManager(
      pluginContext.entityService,
      logger.child("ContentManager"),
      pluginContext,
    );
  }

  /**
   * Generate content for routes
   */
  async generateContent(
    options: GenerateOptions,
    context?: JobContext,
  ): Promise<{
    jobs: Array<{ jobId: string; routeId: string; sectionId: string }>;
    totalSections: number;
    queuedSections: number;
    batchId: string;
  }> {
    // Validate input
    const validatedOptions = GenerateOptionsSchema.parse(options);

    // Get all registered routes
    const routes = this.pluginContext.listRoutes();

    // Template resolver
    const templateResolver = (section: SectionDefinition): string => {
      if (!section.template) {
        throw new Error(`No template specified for section ${section.id}`);
      }
      return section.template;
    };

    // Generate content
    const result = await this.contentManager.generate(
      validatedOptions,
      routes,
      templateResolver,
      "site-content-preview",
      {
        source: `plugin:${this.pluginId}`,
        metadata: context ?? {
          interfaceId: "plugin",
          userId: "system",
          pluginId: this.pluginId,
          operationType: "content_generation",
        },
      },
      this.siteConfig,
    );

    return {
      jobs: result.jobs.map((job) => ({
        jobId: job.jobId,
        routeId: job.routeId,
        sectionId: job.sectionId,
      })),
      totalSections: result.totalSections,
      queuedSections: result.queuedSections,
      batchId: result.batchId,
    };
  }

  /**
   * Promote content from preview to production
   */
  async promoteContent(
    options: PromoteOptions,
    context?: JobContext,
  ): Promise<string> {
    // Get preview entities based on filters
    const previewEntities = await this.contentManager.getPreviewEntities({
      ...(options.routeId && { routeId: options.routeId }),
    });

    let entityIds: string[];
    if (options.sectionId) {
      entityIds = previewEntities
        .filter((e) => e.sectionId === options.sectionId)
        .map((e) => e.id);
    } else if (options.sections) {
      entityIds = previewEntities
        .filter((e) => options.sections?.includes(e.sectionId))
        .map((e) => e.id);
    } else {
      entityIds = previewEntities.map((e) => e.id);
    }

    if (entityIds.length === 0) {
      throw new Error("No preview content found to promote");
    }

    if (options.dryRun) {
      return `dry-run-${Date.now()}`;
    }

    // Promote using derive operation
    return this.contentManager.promote(entityIds, {
      source: `plugin:${this.pluginId}`,
      metadata: context ?? {
        interfaceId: "plugin",
        userId: "system",
        pluginId: this.pluginId,
        operationType: "content_promotion",
      },
    });
  }

  /**
   * Rollback production content
   */
  async rollbackContent(
    options: RollbackOptions,
    context?: JobContext,
  ): Promise<string> {
    // Get production entities based on filters
    const productionEntities = await this.contentManager.getProductionEntities({
      ...(options.routeId && { routeId: options.routeId }),
    });

    let entityIds: string[];
    if (options.sectionId) {
      entityIds = productionEntities
        .filter((e) => e.sectionId === options.sectionId)
        .map((e) => e.id);
    } else if (options.sections) {
      entityIds = productionEntities
        .filter((e) => options.sections?.includes(e.sectionId))
        .map((e) => e.id);
    } else {
      entityIds = productionEntities.map((e) => e.id);
    }

    if (entityIds.length === 0) {
      throw new Error("No production content found to rollback");
    }

    if (options.dryRun) {
      return `dry-run-${Date.now()}`;
    }

    // Rollback by deleting production entities
    return this.contentManager.rollback(entityIds, {
      source: `plugin:${this.pluginId}`,
      metadata: context ?? {
        interfaceId: "plugin",
        userId: "system",
        pluginId: this.pluginId,
        operationType: "content_rollback",
      },
    });
  }
}
