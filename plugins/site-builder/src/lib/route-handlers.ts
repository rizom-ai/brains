import {
  GetRoutePayloadSchema,
  ListRoutesPayloadSchema,
  UnregisterRoutesPayloadSchema,
  siteBuilderRouteRegisterContract,
  siteBuilderRoutesContract,
} from "@brains/site-composition";
import type {
  GetRouteResponse,
  ListRoutesResponse,
} from "@brains/site-composition";
import type { RouteRegistry } from "@brains/site-engine";
import { SITE_BUILDER_CHANNELS } from "@brains/contracts";
import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { registerConfigRoutes } from "./route-helpers";

/**
 * Subscribe to all route-related messages on the message bus.
 * This wires up register, unregister, list, and get handlers for routes.
 */
// Subscribed in every process: the site builds in the worker, which takes no
// ordinary subscriptions, and its registry has to hear the pages plugins
// declare.
export function setupRouteHandlers(
  context: Pick<ServicePluginContext, "messaging">,
  routeRegistry: RouteRegistry,
  logger: Logger,
): void {
  // Register handler for route registration
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

  // Handler for unregistering routes
  context.messaging.subscribeExecution(
    SITE_BUILDER_CHANNELS.routeUnregister,
    async (message) => {
      try {
        const payload = UnregisterRoutesPayloadSchema.parse(message.payload);
        const { paths, pluginId } = payload;

        if (paths) {
          for (const path of paths) {
            routeRegistry.unregister(path);
          }
        } else if (pluginId) {
          routeRegistry.unregisterByPlugin(pluginId);
        }

        return { success: true };
      } catch (error) {
        logger.error("Failed to unregister routes", { error });
        return { success: false, error: "Failed to unregister routes" };
      }
    },
  );

  // Handler for listing routes
  context.messaging.subscribeExecution<unknown, ListRoutesResponse>(
    SITE_BUILDER_CHANNELS.routeList,
    async (message) => {
      try {
        const payload = ListRoutesPayloadSchema.parse(message.payload);
        const routes = routeRegistry.list(
          payload.pluginId ? payload : undefined,
        );
        return { success: true, data: { routes } };
      } catch (error) {
        logger.error("Failed to list routes", { error });
        return { success: false, error: "Failed to list routes" };
      }
    },
  );

  // Handler for getting specific route
  context.messaging.subscribeExecution<unknown, GetRouteResponse>(
    SITE_BUILDER_CHANNELS.routeGet,
    async (message) => {
      try {
        const payload = GetRoutePayloadSchema.parse(message.payload);
        const route = routeRegistry.get(payload.path);
        return { success: true, data: { route } };
      } catch (error) {
        logger.error("Failed to get route", { error });
        return { success: false, error: "Failed to get route" };
      }
    },
  );

  // Handler for site-content plugin to discover all routes
  context.messaging.answer(
    siteBuilderRoutesContract,
    async () => routeRegistry.list(),
    { everyProcess: true },
  );
}
