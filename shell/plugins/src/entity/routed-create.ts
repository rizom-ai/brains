import type {
  CreateExecutionContext,
  CreateInterceptor,
  CreateResult,
} from "@brains/entity-service";
import type { UserPermissionLevel } from "@brains/templates";
import { getErrorMessage } from "@brains/utils/error";
import type { RoutedCreate } from "../job/job-context-contract";

/**
 * Who a routed create is done for.
 *
 * A tool has its caller, level and all. A job has the actor recorded when it
 * was enqueued and no level: the act that enqueued it was already gated, and
 * a job re-deciding what its requester may do would be a second, weaker
 * answer to a question already answered.
 */
export interface RoutedCreateRequester {
  readonly execution: CreateExecutionContext;
  readonly permissionLevel?: UserPermissionLevel | undefined;
}

/**
 * A create routed through the owning type's declared route.
 *
 * Three refusals, each before anything is written: nobody to attribute it
 * to, no route on the type, or a route that declined the input. The last is
 * where this differs from `system_create`, which falls through to an
 * ordinary write — from a package that does not own the type, that write is
 * the trespass the ownership rule exists to prevent.
 */
export function createRoutedCreate(input: {
  readonly requester: string;
  readonly interceptorFor: (
    entityType: string,
  ) => CreateInterceptor | undefined;
  readonly assertAllowed: (
    entityType: string,
    permissionLevel: UserPermissionLevel,
  ) => void;
  readonly caller: () =>
    | RoutedCreateRequester
    | undefined
    | Promise<RoutedCreateRequester | undefined>;
}): RoutedCreate {
  return async (request): Promise<CreateResult> => {
    const caller = await input.caller();
    if (!caller) {
      return {
        success: false,
        error: `"${input.requester}" cannot create anything here: nobody is recorded as having asked for it`,
      };
    }
    const interceptor = input.interceptorFor(request.entityType);
    if (!interceptor) {
      return {
        success: false,
        error: `Entity type '${request.entityType}' declares no create route, so nothing can be created through it`,
      };
    }
    if (caller.permissionLevel !== undefined) {
      try {
        input.assertAllowed(request.entityType, caller.permissionLevel);
      } catch (error) {
        return { success: false, error: getErrorMessage(error) };
      }
    }
    const outcome = await interceptor(request, caller.execution);
    if (outcome.kind === "handled") return outcome.result;
    return {
      success: false,
      error: `Entity type '${request.entityType}' has no create route for this input, and "${input.requester}" may not write it directly`,
    };
  };
}

/** What a family whose tools never create hands its handlers. */
export function noRoutedCreate(toolName: string): RoutedCreate {
  return async (): Promise<CreateResult> => ({
    success: false,
    error: `Tool "${toolName}" belongs to a family that creates no entities`,
  });
}
