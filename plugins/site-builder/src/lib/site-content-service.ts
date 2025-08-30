import type { ServicePluginContext, JobContext } from "@brains/plugins";
import {
  GenerateOptionsSchema,
  type GenerateOptions,
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
}
