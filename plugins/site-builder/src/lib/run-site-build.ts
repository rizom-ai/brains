import type { ProgressCallback } from "@brains/utils/progress";
import { ProgressReporter } from "@brains/utils/progress";
import { getErrorMessage } from "@brains/utils/error";
import { randomUUID } from "crypto";
import type {
  BuildResult,
  SiteBuildDiagnostic,
  SiteBuilderOptions,
} from "../types/site-builder-types";
import { SiteBuilderOptionsSchema } from "../types/site-builder-types";
import { collectBuildRoutes } from "./collect-build-routes";
import { createBuildContext } from "./create-build-context";
import { createStaticSiteBuilder } from "./create-static-site-builder";
import { generateSiteRoutes } from "./generate-site-routes";
import { prepareSiteBuild } from "./prepare-site-build";
import { prepareSiteImages } from "./prepare-site-images";
import { runStaticSiteBuild } from "./run-static-site-build";
import type { BuildPipelineContext } from "./build-pipeline-context";
import {
  createFailedBuildResult,
  createSuccessfulBuildResult,
} from "./site-build-result";
import {
  formatSiteBuildDiagnostic,
  preflightSiteBuild,
} from "./preflight-site-build";
import type { StaticSiteBuilderFactory } from "./static-site-builder";

export interface RunSiteBuildOptions {
  buildOptions: SiteBuilderOptions;
  progress: ProgressCallback | undefined;
  pipelineContext: BuildPipelineContext;
  staticSiteBuilderFactory: StaticSiteBuilderFactory;
}

export async function runSiteBuild(
  options: RunSiteBuildOptions,
): Promise<BuildResult> {
  const parsedOptions = SiteBuilderOptionsSchema.parse(options.buildOptions);

  const reporter = ProgressReporter.from(options.progress);
  const warnings: string[] = [];
  const diagnostics: SiteBuildDiagnostic[] = [];

  try {
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

    await generateSiteRoutes({
      pipelineContext: options.pipelineContext,
      publishedOnly: parsedOptions.environment === "production",
    });

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
    });
    const preparation = await prepareSiteBuild({
      buildId: randomUUID(),
      routes,
      parsedOptions,
      buildOptions: options.buildOptions,
      pipelineContext: options.pipelineContext,
      imageBuildService,
      siteMetadata: parsedOptions.siteConfig,
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

    const buildContext = createBuildContext({
      preparedBuild: preparation.preparedBuild,
      layouts: parsedOptions.layouts,
      slots: options.buildOptions.slots,
      pipelineContext: options.pipelineContext,
    });
    const staticSiteBuilder = await createStaticSiteBuilder({
      logger: options.pipelineContext.logger,
      parsedOptions,
      staticSiteBuilderFactory: options.staticSiteBuilderFactory,
    });

    await runStaticSiteBuild({
      staticSiteBuilder,
      buildContext,
      reporter,
    });

    await reporter?.report({
      message: "Site build complete",
      progress: 100,
      total: 100,
    });

    return createSuccessfulBuildResult({
      outputDir: parsedOptions.outputDir,
      routesBuilt: routes.length,
      warnings,
      diagnostics,
    });
  } catch (error) {
    const diagnostic: SiteBuildDiagnostic = {
      severity: "error",
      code: "build-failed",
      message: `Site build process failed: ${getErrorMessage(error)}`,
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
