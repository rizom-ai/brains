import { BaseJobHandler } from "@brains/plugins";
import type { ServicePluginContext } from "@brains/plugins";
import type { Logger, ProgressReporter } from "@brains/utils";
import type { ISiteBuilder } from "../types/site-builder-types";
import type { LayoutComponent, LayoutSlots } from "@brains/site-engine";
import type { SiteBuilderConfig } from "../config";
import {
  siteBuildJobSchema,
  type SiteBuildJobData,
  type SiteBuildJobResult,
} from "../types/job-types";
import { EntityUrlGenerator } from "@brains/site-composition";
import { resolveSiteMetadata } from "../lib/site-metadata";

export interface SiteBuildJobHandlerConfig {
  siteBuilder: ISiteBuilder;
  layouts: Record<string, LayoutComponent>;
  defaultSiteConfig: SiteBuilderConfig["siteInfo"];
  sharedImagesDir: string;
  siteUrl?: string | undefined;
  previewUrl?: string | undefined;
  themeCSS?: string | undefined;
  slots?: LayoutSlots | undefined;
  getHeadScripts?: (() => string[]) | undefined;
  /** Inline static assets supplied by the SitePackage (e.g. canvas scripts) */
  staticAssets?: Record<string, string> | undefined;
}

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
    private sendMessage: ServicePluginContext["messaging"]["send"],
    private cfg: SiteBuildJobHandlerConfig,
  ) {
    super(logger, {
      schema: siteBuildJobSchema,
      jobTypeName: "site-build",
    });
  }

  async process(
    data: SiteBuildJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<SiteBuildJobResult> {
    // Apply defaults for optional fields
    const environment = data.environment ?? "preview";
    const enableContentGeneration = data.enableContentGeneration ?? false;

    try {
      this.logger.debug("Starting site build job", {
        jobId,
        environment,
        outputDir: data.outputDir,
      });

      // Report initial progress
      await progressReporter.report({
        progress: 0,
        total: 100,
        message: `Starting site build for ${environment} environment`,
      });

      // Create a sub-reporter that maps build progress to job progress
      const buildProgressReporter = progressReporter.createSub({
        scale: { start: 10, end: 90 },
      });

      const siteConfig = await resolveSiteMetadata(
        this.sendMessage,
        data.siteConfig ?? this.cfg.defaultSiteConfig,
      );

      // Perform the build
      const result = await this.cfg.siteBuilder.build(
        {
          outputDir: data.outputDir,
          workingDir: data.workingDir,
          sharedImagesDir: this.cfg.sharedImagesDir,
          enableContentGeneration,
          environment,
          cleanBeforeBuild: true,
          siteConfig,
          layouts: this.cfg.layouts,
          themeCSS: this.cfg.themeCSS,
          slots: this.cfg.slots,
          headScripts: this.cfg.getHeadScripts?.(),
          ...(this.cfg.staticAssets && {
            staticAssets: this.cfg.staticAssets,
          }),
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
        environment,
        routesBuilt: result.routesBuilt,
        success: result.success,
      });

      // Emit site:build:completed event for other plugins to hook into
      if (result.success) {
        this.logger.info(
          `Emitting site:build:completed event for ${environment} environment`,
        );

        // Select environment-specific URL from config
        const url =
          environment === "preview"
            ? (this.cfg.previewUrl ?? this.cfg.siteUrl)
            : this.cfg.siteUrl;

        await this.sendMessage({
          type: "site:build:completed",
          payload: {
            outputDir: data.outputDir,
            environment,
            routesBuilt: result.routesBuilt,
            siteConfig: {
              ...siteConfig,
              url,
            },
            generateEntityUrl: (entityType: string, slug: string) =>
              EntityUrlGenerator.getInstance().generateUrl(entityType, slug),
          },
          broadcast: true,
        });
      }

      return {
        success: result.success,
        routesBuilt: result.routesBuilt,
        outputDir: data.outputDir,
        environment,
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
