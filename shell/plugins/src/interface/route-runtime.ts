import type { UserPermissionLevel } from "@brains/templates";
import {
  SdkError,
  toSdkError,
  sdkErrorHttpStatus,
  type SdkErrorCode,
} from "@brains/contracts";
import type { IAuthRegistry } from "../contracts/auth-registry";
import {
  isVerbatimResponse,
  type AnyInterfaceRouteDefinition,
  type InterfaceCaller,
  type RoutePermissions,
} from "./route-contract";

export type { RoutePermissions };
import { jsonResponse, type WebRouteDefinition } from "../types/web-routes";

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
      let fallback: SdkErrorCode = "handler_failed";
      try {
        if (request.signal.aborted) throw new SdkError("cancelled");
        const caller = await resolveCaller(definition, request, options);
        if (definition.security.kind !== "public" && !caller) {
          throw new SdkError("unauthenticated");
        }

        fallback = "invalid_input";
        const body: unknown = definition.body
          ? definition.body.parse(await request.json())
          : undefined;
        fallback = "handler_failed";
        const output = await definition.handle({ request, body, caller });
        fallback = "invalid_response";
        // Protocol responses retain their own mandated body, status and headers.
        if (isVerbatimResponse(definition.response)) {
          if (!(output instanceof Response))
            throw new SdkError("invalid_response");
          return output;
        }
        return jsonResponse(definition.response.parse(output));
      } catch (error) {
        // Runtime failures are coded and sanitized; arbitrary handler/validator
        // exceptions must never become public response bodies.
        const failure = toSdkError(
          error,
          request.signal.aborted ? "cancelled" : fallback,
        );
        return jsonResponse(
          { error: failure.message, code: failure.code },
          {
            status: sdkErrorHttpStatus(failure.code),
          },
        );
      }
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
