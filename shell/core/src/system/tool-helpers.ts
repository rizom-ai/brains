import { parseConversationMessageMetadata } from "@brains/conversation-service";
import type {
  BaseEntity,
  CreateExecutionContext,
  CreateInput,
  EntityMutationEventContext,
} from "@brains/entity-service";
import type { Tool, ToolContext, ToolResponse } from "@brains/mcp-service";
import type {
  EntityAction,
  PermissionService,
  UserPermissionLevel,
} from "@brains/templates";
import { getErrorMessage } from "@brains/utils/error";
import type { z } from "@brains/utils/zod";
import { assertEntityActionAllowed } from "./entity-action-policy";
import type { SystemServices } from "./types";
import { isRecord } from "@brains/utils/is-record";
import { permissionToVisibilityScope } from "@brains/entity-service";

const PLUGIN_ID = "system";

const ROLE_LABELS: Record<UserPermissionLevel, string> = {
  admin: "Admin",
  trusted: "Trusted",
  public: "Public",
};

export function checkEntityActionPermission(
  permissionService: PermissionService,
  context: ToolContext,
  entityType: string,
  action: EntityAction,
): ToolResponse | undefined {
  const requiredLevel = permissionService.getRequiredEntityActionLevel(
    entityType,
    action,
  );
  if (!requiredLevel) return undefined;

  const verb = `${action[0]?.toUpperCase()}${action.slice(1)}`;

  if (requiredLevel === "never") {
    return {
      success: false,
      error: `${verb} ${entityType} is not allowed through system tools.`,
    };
  }

  const userLevel = context.userPermissionLevel ?? "public";
  if (permissionService.hasPermission(userLevel, requiredLevel)) {
    return undefined;
  }

  return {
    success: false,
    error: `${verb} ${entityType} requires ${ROLE_LABELS[requiredLevel]} permission; your current permission is ${ROLE_LABELS[userLevel]}.`,
  };
}

/**
 * Like createTool but allows ToolResponse (incl. confirmations) as return type.
 * Used for system tools that need confirmation flows.
 */
export function createSystemTool<TSchema extends z.ZodObject<z.ZodRawShape>>(
  name: string,
  description: string,
  inputSchema: TSchema,
  handler: (
    input: z.output<TSchema>,
    context: ToolContext,
  ) => Promise<ToolResponse>,
  options: {
    visibility?: Tool["visibility"];
    sideEffects?: Tool["sideEffects"];
  } = {},
): Tool {
  const { visibility = "admin", sideEffects } = options;
  return {
    name: `${PLUGIN_ID}_${name}`,
    description,
    inputSchema: inputSchema.shape,
    handler: async (input, context): Promise<ToolResponse> => {
      const parseResult = inputSchema.safeParse(input);
      if (!parseResult.success) {
        return {
          success: false,
          error: `Invalid input: ${parseResult.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")}`,
        };
      }
      try {
        return await handler(parseResult.data, context);
      } catch (error) {
        return { success: false, error: getErrorMessage(error) };
      }
    },
    visibility,
    ...(sideEffects ? { sideEffects } : {}),
  };
}

export {
  createConfirmationGate,
  type ConfirmationGate,
} from "@brains/mcp-service";

export type CreateInterceptorOutcome =
  | { kind: "handled"; result: ToolResponse }
  | { kind: "error"; result: ToolResponse }
  | { kind: "continue"; createInput: CreateInput };

/**
 * Run a plugin create interceptor (shared by system_create and
 * system_generate). Returns the terminal response when the interceptor
 * handles the create itself, an error when the transformed input fails
 * policy validation, or the possibly-transformed input for persistence.
 */
export async function runCreateInterceptor(
  services: SystemServices,
  interceptor: NonNullable<
    ReturnType<SystemServices["entityRegistry"]["getCreateInterceptor"]>
  >,
  createInput: CreateInput,
  toolContext: ToolContext,
): Promise<CreateInterceptorOutcome> {
  const executionContext: CreateExecutionContext = {
    interfaceType: toolContext.interfaceType,
    actor: toolContext.actor,
    ...(toolContext.channelId && { channelId: toolContext.channelId }),
    ...(toolContext.channelName && { channelName: toolContext.channelName }),
  };
  const interception = await interceptor(createInput, executionContext);
  if (interception.kind === "handled") {
    return { kind: "handled", result: interception.result };
  }

  const transformedInput = interception.input;
  if (transformedInput.visibility !== createInput.visibility) {
    return {
      kind: "error",
      result: {
        success: false,
        error:
          "Create interceptor changed or dropped the requested entity visibility.",
      },
    };
  }
  const transformedPolicyError = assertEntityActionAllowed(
    services,
    transformedInput.entityType,
    "create",
    toolContext,
  );
  if (transformedPolicyError) {
    return { kind: "error", result: transformedPolicyError };
  }

  return { kind: "continue", createInput: transformedInput };
}

/**
 * Reject an operation on an entity type that no plugin has registered.
 *
 * Without this guard the create tool confirms and (for `prompt` creates) runs a
 * full generation pass before `EntityRegistry.getAdapter` finally throws
 * "No adapter registered for entity type", leaking that internal string to the
 * operator. Validating up front turns a late, cryptic failure into a clean
 * early rejection, and listing the available types lets the model recover by
 * choosing a type that actually exists in this brain.
 */
export function assertEntityTypeRegistered(
  services: {
    entityRegistry: { hasEntityType(type: string): boolean };
    entityService: { getEntityTypes(): string[] };
  },
  entityType: string,
): ToolResponse | undefined {
  if (services.entityRegistry.hasEntityType(entityType)) return undefined;
  const available = services.entityService.getEntityTypes();
  return {
    success: false,
    error: `Entity type "${entityType}" is not available in this brain. Available types: ${available.join(", ")}.`,
  };
}

export function buildEntityMutationEventContext(
  context: ToolContext,
): EntityMutationEventContext | undefined {
  const eventContext: EntityMutationEventContext = {
    ...(context.conversationId
      ? { conversationId: context.conversationId }
      : {}),
    ...(context.channelId ? { channelId: context.channelId } : {}),
    ...(context.runId ? { runId: context.runId } : {}),
    ...(context.toolCallId ? { toolCallId: context.toolCallId } : {}),
  };
  return Object.keys(eventContext).length > 0 ? eventContext : undefined;
}

export function sanitizeEntity<T extends BaseEntity>(
  entity: T,
  registry: SystemServices["entityRegistry"],
): T {
  if (registry.getEntityTypeConfig(entity.entityType).binaryStorage) {
    return {
      ...entity,
      content: `[binary ${entity.entityType} data — use metadata for ${entity.entityType} info]`,
    };
  }
  return entity;
}

export function normalizeOptionalString(
  value: string | undefined,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const ENTITY_TYPE_DISPLAY_NAMES: Record<string, string> = {
  base: "note",
};

export function humanizeEntityType(entityType: string): string {
  return (
    ENTITY_TYPE_DISPLAY_NAMES[entityType] ?? entityType.replaceAll("-", " ")
  );
}

export function getEntityDisplayLabel(entity: BaseEntity): string {
  const candidates = [
    entity.metadata["title"],
    entity.metadata["name"],
    entity.metadata["subject"],
    entity.metadata["slug"],
  ];
  const label = candidates.find(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  );
  return label ?? entity.id;
}

interface FrontmatterShapeSchema {
  shape: Record<string, unknown>;
}

export function hasStructuredFrontmatter(
  schema: FrontmatterShapeSchema | undefined,
): boolean {
  return !!schema && Object.keys(schema.shape).length > 0;
}

/**
 * True when the upload ref appears as an attachment on a message in this
 * conversation. Shared upload-access gate for system_create and
 * system_create upload sources: a caller must not reference an upload outside the
 * conversation it belongs to.
 */
export async function isUploadRefInConversation(
  services: SystemServices,
  input: { kind: string; id: string },
  conversationId: string | undefined,
): Promise<boolean> {
  if (!conversationId) return false;
  const messages = await services.conversationService.getMessages(
    conversationId,
    { limit: 100 },
  );
  for (const message of messages) {
    const metadata = parseConversationMessageMetadata(message.metadata);
    const attachments = metadata?.["attachments"];
    if (!Array.isArray(attachments)) continue;
    for (const attachment of attachments) {
      if (!isRecord(attachment)) continue;
      const source = attachment["source"];
      if (!isRecord(source)) continue;
      if (source["kind"] === input.kind && source["id"] === input.id) {
        return true;
      }
    }
  }
  return false;
}

/** An entity a create replaces: the placeholder an earlier attempt left failed. */
export interface FailedCreateTarget {
  entityType: string;
  id: string;
}

/**
 * Check the id a create or generation will take. An existing entity there is
 * refused: the caller wants system_update, or `replace` for a new copy. A
 * placeholder whose processing failed (`status: failed`) is not content to
 * update but an attempt to retry: for a caller who may delete it (an Admin
 * the delete policy allows), it is returned to be replaced, so the retry is
 * saved under the same id.
 */
export async function resolveCreateTarget(
  services: SystemServices,
  target: {
    entityType: string;
    candidateId: string | undefined;
    replace: boolean;
    /** How the refusal names the `replace` opt-in. */
    copyHint: string;
  },
  toolContext: ToolContext,
): Promise<
  | { kind: "error"; result: ToolResponse }
  | { kind: "ok"; value: FailedCreateTarget | undefined }
> {
  if (target.replace || !target.candidateId) {
    return { kind: "ok", value: undefined };
  }
  const existing = await services.entityService.getEntity({
    entityType: target.entityType,
    id: target.candidateId,
    visibilityScope: permissionToVisibilityScope(
      toolContext.userPermissionLevel,
    ),
  });
  if (!existing) return { kind: "ok", value: undefined };
  // Replacing deletes, so it takes the authority system_delete takes.
  if (
    existing.metadata["status"] === "failed" &&
    toolContext.userPermissionLevel === "admin" &&
    !assertEntityActionAllowed(
      services,
      target.entityType,
      "delete",
      toolContext,
    )
  ) {
    return {
      kind: "ok",
      value: { entityType: existing.entityType, id: existing.id },
    };
  }
  return {
    kind: "error",
    result: {
      success: false,
      error: `A ${target.entityType} already exists for "${target.candidateId}". To change it, use system_update on that ${target.entityType} in this turn, without asking first; pass replace:true to ${target.copyHint}.`,
    },
  };
}

/** The confirmation line naming the failed placeholder a create replaces. */
export function replacesFailedLine(target: FailedCreateTarget): string {
  return `Replaces: failed ${target.entityType} "${target.id}"`;
}

/** Remove the failed placeholder a confirmed create replaces. */
export async function removeFailedTarget(
  services: SystemServices,
  target: FailedCreateTarget | undefined,
): Promise<ToolResponse | undefined> {
  if (!target) return undefined;
  try {
    await services.entityService.deleteEntity(target);
    return undefined;
  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error, "Failed to replace the failed entity"),
    };
  }
}
