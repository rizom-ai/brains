import type { Caller } from "@brains/content-service";
import {
  SDK_ERROR_MESSAGE_MAX_LENGTH,
  SdkError,
  createExternalActorId,
  sdkErrorHttpStatus,
  toSdkError,
} from "@brains/contracts";
import type { UserPermissionLevel } from "@brains/templates";
import { getErrorMessage } from "@brains/utils/error";
import type { Logger } from "@brains/utils/logger";
import { formatZodIssues } from "@brains/utils/zod-issues";
import { z } from "@brains/utils/zod";
import {
  isReturnToRoute,
  type AnyDeclaredRouteDefinition,
  type AnyInterfaceRouteDefinition,
  type AnyReturnToRouteDefinition,
  type InterfaceCaller,
  type ReturnToWorkspace,
} from "../interface/route-definition-contract";
import { setSameOriginSearchParams } from "../http/same-origin-path";
import { jsonResponse, type WebRouteDefinition } from "../types/web-routes";

/** How a declaration's routes resolve their callers and run their handlers. */
export interface DeclaredRouteOptions {
  /** The declaration permissions and external actors are scoped to. */
  readonly declarationId: string;
  readonly permissions: {
    getUserLevel(declarationId: string, actorId: string): UserPermissionLevel;
    isAnchor(declarationId: string, actorId: string): boolean;
  };
  /** Who a route acts as when nobody signed the call. */
  readonly anonymous: Caller;
  /**
   * Runs a handler as the route's caller, so what it reads, writes and
   * starts is held to that caller.
   */
  readonly runAs: <T>(
    caller: Caller,
    request: Request,
    run: () => Promise<T>,
  ) => Promise<T>;
  /** Where a failure's diagnostic goes; the caller is told its public form. */
  readonly logger: Logger;
  /**
   * The URL of one of the declaring package's Studio workspaces, for a route
   * that returns the browser there; undefined while no Studio hosts it.
   * Without it, a route that returns the browser cannot be declared.
   */
  readonly workspaceUrl?:
    ((workspace: ReturnToWorkspace) => string | undefined) | undefined;
}

/**
 * A declared route as the web server serves it, the same for every family
 * that declares routes. The body and the answer are held to their schemas,
 * and a failure is answered in its public form with the status its code
 * names, never with the message it was thrown with.
 */
export function createDeclaredRoute(
  definition: AnyDeclaredRouteDefinition,
  options: DeclaredRouteOptions,
): WebRouteDefinition {
  const answer = isReturnToRoute(definition)
    ? returnAnswer(definition, options)
    : jsonAnswer(definition);
  return {
    method: definition.method,
    path: definition.path,
    public: true,
    handler: async (request): Promise<Response> => {
      try {
        const caller = await resolveCaller(definition, request, options);
        if (definition.security.kind === "protocol" && !caller) {
          throw new SdkError("unauthenticated");
        }
        const body = definition.body
          ? await parseBody(definition.body, request)
          : undefined;
        const output = await options.runAs(
          caller ? callerFor(caller, options.declarationId) : options.anonymous,
          request,
          async () =>
            isReturnToRoute(definition)
              ? definition.handle({ request, body: undefined, caller })
              : definition.handle({ request, body, caller }),
        );
        return answer(output);
      } catch (error) {
        // Every failure is answered in its public form; the diagnostic
        // stays in the declaring package's log.
        const failure = toSdkError(
          error,
          request.signal.aborted ? "cancelled" : "handler_failed",
        );
        const fault =
          failure.code === "handler_failed" ||
          failure.code === "invalid_response";
        options.logger[fault ? "error" : "warn"](
          `Route ${definition.method} ${definition.path} failed`,
          { code: failure.code, error: getErrorMessage(error) },
        );
        const { code, message } = failure.toJSON();
        return jsonResponse(
          { error: message, code },
          { status: sdkErrorHttpStatus(code) },
        );
      }
    },
  };
}

/** A JSON route answers what its response schema accepts. */
function jsonAnswer(
  definition: AnyInterfaceRouteDefinition,
): (output: unknown) => Response {
  return (output) => {
    const parsed = definition.response.safeParse(output);
    if (!parsed.success) {
      throw new SdkError("invalid_response", {
        message: `Route ${definition.method} ${definition.path} answered outside its response schema`,
        cause: parsed.error,
      });
    }
    return jsonResponse(parsed.data);
  };
}

const queryScalarSchema = z.union([z.string(), z.number(), z.boolean()]);
const returnQuerySchema = z.record(z.string(), queryScalarSchema.optional());

/**
 * A route that returns the browser answers 303 to its workspace, with the
 * query its handler answered: checked by the workspace's query schema as the
 * URL will carry it, so Studio opens the state the handler named.
 */
function returnAnswer(
  definition: AnyReturnToRouteDefinition,
  options: DeclaredRouteOptions,
): (output: unknown) => Response {
  const { workspaceUrl } = options;
  const { returnTo } = definition;
  const query = returnTo.query;
  if (!workspaceUrl || !query) {
    throw new Error(
      `Route ${definition.method} ${definition.path} returns to Studio workspace "${returnTo.id}", which only a service that declares it can do`,
    );
  }
  const outside = (cause?: unknown): SdkError =>
    new SdkError("invalid_response", {
      message: `Route ${definition.method} ${definition.path} answered outside Studio workspace "${returnTo.id}"'s query`,
      cause,
    });
  return (output) => {
    const answered = query.safeParse(output);
    const scalars = returnQuerySchema.safeParse(output);
    if (!answered.success) throw outside(answered.error);
    if (!scalars.success) throw outside(scalars.error);
    const entries = Object.entries(scalars.data).flatMap(
      ([key, value]): [string, string][] =>
        value === undefined ? [] : [[key, String(value)]],
    );
    // Studio reads the query back from the URL's strings.
    const carried = query.safeParse(Object.fromEntries(entries));
    if (!carried.success) throw outside(carried.error);
    const base = workspaceUrl(returnTo);
    if (base === undefined) {
      throw new SdkError("no_handler", {
        message: `Studio workspace "${returnTo.id}" is not hosted, so route ${definition.path} has nowhere to return the browser`,
        publicMessage: "Studio is not available to return to",
      });
    }
    const location = setSameOriginSearchParams(base, entries, {
      replace: true,
    });
    if (!location) {
      throw new SdkError("handler_failed", {
        message: `Studio workspace "${returnTo.id}" has no same-origin URL to return to: ${base}`,
      });
    }
    return new Response(null, {
      status: 303,
      headers: { Location: location, "Cache-Control": "no-store" },
    });
  };
}

/** The request's body, held to the route's schema; its issues are the caller's own. */
async function parseBody(
  schema: NonNullable<AnyInterfaceRouteDefinition["body"]>,
  request: Request,
): Promise<unknown> {
  const payload: unknown = await request.json().catch((cause: unknown) => {
    throw new SdkError("invalid_input", {
      publicMessage: "Request body must be valid JSON",
      cause,
    });
  });
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new SdkError("invalid_input", {
      publicMessage: formatZodIssues(parsed.error, {
        maxLength: SDK_ERROR_MESSAGE_MAX_LENGTH,
      }),
      cause: parsed.error,
    });
  }
  return parsed.data;
}

/** An authenticated caller, as the brain knows it: external to this declaration. */
function callerFor(caller: InterfaceCaller, declarationId: string): Caller {
  return {
    actor: {
      kind: "external",
      externalActorId: createExternalActorId(declarationId, caller.actor.id),
    },
    permissionLevel: caller.permission,
  };
}

async function resolveCaller(
  definition: AnyDeclaredRouteDefinition,
  request: Request,
  options: DeclaredRouteOptions,
): Promise<InterfaceCaller | null> {
  if (definition.security.kind === "public") return null;
  const actor = await definition.security.authenticate({ request });
  if (!actor?.id.trim()) return null;
  return Object.freeze({
    actor: Object.freeze({ ...actor }),
    permission: options.permissions.getUserLevel(
      options.declarationId,
      actor.id,
    ),
    isAnchor: options.permissions.isAnchor(options.declarationId, actor.id),
  });
}
