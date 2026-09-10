import { createMockServicePluginContext } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { RouteRegistry } from "@brains/site-engine";
import type {
  RouteDefinitionInput,
  ServicePluginContext,
} from "@brains/plugins";
import { createSiteBuilderServices } from "./test-helpers";
import type { BuildPipelineContext } from "../src/lib/build-pipeline-context";

/** The route four separate test files were each registering by hand. */
export const HOME_ROUTE: RouteDefinitionInput = {
  id: "home",
  path: "/",
  title: "Home",
  description: "Home route",
  layout: "default",
  sections: [],
};

export interface TestPipelineContext {
  pipeline: BuildPipelineContext;
  /** The plugin context behind the pipeline, for tests that spy on it. */
  context: ServicePluginContext;
}

/**
 * Build a BuildPipelineContext over a mock service plugin context.
 *
 * Four unit tests each constructed this identically apart from which routes
 * they registered; two were byte-for-byte the same.
 */
export function createTestPipelineContext(
  routes: RouteDefinitionInput[] = [HOME_ROUTE],
): TestPipelineContext {
  const logger = createSilentLogger();
  const context = createMockServicePluginContext({ logger });
  const routeRegistry = new RouteRegistry(logger);
  routes.forEach((route) => {
    routeRegistry.register(route);
  });

  return {
    context,
    pipeline: {
      logger,
      services: createSiteBuilderServices(context),
      routeRegistry,
      profileService: { getProfile: () => ({}) },
      entityDisplay: undefined,
    },
  };
}
