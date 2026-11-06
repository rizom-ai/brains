import {
  siteBuilderRouteRegisterContract,
  siteBuilderRoutesContract,
} from "@brains/site-composition";
import type { RouteRegistry } from "@brains/site-engine";
import type { ServicePluginContext } from "@brains/plugins";
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
  context: Pick<ServicePluginContext, "messaging">,
  routeRegistry: RouteRegistry,
  logger: Logger,
): void {
  context.messaging.answer(
    siteBuilderRouteRegisterContract,
    async ({ routes, pluginId }) => {
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
  context.messaging.answer(
    siteBuilderRoutesContract,
    async () => routeRegistry.list(),
    { everyProcess: true },
  );
}
