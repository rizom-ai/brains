import type { RouteDefinition } from "@brains/site-composition";
import type { RouteRegistry } from "@brains/site-engine";
import type { Logger } from "@brains/utils";
import type { EntityDisplayMap } from "../config";
import type { SiteBuilderOptions } from "../types/site-builder-types";
import type { BuildContext } from "./static-site-builder";
import type { SiteBuilderServices } from "./site-builder-services";
import type { SiteBuildProfileService } from "./site-build-profile-service";
import { createBuildContext } from "./create-build-context";
import { prepareSiteImages } from "./prepare-site-images";
import { resolveSiteMetadata } from "./site-metadata";

export interface PrepareBuildContextOptions {
  routes: RouteDefinition[];
  parsedOptions: Pick<
    SiteBuilderOptions,
    "environment" | "siteConfig" | "layouts" | "themeCSS" | "sharedImagesDir"
  >;
  buildOptions: Pick<
    SiteBuilderOptions,
    "headScripts" | "staticAssets" | "slots"
  >;
  services: SiteBuilderServices;
  logger: Logger;
  routeRegistry: RouteRegistry;
  profileService: SiteBuildProfileService;
  entityDisplay?: EntityDisplayMap | undefined;
}

export async function prepareBuildContext(
  options: PrepareBuildContextOptions,
): Promise<BuildContext> {
  const imageBuildService = await prepareSiteImages({
    services: options.services,
    logger: options.logger,
    sharedImagesDir: options.parsedOptions.sharedImagesDir,
  });

  const siteMetadata = await resolveSiteMetadata(
    options.services.sendMessage,
    options.parsedOptions.siteConfig,
  );

  return createBuildContext({
    routes: options.routes,
    parsedOptions: options.parsedOptions,
    buildOptions: options.buildOptions,
    services: options.services,
    routeRegistry: options.routeRegistry,
    profileService: options.profileService,
    entityDisplay: options.entityDisplay,
    imageBuildService,
    siteMetadata,
  });
}
