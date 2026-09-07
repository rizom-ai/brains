import type { UserPermissionLevel } from "@brains/templates";
import type { IAuthRegistry } from "../contracts/auth-registry";
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
    /**
     * Where a first-party session is resolved, for a `session` route. Read
     * lazily: a plugin can say what it serves before it is registered, and
     * only serves it after.
     */
    readonly auth: () => IAuthRegistry;
  },
): WebRouteDefinition {
  return {
    method: definition.method,
    path: definition.path,
    ...(definition.match ? { match: definition.match } : {}),
    public: true,
    handler: async (request): Promise<Response> => {
      const caller = await resolveCaller(definition, request, options);
      if (definition.security.kind !== "public" && !caller) {
        // A person is asked to sign in; a peer is told its credential failed.
        return jsonError(
          definition.security.kind === "session"
            ? "Authentication required"
            : "Unauthorized",
          401,
        );
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
    readonly auth: () => IAuthRegistry;
  },
): Promise<InterfaceCaller | null> {
  switch (definition.security.kind) {
    case "public":
      return null;
    case "session":
      return resolveSessionCaller(request, options.auth());
    case "protocol": {
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
  }
}

/**
 * The person a first-party session belongs to, as the brain's own auth
 * service knows them. A session that is not active — invited, suspended —
 * is nobody, the same as no session at all.
 */
async function resolveSessionCaller(
  request: Request,
  auth: IAuthRegistry,
): Promise<InterfaceCaller | null> {
  const principal = await auth.getCaller()?.resolveSession(request);
  if (principal?.status !== "active") return null;
  return Object.freeze({
    actor: Object.freeze({
      id: principal.userId,
      displayName: principal.displayName,
      ...(principal.canonicalId !== undefined
        ? { canonicalId: principal.canonicalId }
        : {}),
    }),
    permission: principal.permissionLevel,
    isAnchor: principal.isAnchor,
  });
}
