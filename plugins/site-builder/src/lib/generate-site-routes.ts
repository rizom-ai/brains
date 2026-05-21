import { DynamicRouteGenerator } from "@brains/site-engine";
import type { BuildPipelineContext } from "./build-pipeline-context";

export interface GenerateSiteRoutesOptions {
  pipelineContext: BuildPipelineContext;
}

/**
 * Generate dynamic site routes by adapting site-builder services to the
 * renderer-agnostic site-engine route generator contract.
 *
 * Detail routes are emitted as static HTML files, so they must only be
 * generated for entities that are publicly viewable. Pass visibilityScope:
 * "public" so listEntities at the entity-service chokepoint filters out
 * shared/restricted entities before any route is created.
 */
export async function generateSiteRoutes(
  options: GenerateSiteRoutesOptions,
): Promise<void> {
  const dynamicRouteGenerator = new DynamicRouteGenerator(
    {
      logger: options.pipelineContext.logger.child("DynamicRouteGenerator"),
      entityService: options.pipelineContext.services.entityService,
      listViewTemplateNames: (): string[] =>
        options.pipelineContext.services.listViewTemplateNames(),
    },
    options.pipelineContext.routeRegistry,
    options.pipelineContext.entityDisplay,
    { visibilityScope: "public" },
  );

  await dynamicRouteGenerator.generateEntityRoutes();
}
