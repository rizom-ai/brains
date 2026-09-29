import {
  GetRoutePayloadSchema,
  ListRoutesPayloadSchema,
  RegisterRoutesPayloadSchema,
  UnregisterRoutesPayloadSchema,
} from "@brains/site-composition";
import type { RouteRegistry } from "@brains/site-engine";
import { SITE_BUILDER_CHANNELS } from "@brains/contracts";
import { defineSubscription, z } from "@brains/sdk/services";
import type { AnySubscriptionDefinition } from "@brains/sdk/services";
import { registerConfigRoutes } from "./route-helpers";

/**
 * The route bus, as declarations.
 *
 * Every package that owns pages registers them here rather than writing to a
 * registry it does not hold, so these four requests are the whole boundary:
 * add, remove, list, and read one. The payload schemas are what the site
 * builder will accept; anything else is refused before a handler runs.
 */
export function routeSubscriptions(
  routes: RouteRegistry,
): AnySubscriptionDefinition[] {
  return [
    defineSubscription({
      topic: SITE_BUILDER_CHANNELS.routeRegister,
      payload: RegisterRoutesPayloadSchema,
      handle: ({ payload }) => {
        registerConfigRoutes(payload.routes, payload.pluginId, routes);
        return { success: true };
      },
    }),
    defineSubscription({
      topic: SITE_BUILDER_CHANNELS.routeUnregister,
      payload: UnregisterRoutesPayloadSchema,
      handle: ({ payload }) => {
        if (payload.paths) {
          for (const path of payload.paths) routes.unregister(path);
        } else if (payload.pluginId) {
          routes.unregisterByPlugin(payload.pluginId);
        }
        return { success: true };
      },
    }),
    defineSubscription({
      topic: SITE_BUILDER_CHANNELS.routeList,
      payload: ListRoutesPayloadSchema,
      handle: ({ payload }) => ({
        success: true,
        data: { routes: routes.list(payload.pluginId ? payload : undefined) },
      }),
    }),
    defineSubscription({
      topic: SITE_BUILDER_CHANNELS.routeGet,
      payload: GetRoutePayloadSchema,
      handle: ({ payload }) => ({
        success: true,
        data: { route: routes.get(payload.path) },
      }),
    }),
    // What the whole site looks like, for a package that generates content
    // per route rather than asking about one.
    defineSubscription({
      topic: SITE_BUILDER_CHANNELS.routesList,
      payload: z.unknown(),
      handle: () => ({ success: true, data: routes.list() }),
    }),
  ];
}
