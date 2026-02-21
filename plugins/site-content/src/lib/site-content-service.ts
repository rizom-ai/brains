import type { ServicePluginContext, JobContext } from "@brains/plugins";
import {
  GenerateOptionsSchema,
  type GenerateOptions,
} from "../schemas/generate-options";
import { SiteContentOperations } from "./site-content-operations";

/**
 * Service for managing site content operations
 */
export class SiteContentService {
  private readonly operations: SiteContentOperations;

  constructor(
    pluginContext: ServicePluginContext,
    private readonly siteConfig?: Record<string, unknown>,
  ) {
    this.operations = new SiteContentOperations(pluginContext);
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
    const validatedOptions = GenerateOptionsSchema.parse(options);
    return this.operations.generate(
      validatedOptions,
      this.siteConfig,
      metadata,
    );
  }
}
