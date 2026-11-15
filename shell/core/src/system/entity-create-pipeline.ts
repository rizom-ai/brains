import type { CreateInput } from "@brains/entity-service";
import type {
  ConfirmationGate,
  ToolContext,
  ToolResponse,
} from "@brains/mcp-service";
import type { z } from "@brains/utils/zod";
import { entityActionRefusal } from "./entity-action-policy";
import type { createInputSchema } from "./schemas";
import type { SystemServices } from "./types";
import {
  entityTypeRefusal,
  guardRefusal,
  removeFailedTarget,
  replacesFailedLine,
  runCreateInterceptor,
  type FailedCreateTarget,
  type Guarded,
} from "./tool-helpers";

/**
 * The steps system_create and system_generate share: admit the entity type,
 * then ask the user to confirm, or run the confirmed create through the
 * type's interceptor.
 */

/** An existing entity a create or generation names by its type and id. */
export type EntityRef = Omit<
  Extract<z.output<typeof createInputSchema>["source"], { kind: "entity" }>,
  "kind"
>;

/** The plugin hook that handles or transforms a type's creates, if any. */
export type CreateInterceptor = ReturnType<
  SystemServices["entityRegistry"]["getCreateInterceptor"]
>;

/**
 * Admit a create of an entity type: the type is registered and the caller
 * may create it. Admitted, it carries the type's interceptor.
 */
export function admitCreate(
  services: SystemServices,
  entityType: string,
  toolContext: ToolContext,
): Guarded<{ interceptor: CreateInterceptor }> {
  const unregistered = entityTypeRefusal(services, entityType);
  if (unregistered) return guardRefusal(unregistered);
  const disallowed = entityActionRefusal(
    services,
    entityType,
    "create",
    toolContext,
  );
  if (disallowed) return guardRefusal(disallowed);
  return {
    kind: "ok",
    value: {
      interceptor: services.entityRegistry.getCreateInterceptor(entityType),
    },
  };
}

/** The confirmation a create asks for, and the args its approval replays. */
export interface CreateConfirmationRequest {
  toolName: string;
  summary: string;
  /** What the confirmed call reports it did. */
  completionSummary?: string;
  preview: string;
  /** The call to replay, without `confirmed` and its token. */
  args: Record<string, unknown>;
}

/**
 * An unconfirmed call returns the confirmation request, naming the failed
 * placeholder the create replaces; a confirmed call whose approval is intact
 * runs.
 */
export async function confirmOrRun(params: {
  gate: ConfirmationGate;
  input: {
    confirmed?: true | undefined;
    confirmationToken?: string | undefined;
  };
  replacesFailed: FailedCreateTarget | undefined;
  confirmation: () => CreateConfirmationRequest;
  run: () => Promise<ToolResponse>;
}): Promise<ToolResponse> {
  const { gate, input, replacesFailed } = params;
  if (input.confirmed) {
    const gateError = gate.validateConfirmed(input.confirmationToken, input);
    if (gateError) return gateError;
    return params.run();
  }
  const { toolName, summary, completionSummary, preview, args } =
    params.confirmation();
  return {
    needsConfirmation: true,
    toolName,
    summary,
    ...(completionSummary !== undefined && { completionSummary }),
    preview: replacesFailed
      ? `${preview}\n${replacesFailedLine(replacesFailed)}`
      : preview,
    args: gate.buildArgs((confirmationToken) => ({
      ...args,
      confirmed: true,
      confirmationToken,
    })),
  };
}

/**
 * Run a confirmed create: remove the failed placeholder it replaces, let the
 * type's interceptor handle or transform it, then persist what is left.
 */
export async function runCreate(
  services: SystemServices,
  toolContext: ToolContext,
  run: {
    createInput: CreateInput;
    interceptor: CreateInterceptor;
    replacesFailed: FailedCreateTarget | undefined;
    persist(createInput: CreateInput): Promise<ToolResponse>;
  },
): Promise<ToolResponse> {
  const replaceError = await removeFailedTarget(services, run.replacesFailed);
  if (replaceError) return replaceError;
  if (!run.interceptor) return run.persist(run.createInput);
  const outcome = await runCreateInterceptor(
    services,
    run.interceptor,
    run.createInput,
    toolContext,
  );
  if (outcome.kind !== "continue") return outcome.result;
  return run.persist(outcome.createInput);
}
