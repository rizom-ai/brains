import { SITE_CHANNELS } from "@brains/contracts";
import {
  SdkError,
  type LoggerContract,
  type ServicePublisher,
} from "@brains/sdk/services";
import { CallbackProgressReporter } from "@brains/utils/progress";
import { getErrorMessage } from "@brains/utils/error";
import { EntityUrlGenerator } from "@brains/site-composition";
import type { LayoutComponent, LayoutSlots } from "@brains/site-engine";
import type { ISiteBuilder } from "../types/site-builder-types";
import type { EntityDisplayMap, SiteBuilderConfig } from "../config";
import { siteBuildJob } from "../lib/site-build-job";
import type { SiteBuildJobResult } from "../types/job-types";
import { resolveSiteMetadata } from "../lib/site-metadata";
import type { SiteBuildStatusService } from "../lib/site-build-status";

/**
 * The five transitions this handler records. The service does more; asking
 * for all of it meant a test could not record a subset without asserting it
 * was the whole service.
 */
export type BuildStatusRecorder = Pick<
  SiteBuildStatusService,
  | "markBuilding"
  | "markSuccess"
  | "markSkipped"
  | "markCancelled"
  | "markFailure"
>;

export interface SiteBuildJobHandlerConfig {
  siteBuilder: ISiteBuilder;
  entityDisplay?: EntityDisplayMap | undefined;
  messaging: ServicePublisher;
  logger: LoggerContract;
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
  slots?: LayoutSlots | undefined;
  getHeadScripts?: (() => string[]) | undefined;
  /** Inline static assets supplied by the SitePackage (e.g. canvas scripts) */
  staticAssets?: Record<string, string> | undefined;
  statusService?: BuildStatusRecorder | undefined;
}

/**
 * Render the site, and record what became of the attempt.
 *
 * The build itself is the site builder's; this owns the bookkeeping around
 * it — which environment was rendered, whether it succeeded, and telling
 * whoever waits on a finished site that one exists.
 */
export function handleSiteBuild(
  cfg: SiteBuildJobHandlerConfig,
): ReturnType<typeof siteBuildJob.handle> {
  return siteBuildJob.handle(async ({ input, jobId, progress, signal }) => {
    const environment = input.environment ?? "preview";
    const enableContentGeneration = input.enableContentGeneration ?? false;
    let failureRecorded = false;

    await recordStatus(
      cfg,
      () => cfg.statusService?.markBuilding(environment, jobId),
      "building",
    );

    try {
      cfg.logger.debug("Starting site build job", {
        jobId,
        environment,
        outputDir: input.outputDir,
      });

      await progress.report({
        progress: 0,
        total: 100,
        message: `Starting site build for ${environment} environment`,
      });

      // The build reports its own 0-100; map it onto the middle of the job.
      const buildProgress = CallbackProgressReporter.from(
        async (notification) => progress.report(notification),
      )?.createSub({ scale: { start: 10, end: 90 } });

      const siteConfig = await resolveSiteMetadata(
        cfg.messaging.request,
        input.siteConfig ?? cfg.defaultSiteConfig,
      );
      const configuredSiteUrl =
        environment === "preview"
          ? (cfg.previewUrl ?? cfg.siteUrl)
          : cfg.siteUrl;
      const siteUrl = cfg.preferLocalUrls
        ? (cfg.localSiteUrl ?? configuredSiteUrl)
        : configuredSiteUrl;

      const result = await cfg.siteBuilder.build(
        {
          outputDir: input.outputDir,
          workingDir: input.workingDir,
          sharedImagesDir: cfg.sharedImagesDir,
          enableContentGeneration,
          environment,
          signal,
          cleanBeforeBuild: true,
          siteConfig,
          siteUrl,
          layouts: cfg.layouts,
          themeCSS: cfg.themeCSS,
          slots: cfg.slots,
          headScripts: cfg.getHeadScripts?.(),
          ...(cfg.staticAssets && { staticAssets: cfg.staticAssets }),
        },
        buildProgress?.toCallback(),
      );

      await recordOutcome(cfg, environment, jobId, result);

      // Declared jobs return data, not native failure envelopes. Throw so
      // ordinary failures/cancellations reach the queue's retry policy.
      // A superseded request ends here; it does not certify its replacement.
      if (!result.success && !result.superseded) {
        failureRecorded = true;
        throw new SdkError(result.cancelled ? "cancelled" : "handler_failed", {
          cause: result,
        });
      }

      await progress.report({
        progress: 100,
        total: 100,
        message: result.cancelled
          ? "Site build cancelled"
          : `Site build completed: ${result.routesBuilt} routes built`,
      });

      cfg.logger.debug("Site build job completed", {
        jobId,
        environment,
        routesBuilt: result.routesBuilt,
        success: result.success,
        cancelled: result.cancelled ?? false,
      });

      // A skipped build publishes nothing, so completion hooks must not run.
      if (result.success && !result.skipped) {
        cfg.logger.info(
          `Emitting site:build:completed event for ${environment} environment`,
        );
        await cfg.messaging.publish({
          topic: SITE_CHANNELS.buildCompleted,
          data: {
            outputDir: input.outputDir,
            environment,
            routesBuilt: result.routesBuilt,
            siteConfig: { ...siteConfig, url: siteUrl },
            generateEntityUrl: (entityType: string, slug: string): string =>
              new EntityUrlGenerator(cfg.entityDisplay).generateUrl(
                entityType,
                slug,
              ),
          },
        });
      }

      return {
        success: result.success || result.superseded === true,
        ...(result.cancelled && { cancelled: true }),
        ...(result.skipped && { skipped: true }),
        routesBuilt: result.routesBuilt,
        outputDir: input.outputDir,
        environment,
        ...(result.errors && { errors: result.errors }),
        ...(result.warnings && { warnings: result.warnings }),
        ...(result.diagnostics && { diagnostics: result.diagnostics }),
      };
    } catch (error) {
      if (!failureRecorded) {
        await recordStatus(
          cfg,
          () =>
            cfg.statusService?.markFailure(
              environment,
              jobId,
              getErrorMessage(error, "Site build failed"),
            ),
          "failure",
        );
      }
      cfg.logger.error("Site build job failed", error);
      throw error;
    }
  });
}

/** Which of the four terminal states this build reached. */
async function recordOutcome(
  cfg: SiteBuildJobHandlerConfig,
  environment: "preview" | "production",
  jobId: string,
  result: Pick<
    SiteBuildJobResult,
    "success" | "skipped" | "cancelled" | "routesBuilt" | "errors" | "warnings"
  >,
): Promise<void> {
  if (result.success && result.skipped) {
    await recordStatus(
      cfg,
      () =>
        cfg.statusService?.markSkipped(environment, jobId, result.routesBuilt),
      "skipped",
    );
    return;
  }
  if (result.success) {
    await recordStatus(
      cfg,
      () =>
        cfg.statusService?.markSuccess(
          environment,
          jobId,
          result.routesBuilt,
          result.warnings ?? [],
        ),
      "success",
    );
    return;
  }
  if (result.cancelled) {
    await recordStatus(
      cfg,
      () =>
        cfg.statusService?.markCancelled(
          environment,
          jobId,
          result.errors?.join("; ") ?? "Site build cancelled",
        ),
      "cancelled",
    );
    return;
  }
  await recordStatus(
    cfg,
    () =>
      cfg.statusService?.markFailure(
        environment,
        jobId,
        result.errors?.join("; ") ?? "Site build failed",
      ),
    "failure",
  );
}

async function recordStatus(
  cfg: SiteBuildJobHandlerConfig,
  update: () => Promise<void> | undefined,
  state: string,
): Promise<void> {
  try {
    await update();
  } catch (error) {
    // Reconciliation recovers the state, the build outcome stands, and the
    // failure is loud in the logs.
    cfg.logger.error(`Failed to record site build ${state} state`, { error });
  }
}
