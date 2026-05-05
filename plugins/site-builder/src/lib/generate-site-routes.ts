import { DynamicRouteGenerator, type RouteRegistry } from "@brains/site-engine";
import type { Logger } from "@brains/utils";
import type { EntityDisplayMap } from "../config";
import type { SiteBuilderServices } from "./site-builder-services";

export interface GenerateSiteRoutesOptions {
  logger: Logger;
  services: SiteBuilderServices;
  routeRegistry: RouteRegistry;
  entityDisplay?: EntityDisplayMap | undefined;
}

/**
 * Generate dynamic site routes by adapting site-builder services to the
 * renderer-agnostic site-engine route generator contract.
 */
export async function generateSiteRoutes(
  options: GenerateSiteRoutesOptions,
): Promise<void> {
  const dynamicRouteGenerator = new DynamicRouteGenerator(
    {
      logger: options.logger.child("DynamicRouteGenerator"),
      entityService: options.services.entityService,
      listViewTemplateNames: (): string[] =>
        options.services.listViewTemplateNames(),
    },
    options.routeRegistry,
    options.entityDisplay,
  );

  await dynamicRouteGenerator.generateEntityRoutes();
}
