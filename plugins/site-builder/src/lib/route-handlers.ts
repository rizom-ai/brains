import {
  siteBuilderRouteRegisterContract,
  siteBuilderRoutesContract,
} from "@brains/site-composition";
import type { RouteRegistry } from "@brains/site-engine";
import type { ServiceRuntime } from "@brains/sdk/internal/service-runtime";
import type { Logger } from "@brains/utils/logger";
import { registerConfigRoutes } from "./route-helpers";

/**
 * Answer the route contracts: plugins declare their pages, and plugins that
 * fill pages list them.
 */
// Answered in every process: the site builds in the worker, which takes no
// ordinary subscriptions, and its registry has to hear the pages plugins
// declare.
export function setupRouteHandlers(
  context: Pick<ServiceRuntime, "answer">,
  routeRegistry: RouteRegistry,
  logger: Logger,
): void {
  context.answer(
    siteBuilderRouteRegisterContract,
    async ({ request: { routes, pluginId } }) => {
      try {
        registerConfigRoutes(routes, pluginId, routeRegistry);
      } catch (error) {
        logger.error("Failed to register routes", { error });
        throw new Error("Failed to register routes", { cause: error });
      }
    },
    { everyProcess: true },
  );

  // Handler for site-content plugin to discover all routes
  context.answer(siteBuilderRoutesContract, async () => routeRegistry.list(), {
    everyProcess: true,
  });
}
