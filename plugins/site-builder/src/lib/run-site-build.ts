import type { ProgressCallback } from "@brains/utils";
import { ProgressReporter } from "@brains/utils";
import type {
  BuildResult,
  SiteBuilderOptions,
} from "../types/site-builder-types";
import { SiteBuilderOptionsSchema } from "../types/site-builder-types";
import { collectBuildRoutes } from "./collect-build-routes";
import { createBuildContext } from "./create-build-context";
import { createStaticSiteBuilder } from "./create-static-site-builder";
import { generateSiteRoutes } from "./generate-site-routes";
import { prepareSiteImages } from "./prepare-site-images";
import { runStaticSiteBuild } from "./run-static-site-build";
import type { BuildPipelineContext } from "./build-pipeline-context";
import {
  createFailedBuildResult,
  createSuccessfulBuildResult,
} from "./site-build-result";
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
    });

    const staticSiteBuilder = await createStaticSiteBuilder({
      logger: options.pipelineContext.logger,
      parsedOptions,
      staticSiteBuilderFactory: options.staticSiteBuilderFactory,
    });

    const buildRoutes = collectBuildRoutes(
      options.pipelineContext.routeRegistry,
    );
    warnings.push(...buildRoutes.warnings);
    const { routes } = buildRoutes;

    await reporter?.report({
      message: `Building ${routes.length} routes`,
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

    const buildContext = createBuildContext({
      routes,
      parsedOptions,
      buildOptions: options.buildOptions,
      pipelineContext: options.pipelineContext,
      imageBuildService,
      siteMetadata: parsedOptions.siteConfig,
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
    });
  } catch (error) {
    const buildError = new Error("Site build process failed");
    options.pipelineContext.logger.error("Site build failed", {
      error: buildError,
      originalError: error,
    });

    return createFailedBuildResult({
      outputDir: parsedOptions.outputDir,
      errorMessage: buildError.message,
    });
  }
}
