import type { BaseEntity } from "@brains/entity-service";
import type { Tool, ToolContext, ToolResponse } from "@brains/mcp-service";
import type {
  EntityAction,
  PermissionService,
  UserPermissionLevel,
} from "@brains/templates";
import { getErrorMessage } from "@brains/utils";
import type { z } from "@brains/utils/zod";
import { z as z4 } from "@brains/utils/zod-v4";

const PLUGIN_ID = "system";
const updateFieldsSchema = z4.record(z4.string(), z4.unknown());
const wrappedUpdateFieldsSchema = z4.looseObject({
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
    input: z.infer<TSchema>,
    context: ToolContext,
  ) => Promise<ToolResponse>,
  options: { visibility?: Tool["visibility"] } = {},
): Tool {
  const { visibility = "anchor" } = options;
  return {
    name: `${PLUGIN_ID}_${name}`,
    description,
    inputSchema: inputSchema.shape,
    handler: async (input, context): Promise<ToolResponse> => {
      const parseResult = inputSchema.safeParse(input);
      if (!parseResult.success) {
        return {
          success: false,
          error: `Invalid input: ${parseResult.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")}`,
        };
      }
      try {
        return await handler(parseResult.data, context);
      } catch (error) {
        return { success: false, error: getErrorMessage(error) };
      }
    },
    visibility,
  };
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

export function hasStructuredFrontmatter(
  schema: z.ZodObject<z.ZodRawShape> | undefined,
): boolean {
  return !!schema && Object.keys(schema.shape).length > 0;
}
