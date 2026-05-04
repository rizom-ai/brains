import type { RouteRegistry } from "@brains/site-engine";
import type { Logger, ProgressCallback } from "@brains/utils";
import { ProgressReporter } from "@brains/utils";
import type { EntityDisplayMap } from "../config";
import type {
  BuildResult,
  SiteBuilderOptions,
} from "../types/site-builder-types";
import { SiteBuilderOptionsSchema } from "../types/site-builder-types";
import { collectBuildRoutes } from "./collect-build-routes";
import { createStaticSiteBuilder } from "./create-static-site-builder";
import { generateSiteRoutes } from "./generate-site-routes";
import { prepareBuildContext } from "./prepare-build-context";
import { runStaticSiteBuild } from "./run-static-site-build";
import type { SiteBuilderServices } from "./site-builder-services";
import type { SiteBuildProfileService } from "./site-build-profile-service";
import {
  createFailedBuildResult,
  createSuccessfulBuildResult,
} from "./site-build-result";
import type { StaticSiteBuilderFactory } from "./static-site-builder";

export interface RunSiteBuildOptions {
  buildOptions: SiteBuilderOptions;
  progress: ProgressCallback | undefined;
  logger: Logger;
  services: SiteBuilderServices;
  routeRegistry: RouteRegistry;
  profileService: SiteBuildProfileService;
  staticSiteBuilderFactory: StaticSiteBuilderFactory;
  entityDisplay: EntityDisplayMap | undefined;
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
      logger: options.logger,
      services: options.services,
      routeRegistry: options.routeRegistry,
      entityDisplay: options.entityDisplay,
    });

    const staticSiteBuilder = await createStaticSiteBuilder({
      logger: options.logger,
      parsedOptions,
      staticSiteBuilderFactory: options.staticSiteBuilderFactory,
    });

    const buildRoutes = collectBuildRoutes(options.routeRegistry);
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

    const buildContext = await prepareBuildContext({
      routes,
      parsedOptions,
      buildOptions: options.buildOptions,
      services: options.services,
      logger: options.logger,
      routeRegistry: options.routeRegistry,
      profileService: options.profileService,
      entityDisplay: options.entityDisplay,
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
    options.logger.error("Site build failed", {
      error: buildError,
      originalError: error,
    });

    return createFailedBuildResult({
      outputDir: parsedOptions.outputDir,
      errorMessage: buildError.message,
    });
  }
}
