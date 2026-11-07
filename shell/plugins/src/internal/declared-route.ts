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
import type {
  AnyInterfaceRouteDefinition,
  InterfaceCaller,
} from "../interface/route-definition-contract";
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
}

/**
 * A declared route as the web server serves it, the same for every family
 * that declares routes. The body and the answer are held to their schemas,
 * and a failure is answered in its public form with the status its code
 * names, never with the message it was thrown with.
 */
export function createDeclaredRoute(
  definition: AnyInterfaceRouteDefinition,
  options: DeclaredRouteOptions,
): WebRouteDefinition {
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
          async () => definition.handle({ request, body, caller }),
        );
        const answer = definition.response.safeParse(output);
        if (!answer.success) {
          throw new SdkError("invalid_response", {
            message: `Route ${definition.method} ${definition.path} answered outside its response schema`,
            cause: answer.error,
          });
        }
        return jsonResponse(answer.data);
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
  definition: AnyInterfaceRouteDefinition,
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
