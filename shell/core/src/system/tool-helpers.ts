import type { BaseEntity } from "@brains/entity-service";
import type { Tool, ToolContext, ToolResponse } from "@brains/mcp-service";
import { getErrorMessage, type z } from "@brains/utils";

const PLUGIN_ID = "system";

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
    const parsed = JSON.parse(input.content) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      if (
        "fields" in parsed &&
        typeof parsed.fields === "object" &&
        parsed.fields !== null &&
        !Array.isArray(parsed.fields)
      ) {
        return {
          fields: parsed.fields as Record<string, unknown>,
        };
      }

      return {
        fields: parsed as Record<string, unknown>,
      };
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
