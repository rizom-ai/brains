import {
  safeParse,
  type AnySchema,
  type ZodRawShapeCompat,
} from "@modelcontextprotocol/sdk/server/zod-compat.js";

interface SchemaInternals {
  _def?: {
    typeName?: string;
    innerType?: AnySchema;
  };
  _zod?: {
    def?: {
      type?: string;
      innerType?: AnySchema;
    };
  };
  unwrap?: () => AnySchema;
  removeDefault?: () => AnySchema;
}

function getTypeName(schema: AnySchema): string | undefined {
  const internals = schema as SchemaInternals;
  return internals._def?.typeName ?? internals._zod?.def?.type;
}

function getInnerType(schema: AnySchema): AnySchema | undefined {
  const internals = schema as SchemaInternals;
  return (
    internals._def?.innerType ??
    internals._zod?.def?.innerType ??
    internals.unwrap?.() ??
    internals.removeDefault?.()
  );
}

/**
 * Get the inner type of a Zod schema, unwrapping optional/default wrappers.
 */
function unwrapType(schema: AnySchema): AnySchema {
  const typeName = getTypeName(schema);
  if (typeName === "ZodOptional" || typeName === "optional") {
    const inner = getInnerType(schema);
    return inner ? unwrapType(inner) : schema;
  }
  if (typeName === "ZodDefault" || typeName === "default") {
    const inner = getInnerType(schema);
    return inner ? unwrapType(inner) : schema;
  }
  return schema;
}

/**
 * Check if a schema field is required (not optional, no default).
 */
function isRequired(schema: AnySchema): boolean {
  const typeName = getTypeName(schema);
  return !["ZodOptional", "optional", "ZodDefault", "default"].includes(
    typeName ?? "",
  );
}

/**
 * Coerce a string value to the type expected by the schema.
 */
function coerceValue(value: string, schema: AnySchema): unknown {
  const innerTypeName = getTypeName(unwrapType(schema));

  if (innerTypeName === "ZodNumber" || innerTypeName === "number") {
    return Number(value);
  }
  if (innerTypeName === "ZodBoolean" || innerTypeName === "boolean") {
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
  inputSchema: ZodRawShapeCompat,
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
      const parsed = safeParse(fieldSchema, undefined);
      if (parsed.success && parsed.data !== undefined) {
        result[name] = parsed.data;
      }
    }
  }

  return result;
}
