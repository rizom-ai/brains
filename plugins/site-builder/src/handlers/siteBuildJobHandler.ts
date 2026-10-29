import { BaseJobHandler } from "@brains/plugins";
import { SITE_CHANNELS } from "@brains/contracts";
import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import type { ProgressReporter } from "@brains/utils/progress";
import type { ISiteBuilder } from "../types/site-builder-types";
import type { LayoutComponent, LayoutSlots } from "@brains/site-engine";
import type { EntityDisplayMap, SiteBuilderConfig } from "../config";
import {
  siteBuildJobSchema,
  type SiteBuildJobData,
  type SiteBuildJobResult,
} from "../types/job-types";
import { EntityUrlGenerator } from "@brains/site-composition";
import { resolveSiteMetadata } from "../lib/site-metadata";
import type {
  SiteBuildEnvironment,
  SiteBuildStatusService,
} from "../lib/site-build-status";

/**
 * The transitions this handler records, and whether the last build failed. The
 * service does more; asking for all of it meant a test could not record a
 * subset without asserting it was the whole service.
 */
export type BuildStatusRecorder = Pick<
  SiteBuildStatusService,
  | "hasUnresolvedFailure"
  | "markBuilding"
  | "markSuccess"
  | "markSkipped"
  | "markCancelled"
  | "markFailure"
>;
import { getErrorMessage } from "@brains/utils/error";

export interface SiteBuildJobHandlerConfig {
  siteBuilder: ISiteBuilder;
  /** The site's entity display as the shell resolved it, for entity URLs. */
  entityDisplay?: EntityDisplayMap | undefined;
  layouts: Record<string, LayoutComponent>;
  defaultSiteConfig: SiteBuilderConfig["siteInfo"];
  sharedImagesDir: string;
  siteUrl?: string | undefined;
  previewUrl?: string | undefined;
  /** Local runtime URL, such as http://localhost:8080. */
  localSiteUrl?: string | undefined;
  /** Prefer local URLs while the app is running outside deployed production. */
  preferLocalUrls?: boolean | undefined;
  themeCSS?: string | undefined;
  /** Asked on every build: each plugin's slot contributions. */
  getSlots?: (() => Promise<LayoutSlots>) | undefined;
  /** Asked on every build: the site package's scripts plus plugins' answers. */
  getHeadScripts?: (() => Promise<string[]>) | undefined;
  /** Inline static assets supplied by the SitePackage (e.g. canvas scripts) */
  staticAssets?: Record<string, string> | undefined;
  /** The site's languages, the first its default. */
  languages?: string[] | undefined;
  statusService?: BuildStatusRecorder | undefined;
}

/**
 * Job handler for site building operations
 */
export class SiteBuildJobHandler extends BaseJobHandler<
  "site-build",
  SiteBuildJobData,
  SiteBuildJobResult
> {
  private sendMessage: ServicePluginContext["messaging"]["send"];
  private cfg: SiteBuildJobHandlerConfig;
  constructor(
    logger: Logger,
    sendMessage: ServicePluginContext["messaging"]["send"],
    cfg: SiteBuildJobHandlerConfig,
  ) {
    super(logger, {
      schema: siteBuildJobSchema,
      jobTypeName: "site-build",
      // One build at a time: two builds' memory peaks would add up.
      exclusive: true,
      // A book brain builds thousands of pages: Karl's 4,198 took 11 minutes.
      executionTimeoutMs: 30 * 60_000,
    });
    this.sendMessage = sendMessage;
    this.cfg = cfg;
  }

  async process(
    data: SiteBuildJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<SiteBuildJobResult> {
    // Apply defaults for optional fields
    const environment = data.environment ?? "preview";
    const enableContentGeneration = data.enableContentGeneration ?? false;

    // Unchanged inputs would skip the render, but after a failure the output
    // is rebuilt rather than trusted.
    const publishUnchanged = await this.lastBuildFailed(environment);
    await this.recordStatus(
      () => this.cfg.statusService?.markBuilding(environment, jobId),
      "building",
    );

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
      const configuredSiteUrl =
        environment === "preview"
          ? (this.cfg.previewUrl ?? this.cfg.siteUrl)
          : this.cfg.siteUrl;
      const siteUrl = this.cfg.preferLocalUrls
        ? (this.cfg.localSiteUrl ?? configuredSiteUrl)
        : configuredSiteUrl;

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
          siteUrl,
          layouts: this.cfg.layouts,
          themeCSS: this.cfg.themeCSS,
          slots: await this.cfg.getSlots?.(),
          headScripts: await this.cfg.getHeadScripts?.(),
          ...(this.cfg.staticAssets && {
            staticAssets: this.cfg.staticAssets,
          }),
          ...(this.cfg.languages && { languages: this.cfg.languages }),
          publishUnchanged,
        },
        buildProgressReporter.toCallback(),
      );

      if (result.success && result.skipped) {
        await this.recordStatus(
          () =>
            this.cfg.statusService?.markSkipped(
              environment,
              jobId,
              result.routesBuilt,
            ),
          "skipped",
        );
      } else if (result.success) {
        await this.recordStatus(
          () =>
            this.cfg.statusService?.markSuccess(
              environment,
              jobId,
              result.routesBuilt,
              result.warnings ?? [],
            ),
          "success",
        );
      } else if (result.cancelled) {
        await this.recordStatus(
          () =>
            this.cfg.statusService?.markCancelled(
              environment,
              jobId,
              result.errors?.join("; ") ?? "Site build cancelled",
            ),
          "cancelled",
        );
      } else {
        await this.recordStatus(
          () =>
            this.cfg.statusService?.markFailure(
              environment,
              jobId,
              result.errors?.join("; ") ?? "Site build failed",
            ),
          "failure",
        );
      }

      // Report completion
      await progressReporter.report({
        progress: 100,
        total: 100,
        message: result.cancelled
          ? "Site build cancelled"
          : `Site build completed: ${result.routesBuilt} routes built`,
      });

      this.logger.debug("Site build job completed", {
        jobId,
        environment,
        routesBuilt: result.routesBuilt,
        success: result.success,
        cancelled: result.cancelled ?? false,
      });

      // A skipped build publishes nothing, so completion hooks must not run.
      if (result.success && !result.skipped) {
        this.logger.info(
          `Emitting site:build:completed event for ${environment} environment`,
        );

        await this.sendMessage({
          type: SITE_CHANNELS.buildCompleted,
          payload: {
            outputDir: data.outputDir,
            environment,
            routesBuilt: result.routesBuilt,
            siteConfig: {
              ...siteConfig,
              url: siteUrl,
            },
            generateEntityUrl: (entityType: string, slug: string) =>
              new EntityUrlGenerator(this.cfg.entityDisplay).generateUrl(
                entityType,
                slug,
              ),
          },
          broadcast: true,
        });
      }

      // A superseded build's request is served by the build that replaced
      // it, so its job is done; any other cancellation is retried.
      const completed = result.success || result.superseded === true;
      return {
        success: completed,
        // The queue records this as the failure, which Site then shows.
        ...(!completed && {
          error: result.errors?.join("; ") ?? "Site build failed",
        }),
        ...(result.cancelled && { cancelled: true }),
        ...(result.skipped && { skipped: true }),
        routesBuilt: result.routesBuilt,
        outputDir: data.outputDir,
        environment,
        ...(result.errors && { errors: result.errors }),
        ...(result.warnings && { warnings: result.warnings }),
        ...(result.diagnostics && { diagnostics: result.diagnostics }),
      };
    } catch (error) {
      await this.recordStatus(
        () =>
          this.cfg.statusService?.markFailure(
            environment,
            jobId,
            getErrorMessage(error, "Site build failed"),
          ),
        "failure",
      );
      this.logger.error("Site build job failed", error);
      throw error;
    }
  }

  private async lastBuildFailed(
    environment: SiteBuildEnvironment,
  ): Promise<boolean> {
    try {
      return (
        (await this.cfg.statusService?.hasUnresolvedFailure(environment)) ??
        false
      );
    } catch (error) {
      // Unreadable status costs at most a skipped render; the build goes on.
      this.logger.error("Failed to read the last site build outcome", {
        error,
      });
      return false;
    }
  }

  private async recordStatus(
    update: () => Promise<void> | undefined,
    state: string,
  ): Promise<void> {
    try {
      await update();
    } catch (error) {
      // Reconciliation recovers the state, the build outcome stands, and the
      // failure is loud in the logs.
      this.logger.error(`Failed to record site build ${state} state`, {
        error,
      });
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
