import { parseConversationMessageMetadata } from "@brains/conversation-service";
import type {
  BaseEntity,
  EntityMutationEventContext,
} from "@brains/entity-service";
import type { Tool, ToolContext, ToolResponse } from "@brains/mcp-service";
import type {
  EntityAction,
  PermissionService,
  UserPermissionLevel,
} from "@brains/templates";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import type { SystemServices } from "./types";

const PLUGIN_ID = "system";
const updateFieldsSchema = z.record(z.string(), z.unknown());
const wrappedUpdateFieldsSchema = z.looseObject({
  fields: updateFieldsSchema,
});

const ROLE_LABELS: Record<UserPermissionLevel, string> = {
  anchor: "Owner/anchor",
  trusted: "Collaborator/trusted",
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
  const { visibility = "anchor", sideEffects } = options;
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

export function sanitizeEntity<T extends BaseEntity>(entity: T): T {
  if (entity.entityType === "image" && entity.content.startsWith("data:")) {
    return {
      ...entity,
      content: "[binary image data — use metadata for image info]",
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

export function normalizeUpdateInput(input: {
  fields?: Record<string, unknown>;
  content?: string;
}): {
  fields?: Record<string, unknown>;
  content?: string;
} {
  if (input.fields) {
    return { fields: input.fields };
  }

  if (!input.content) {
    return {};
  }

  try {
    const parsed = JSON.parse(input.content);
    const wrapped = wrappedUpdateFieldsSchema.safeParse(parsed);
    if (wrapped.success) {
      return { fields: wrapped.data.fields };
    }

    const fields = updateFieldsSchema.safeParse(parsed);
    if (fields.success) {
      return { fields: fields.data };
    }
  } catch {
    // Not JSON — treat as full content replacement.
  }

  return { content: input.content };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
