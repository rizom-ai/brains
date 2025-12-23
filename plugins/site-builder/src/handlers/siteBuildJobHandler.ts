import type { ServicePluginContext } from "@brains/plugins";
import type { Logger, ProgressReporter } from "@brains/plugins";
import { BaseJobHandler } from "@brains/job-queue";
import type { SiteBuilder } from "../lib/site-builder";
import type { LayoutComponent, SiteBuilderConfig } from "../config";
import {
  siteBuildJobSchema,
  type SiteBuildJobData,
  type SiteBuildJobResult,
} from "../types/job-types";
import { pluralize } from "@brains/utils";

/**
 * Job handler for site building operations
 */
export class SiteBuildJobHandler extends BaseJobHandler<
  "site-build",
  SiteBuildJobData,
  SiteBuildJobResult
> {
  constructor(
    logger: Logger,
    private siteBuilder: SiteBuilder,
    private layouts: Record<string, LayoutComponent>,
    private defaultSiteConfig: SiteBuilderConfig["siteInfo"],
    private context: ServicePluginContext,
    private entityRouteConfig?: SiteBuilderConfig["entityRouteConfig"],
    private themeCSS?: string,
    private previewUrl?: string,
    private productionUrl?: string,
  ) {
    super(logger, { jobTypeName: "site-build" });
  }

  override validateAndParse(data: unknown): SiteBuildJobData | null {
    try {
      const result = siteBuildJobSchema.parse(data);
      this.logger.debug(`${this.jobTypeName} job data validation successful`, {
        data: this.summarizeDataForLog(result),
      });
      return result;
    } catch (error) {
      this.logger.warn(`Invalid ${this.jobTypeName} job data`, { data, error });
      return null;
    }
  }

  /**
   * Generate URL for an entity detail page
   */
  private generateEntityUrl(entityType: string, slug: string): string {
    const config = this.entityRouteConfig?.[entityType];

    if (config) {
      // Use custom config
      const pluralName = config.pluralName ?? config.label.toLowerCase() + "s";
      return `/${pluralName}/${slug}`;
    }

    // Fall back to auto-generated pluralization
    const pluralName = pluralize(entityType);
    return `/${pluralName}/${slug}`;
  }

  async process(
    data: SiteBuildJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<SiteBuildJobResult> {
    try {
      this.logger.debug("Starting site build job", {
        jobId,
        environment: data.environment,
        outputDir: data.outputDir,
      });

      // Report initial progress
      await progressReporter.report({
        progress: 0,
        total: 100,
        message: `Starting site build for ${data.environment} environment`,
      });

      // Use the injected site builder instance
      const siteBuilder = this.siteBuilder;

      // Create a sub-reporter that maps build progress to job progress
      const buildProgressReporter = progressReporter.createSub({
        scale: { start: 10, end: 90 },
      });

      // Perform the build
      const result = await siteBuilder.build(
        {
          outputDir: data.outputDir,
          workingDir: data.workingDir,
          enableContentGeneration: data.enableContentGeneration,
          environment: data.environment,
          cleanBeforeBuild: true,
          siteConfig: data.siteConfig ?? this.defaultSiteConfig,
          layouts: this.layouts,
          themeCSS: this.themeCSS,
        },
        buildProgressReporter.toCallback(),
      );

      // Report completion
      await progressReporter.report({
        progress: 100,
        total: 100,
        message: `Site build completed: ${result.routesBuilt} routes built`,
      });

      this.logger.debug("Site build job completed", {
        jobId,
        environment: data.environment,
        routesBuilt: result.routesBuilt,
        success: result.success,
      });

      // Emit site:build:completed event for other plugins to hook into
      if (result.success) {
        this.logger.info(
          `Emitting site:build:completed event for ${data.environment} environment`,
        );

        // Select environment-specific URL from config
        const configUrl =
          data.environment === "preview"
            ? (this.previewUrl ?? this.productionUrl)
            : this.productionUrl;

        // Build full URL from domain (add https:// if not present)
        const url = configUrl
          ? configUrl.startsWith("http://") || configUrl.startsWith("https://")
            ? configUrl
            : `https://${configUrl}`
          : undefined;

        await this.context.sendMessage("site:build:completed", {
          outputDir: data.outputDir,
          environment: data.environment,
          routesBuilt: result.routesBuilt,
          siteConfig: {
            ...(data.siteConfig ?? this.defaultSiteConfig),
            url,
          },
          generateEntityUrl: this.generateEntityUrl.bind(this),
        });
      }

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

  protected override summarizeDataForLog(
    data: SiteBuildJobData,
  ): Record<string, unknown> {
    return {
      environment: data.environment,
      outputDir: data.outputDir,
    };
  }
}
