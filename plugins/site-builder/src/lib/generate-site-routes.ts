import {
  DynamicRouteGenerator,
  type DynamicRouteEntity,
} from "@brains/site-engine";
import type { BuildPipelineContext } from "./build-pipeline-context";

export interface GenerateSiteRoutesOptions {
  pipelineContext: BuildPipelineContext;
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
      logger: options.pipelineContext.logger.child("DynamicRouteGenerator"),
      getEntityTypes: (): string[] =>
        options.pipelineContext.services.entityService.getEntityTypes(),
      listEntities: async (
        entityType,
        listOptions,
      ): Promise<DynamicRouteEntity[]> =>
        options.pipelineContext.services.entityService.listEntities(
          entityType,
          listOptions,
        ),
      listViewTemplateNames: (): string[] =>
        options.pipelineContext.services.listViewTemplateNames(),
    },
    options.pipelineContext.routeRegistry,
    options.pipelineContext.entityDisplay,
  );

  await dynamicRouteGenerator.generateEntityRoutes();
}
