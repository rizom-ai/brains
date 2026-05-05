import {
  GetRoutePayloadSchema,
  ListRoutesPayloadSchema,
  RegisterRoutesPayloadSchema,
  UnregisterRoutesPayloadSchema,
} from "@brains/site-composition";
import type {
  GetRouteResponse,
  ListRoutesResponse,
  RouteDefinition,
} from "@brains/site-composition";
import type { RouteRegistry } from "@brains/site-engine";
import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { registerConfigRoutes } from "./route-helpers";

/**
 * Subscribe to all route-related messages on the message bus.
 * This wires up register, unregister, list, and get handlers for routes.
 */
export function setupRouteHandlers(
  context: Pick<ServicePluginContext, "messaging">,
  routeRegistry: RouteRegistry,
  logger: Logger,
): void {
  // Register handler for route registration
  context.messaging.subscribe(
    "plugin:site-builder:route:register",
    async (message) => {
      try {
        const payload = RegisterRoutesPayloadSchema.parse(message.payload);
        const { routes, pluginId } = payload;
        registerConfigRoutes(routes, pluginId, routeRegistry);
        return { success: true };
      } catch (error) {
        logger.error("Failed to register routes", { error });
        return { success: false, error: "Failed to register routes" };
      }
    },
  );

  // Handler for unregistering routes
  context.messaging.subscribe(
    "plugin:site-builder:route:unregister",
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
  context.messaging.subscribe<unknown, ListRoutesResponse>(
    "plugin:site-builder:route:list",
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
  context.messaging.subscribe<unknown, GetRouteResponse>(
    "plugin:site-builder:route:get",
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
  context.messaging.subscribe<unknown, RouteDefinition[]>(
    "site-builder:routes:list",
    async () => {
      return { success: true, data: routeRegistry.list() };
    },
  );
}
