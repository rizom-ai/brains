import type { UserPermissionLevel } from "@brains/templates";
import {
  isVerbatimResponse,
  type AnyInterfaceRouteDefinition,
  type InterfaceCaller,
  type RoutePermissions,
} from "./route-contract";

export type { RoutePermissions };
import {
  jsonError,
  jsonResponse,
  type WebRouteDefinition,
} from "../types/web-routes";

/**
 * Turn a declared route into the runtime's web-route shape.
 *
 * Shared between the interface and service families: a route is a route —
 * security resolved, body parsed and validated, response validated — whether
 * the package that declares it listens on a channel or answers the bus.
 * Named consumers: every declarative interface, and @brains/atproto-registry
 * on the service side.
 */
export function createRuntimeRoute(
  definition: AnyInterfaceRouteDefinition,
  options: {
    /** The declaration id permissions are scoped to. */
    readonly declarationId: string;
    readonly permissions: RoutePermissions;
  },
): WebRouteDefinition {
  return {
    method: definition.method,
    path: definition.path,
    public: true,
    handler: async (request): Promise<Response> => {
      const caller = await resolveCaller(definition, request, options);
      if (definition.security.kind === "protocol" && !caller) {
        return jsonError("Unauthorized", 401);
      }

      let body: unknown;
      if (definition.body) {
        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return jsonError("Request body must be valid JSON", 400);
        }
        const parsed = definition.body.safeParse(payload);
        if (!parsed.success) {
          return jsonError("Request body is invalid", 400);
        }
        body = parsed.data;
      }

      const output = await definition.handle({
        request,
        body,
        caller,
      });
      // A route hosting somebody else's protocol answers for itself; there is
      // nothing here to validate and nothing to encode.
      if (isVerbatimResponse(definition.response)) {
        return output instanceof Response
          ? output
          : jsonError("Route did not answer with a response", 500);
      }
      return jsonResponse(definition.response.parse(output));
    },
  };
}

async function resolveCaller(
  definition: AnyInterfaceRouteDefinition,
  request: Request,
  options: {
    readonly declarationId: string;
    readonly permissions: RoutePermissions;
  },
): Promise<InterfaceCaller | null> {
  if (definition.security.kind === "public") return null;
  const actor = await definition.security.authenticate({ request });
  if (!actor?.id.trim()) return null;
  const permission: UserPermissionLevel = options.permissions.getUserLevel(
    options.declarationId,
    actor.id,
  );
  return Object.freeze({
    actor: Object.freeze({ ...actor }),
    permission,
    isAnchor: options.permissions.isAnchor(options.declarationId, actor.id),
  });
}
