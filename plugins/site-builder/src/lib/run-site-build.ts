import { EntityUrlGenerator } from "@brains/site-composition";
import type { ProgressCallback } from "@brains/utils/progress";
import { ProgressReporter } from "@brains/utils/progress";
import { getErrorMessage } from "@brains/utils/error";
import { randomUUID } from "crypto";
import { join } from "path";
import type {
  BuildResult,
  SiteBuildDiagnostic,
  SiteBuildDiagnosticCode,
  SiteBuilderOptions,
} from "../types/site-builder-types";
import { SiteBuilderOptionsSchema } from "../types/site-builder-types";
import type { SiteBuildStagingPayload } from "../types/job-types";
import { collectBuildRoutes } from "./collect-build-routes";
import { createBuildContext } from "./create-build-context";
import { createStaticSiteBuilder } from "./create-static-site-builder";
import { generateSiteRoutes } from "./generate-site-routes";
import { prepareSiteBuild } from "./prepare-site-build";
import { prepareSiteImages } from "./prepare-site-images";
import { runStaticSiteBuild } from "./run-static-site-build";
import type { BuildPipelineContext } from "./build-pipeline-context";
import {
  createCancelledBuildResult,
  createFailedBuildResult,
  createSuccessfulBuildResult,
} from "./site-build-result";
import {
  formatSiteBuildDiagnostic,
  preflightSiteBuild,
} from "./preflight-site-build";
import type { StaticSiteBuilderFactory } from "./static-site-builder";
import { writeSiteBuildSeoFiles } from "./seo-file-handler";
import {
  TransactionalSiteBuildOutput,
  type SiteBuildOutputLifecycle,
  type SiteBuildOutputTarget,
} from "./site-build-output-lifecycle";

export interface RunSiteBuildOptions {
  buildOptions: SiteBuilderOptions;
  progress: ProgressCallback | undefined;
  pipelineContext: BuildPipelineContext;
  staticSiteBuilderFactory: StaticSiteBuilderFactory;
  outputLifecycle?: SiteBuildOutputLifecycle | undefined;
  signal: AbortSignal;
}

export async function runSiteBuild(
  options: RunSiteBuildOptions,
): Promise<BuildResult> {
  const parsedOptions = SiteBuilderOptionsSchema.parse(options.buildOptions);

  const reporter = ProgressReporter.from(options.progress);
  const warnings: string[] = [];
  const diagnostics: SiteBuildDiagnostic[] = [];
  const outputLifecycle =
    options.outputLifecycle ??
    new TransactionalSiteBuildOutput(options.pipelineContext.logger);
  let outputTarget: SiteBuildOutputTarget | undefined;
  let failureCode: SiteBuildDiagnosticCode = "build-failed";
  let commitStarted = false;

  try {
    options.signal.throwIfAborted();
    await reporter?.report({
      message: "Starting site build",
      progress: 0,
      total: 100,
    });

    await reporter?.report({
      message: "Generating dynamic routes",
      progress: 10,
      total: 100,
    });
    options.signal.throwIfAborted();

    await generateSiteRoutes({
      pipelineContext: options.pipelineContext,
      publishedOnly: parsedOptions.environment === "production",
    });
    options.signal.throwIfAborted();

    const buildRoutes = collectBuildRoutes(
      options.pipelineContext.routeRegistry,
    );
    warnings.push(...buildRoutes.warnings);
    const { routes } = buildRoutes;

    const preflight = preflightSiteBuild({
      routes,
      layouts: parsedOptions.layouts,
      getViewTemplate: options.pipelineContext.services.getViewTemplate,
      staticAssets: options.buildOptions.staticAssets,
    });
    diagnostics.push(...preflight.diagnostics);
    warnings.push(...preflight.warnings.map(formatSiteBuildDiagnostic));

    if (preflight.errors.length > 0) {
      return createFailedBuildResult({
        outputDir: parsedOptions.outputDir,
        errorMessages: preflight.errors.map(formatSiteBuildDiagnostic),
        diagnostics,
      });
    }

    await reporter?.report({
      message: `Preparing ${routes.length} routes`,
      progress: 20,
      total: 100,
    });

    await reporter?.report({
      message: "Resolving images",
      progress: 25,
      total: 100,
    });

    const imageBuildService = await prepareSiteImages({
      pipelineContext: options.pipelineContext,
      sharedImagesDir: parsedOptions.sharedImagesDir,
      signal: options.signal,
    });
    const preparation = await prepareSiteBuild({
      buildId: randomUUID(),
      routes,
      parsedOptions,
      buildOptions: options.buildOptions,
      pipelineContext: options.pipelineContext,
      imageBuildService,
      siteMetadata: parsedOptions.siteConfig,
      publicDir: join(process.cwd(), "public"),
      signal: options.signal,
    });
    diagnostics.push(...preparation.diagnostics);
    const preparationWarnings = preparation.diagnostics.filter(
      (diagnostic) => diagnostic.severity === "warning",
    );
    warnings.push(...preparationWarnings.map(formatSiteBuildDiagnostic));
    const preparationErrors = preparation.diagnostics.filter(
      (diagnostic) => diagnostic.severity === "error",
    );
    if (preparationErrors.length > 0) {
      return createFailedBuildResult({
        outputDir: parsedOptions.outputDir,
        errorMessages: preparationErrors.map(formatSiteBuildDiagnostic),
        diagnostics,
      });
    }

    options.signal.throwIfAborted();
    const buildContext = createBuildContext({
      preparedBuild: preparation.preparedBuild,
      layouts: parsedOptions.layouts,
      slots: options.buildOptions.slots,
      pipelineContext: options.pipelineContext,
    });
    outputTarget = await outputLifecycle.begin({
      outputDir: parsedOptions.outputDir,
      environment: parsedOptions.environment,
      buildId: preparation.preparedBuild.buildId,
      configuredWorkingDir: parsedOptions.workingDir,
    });
    options.signal.throwIfAborted();
    const staticSiteBuilder = await createStaticSiteBuilder({
      logger: options.pipelineContext.logger,
      outputDir: outputTarget.generationDir,
      workingDir: outputTarget.workingDir,
      cleanBeforeBuild: parsedOptions.cleanBeforeBuild,
      staticSiteBuilderFactory: options.staticSiteBuilderFactory,
      signal: options.signal,
    });
    options.signal.throwIfAborted();

    await reporter?.report({
      message: "Preparing site extension artifacts",
      progress: 82,
      total: 100,
    });
    const stagingPayload: SiteBuildStagingPayload = {
      outputDir: outputTarget.generationDir,
      environment: preparation.preparedBuild.environment,
      routesBuilt: preparation.preparedBuild.routes.length,
      siteConfig: preparation.preparedBuild.site,
      generateEntityUrl: (entityType, slug) =>
        EntityUrlGenerator.getInstance().generateUrl(entityType, slug),
    };
    await options.pipelineContext.services.sendMessage({
      type: "site:build:staging",
      payload: stagingPayload,
      broadcast: true,
    });
    options.signal.throwIfAborted();

    await runStaticSiteBuild({
      staticSiteBuilder,
      buildContext,
      reporter,
      signal: options.signal,
    });

    failureCode = "output-commit-failed";
    await reporter?.report({
      message: "Generating SEO artifacts",
      progress: 96,
      total: 100,
    });
    await writeSiteBuildSeoFiles({
      outputDir: outputTarget.generationDir,
      preparedBuild: preparation.preparedBuild,
      logger: options.pipelineContext.logger,
      signal: options.signal,
    });

    await reporter?.report({
      message: "Validating and publishing site generation",
      progress: 97,
      total: 100,
    });
    options.signal.throwIfAborted();
    commitStarted = true;
    const commitResult = await outputLifecycle.commit({
      target: outputTarget,
      preparedBuild: preparation.preparedBuild,
      warnings,
    });
    outputTarget = undefined;

    await reporter
      ?.report({
        message: "Site build complete",
        progress: 100,
        total: 100,
      })
      .catch(() => {
        // Publication has committed; progress delivery must not change success.
      });

    return createSuccessfulBuildResult({
      outputDir: parsedOptions.outputDir,
      filesGenerated: commitResult.filesGenerated,
      routesBuilt: routes.length,
      warnings,
      diagnostics,
    });
  } catch (error) {
    if (outputTarget) {
      try {
        await outputLifecycle.abort(outputTarget);
      } catch (abortError) {
        options.pipelineContext.logger.warn(
          "Failed to clean aborted site build output",
          { error: abortError },
        );
      }
    }
    if (options.signal.aborted && !commitStarted) {
      const reason = getErrorMessage(options.signal.reason ?? error);
      const diagnostic: SiteBuildDiagnostic = {
        severity: "error",
        code: "build-cancelled",
        message: `Site build cancelled: ${reason}`,
      };
      options.pipelineContext.logger.info(diagnostic.message);
      return createCancelledBuildResult({
        outputDir: parsedOptions.outputDir,
        message: formatSiteBuildDiagnostic(diagnostic),
        diagnostics: [...diagnostics, diagnostic],
      });
    }
    const messagePrefix =
      failureCode === "output-commit-failed"
        ? "Site output commit failed"
        : "Site build process failed";
    const diagnostic: SiteBuildDiagnostic = {
      severity: "error",
      code: failureCode,
      message: `${messagePrefix}: ${getErrorMessage(error)}`,
    };
    const buildError = new Error(diagnostic.message);
    options.pipelineContext.logger.error("Site build failed", {
      error: buildError,
      originalError: error,
    });

    return createFailedBuildResult({
      outputDir: parsedOptions.outputDir,
      errorMessages: [formatSiteBuildDiagnostic(diagnostic)],
      diagnostics: [...diagnostics, diagnostic],
    });
  }
}
