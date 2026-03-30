import { z } from "@brains/utils";

type ZodRawShape = Record<string, z.ZodTypeAny>;

/**
 * Get the inner type of a Zod schema, unwrapping optional/default wrappers.
 */
function unwrapType(schema: z.ZodTypeAny): z.ZodTypeAny {
  if (schema instanceof z.ZodOptional) {
    return unwrapType(schema.unwrap());
  }
  if (schema instanceof z.ZodDefault) {
    return unwrapType(schema.removeDefault());
  }
  return schema;
}

/**
 * Check if a schema field is required (not optional, no default).
 */
function isRequired(schema: z.ZodTypeAny): boolean {
  if (schema instanceof z.ZodOptional) return false;
  if (schema instanceof z.ZodDefault) return false;
  return true;
}

/**
 * Coerce a string value to the type expected by the schema.
 */
function coerceValue(value: string, schema: z.ZodTypeAny): unknown {
  const inner = unwrapType(schema);

  if (inner instanceof z.ZodNumber) {
    return Number(value);
  }
  if (inner instanceof z.ZodBoolean) {
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
  inputSchema: ZodRawShape,
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
      const parsed = fieldSchema.safeParse(undefined);
      if (parsed.success && parsed.data !== undefined) {
        result[name] = parsed.data;
      }
    }
  }

  return result;
}
