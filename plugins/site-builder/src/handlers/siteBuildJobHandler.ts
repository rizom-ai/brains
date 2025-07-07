import type { JobHandler } from "@brains/job-queue";
import type { Logger } from "@brains/utils";
import type { PluginContext } from "@brains/plugin-utils";
import { SiteBuilder } from "../site-builder";
import {
  siteBuildJobSchema,
  type SiteBuildJobData,
  type SiteBuildJobResult,
} from "../types/job-types";

/**
 * Job handler for site building operations
 */
export class SiteBuildJobHandler
  implements JobHandler<"site-build", SiteBuildJobData, SiteBuildJobResult>
{
  constructor(
    private logger: Logger,
    private context: PluginContext,
  ) {}

  async process(
    data: SiteBuildJobData,
    jobId: string,
  ): Promise<SiteBuildJobResult> {
    try {
      this.logger.info("Starting site build job", {
        jobId,
        environment: data.environment,
        outputDir: data.outputDir,
      });

      // Get or create site builder instance
      const siteBuilder = SiteBuilder.getInstance(
        this.logger.child("SiteBuilder"),
        this.context,
      );

      // Perform the build
      const result = await siteBuilder.build({
        outputDir: data.outputDir,
        workingDir: data.workingDir,
        enableContentGeneration: data.enableContentGeneration,
        environment: data.environment,
        siteConfig: data.siteConfig ?? {
          title: "Personal Brain",
          description: "A knowledge management system",
        },
      });

      this.logger.info("Site build job completed", {
        jobId,
        environment: data.environment,
        routesBuilt: result.routesBuilt,
        success: result.success,
      });

      return {
        success: result.success,
        routesBuilt: result.routesBuilt,
        outputDir: data.outputDir,
        environment: data.environment,
        ...(result.errors && { errors: result.errors }),
        ...(result.warnings && { warnings: result.warnings }),
      };
    } catch (error) {
      this.logger.error("Site build job failed", error);
      throw error;
    }
  }

  validateAndParse(data: unknown): SiteBuildJobData | null {
    try {
      return siteBuildJobSchema.parse(data);
    } catch (error) {
      this.logger.error("Invalid site build job data", { data, error });
      return null;
    }
  }

  async onError(
    error: Error,
    data: SiteBuildJobData,
    jobId: string,
  ): Promise<void> {
    this.logger.error("Site build job error handler triggered", {
      error: error.message,
      jobId,
      environment: data.environment,
      outputDir: data.outputDir,
    });
    // Could implement cleanup or notification logic here
  }
}
