import { z } from "@brains/utils/zod-v4";
import type { ToolInputSchema } from "./types";

type ToolSchemaField = ToolInputSchema[string];

interface SchemaInternals {
  _zod?: {
    def?: {
      type?: string;
      innerType?: ToolSchemaField;
    };
  };
  unwrap?: () => ToolSchemaField;
  removeDefault?: () => ToolSchemaField;
}

function isSchemaWithInternals(
  schema: ToolSchemaField,
): schema is ToolSchemaField & SchemaInternals {
  return "_zod" in schema;
}

function getSchemaInternals(schema: ToolSchemaField): SchemaInternals {
  if (!isSchemaWithInternals(schema)) {
    throw new Error(
      "Tool input schemas must use the blessed Zod 4 export from @rizom/brain.",
    );
  }
  return schema;
}

function getTypeName(schema: ToolSchemaField): string | undefined {
  return getSchemaInternals(schema)._zod?.def?.type;
}

function getInnerType(schema: ToolSchemaField): ToolSchemaField | undefined {
  const internals = getSchemaInternals(schema);
  return (
    internals._zod?.def?.innerType ??
    internals.unwrap?.() ??
    internals.removeDefault?.()
  );
}

/**
 * Get the inner type of a Zod schema, unwrapping optional/default wrappers.
 */
function unwrapType(schema: ToolSchemaField): ToolSchemaField {
  const typeName = getTypeName(schema);
  if (typeName === "optional") {
    const inner = getInnerType(schema);
    return inner ? unwrapType(inner) : schema;
  }
  if (typeName === "default") {
    const inner = getInnerType(schema);
    return inner ? unwrapType(inner) : schema;
  }
  return schema;
}

/**
 * Check if a schema field is required (not optional, no default).
 */
function isRequired(schema: ToolSchemaField): boolean {
  const typeName = getTypeName(schema);
  return !["optional", "default"].includes(typeName ?? "");
}

/**
 * Coerce a string value to the type expected by the schema.
 */
function coerceValue(value: string, schema: ToolSchemaField): unknown {
  const innerTypeName = getTypeName(unwrapType(schema));

  if (innerTypeName === "number") {
    return Number(value);
  }
  if (innerTypeName === "boolean") {
    return value === "true";
  }
  return value;
}

/**
 * Map CLI positional args and flags to tool input using the tool's inputSchema.
 *
 * - Positional args map to schema fields in declaration order
 * - Flags (--name value) map to schema fields by name
 * - Defaults from Zod schema apply for missing optional fields
 * - String values are coerced to number/boolean when schema expects it
 */
export function mapArgsToInput(
  inputSchema: ToolInputSchema,
  args: string[],
  flags: Record<string, unknown>,
): Record<string, unknown> {
  const fieldNames = Object.keys(inputSchema);
  const result: Record<string, unknown> = {};

  // Map positional args to fields in order
  let argIdx = 0;
  for (const name of fieldNames) {
    const fieldSchema = inputSchema[name];
    if (!fieldSchema) continue;

    // Check if this field was provided as a flag
    if (name in flags) {
      const value = flags[name];
      result[name] =
        typeof value === "string" ? coerceValue(value, fieldSchema) : value;
      continue;
    }

    // Map next positional arg
    if (argIdx < args.length) {
      const arg = args[argIdx];
      if (arg !== undefined) {
        result[name] = coerceValue(arg, fieldSchema);
      }
      argIdx++;
      continue;
    }

    // No arg and no flag — let Zod defaults handle it
    if (!isRequired(fieldSchema)) {
      // Parse undefined through the schema to get defaults
      const parsed = z.safeParse(fieldSchema, undefined);
      if (parsed.success && parsed.data !== undefined) {
        result[name] = parsed.data;
      }
    }
  }

  return result;
}
