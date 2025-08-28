import type { ServicePluginContext, JobContext } from "@brains/plugins";
import {
  GenerateOptionsSchema,
  type GenerateOptions,
  type PromoteOptions,
  type RollbackOptions,
} from "../types/content-schemas";
import { SiteContentOperations } from "./site-content-operations";
import type { RouteRegistry } from "./route-registry";

/**
 * Service for managing site content operations
 */
export class SiteContentService {
  private readonly operations: SiteContentOperations;

  constructor(
    pluginContext: ServicePluginContext,
    routeRegistry: RouteRegistry,
    private readonly siteConfig?: Record<string, unknown>,
  ) {
    this.operations = new SiteContentOperations(pluginContext, routeRegistry);
  }

  /**
   * Generate content for routes
   */
  async generateContent(
    options: GenerateOptions,
    metadata?: Partial<JobContext>,
  ): Promise<{
    jobs: Array<{ jobId: string; routeId: string; sectionId: string }>;
    totalSections: number;
    queuedSections: number;
    batchId: string;
  }> {
    // Validate input
    const validatedOptions = GenerateOptionsSchema.parse(options);

    // Generate content
    const result = await this.operations.generate(
      validatedOptions,
      this.siteConfig,
      metadata,
    );

    return result;
  }

  /**
   * Promote content from preview to production
   */
  async promoteContent(
    options: PromoteOptions,
    metadata?: Partial<JobContext>,
  ): Promise<string> {
    // Get preview entities based on filters
    const previewEntities = await this.operations.getPreviewEntities({
      ...(options.routeId && { routeId: options.routeId }),
    });

    let entityIds: string[];
    if (options.sectionId) {
      entityIds = previewEntities
        .filter((e) => e.sectionId === options.sectionId)
        .map((e) => e.id);
    } else if (options.sections && options.sections.length > 0) {
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
    return this.operations.promote(entityIds, metadata);
  }

  /**
   * Rollback production content
   */
  async rollbackContent(
    options: RollbackOptions,
    metadata?: Partial<JobContext>,
  ): Promise<string> {
    // Get production entities based on filters
    const productionEntities = await this.operations.getProductionEntities({
      ...(options.routeId && { routeId: options.routeId }),
    });

    let entityIds: string[];
    if (options.sectionId) {
      entityIds = productionEntities
        .filter((e) => e.sectionId === options.sectionId)
        .map((e) => e.id);
    } else if (options.sections && options.sections.length > 0) {
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
    return this.operations.rollback(entityIds, metadata);
  }
}
