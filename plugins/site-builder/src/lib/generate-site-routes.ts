import {
  DynamicRouteGenerator,
  type DynamicRouteEntity,
  type RouteRegistry,
} from "@brains/site-engine";
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
      getEntityTypes: (): string[] =>
        options.services.entityService.getEntityTypes(),
      listEntities: async (
        entityType,
        listOptions,
      ): Promise<DynamicRouteEntity[]> =>
        options.services.entityService.listEntities({
          entityType,
          ...(listOptions !== undefined ? { options: listOptions } : {}),
        }),
      listViewTemplateNames: (): string[] =>
        options.services.listViewTemplateNames(),
    },
    options.routeRegistry,
    options.entityDisplay,
  );

  await dynamicRouteGenerator.generateEntityRoutes();
}
