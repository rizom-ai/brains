import { z } from "@brains/utils";

export interface FieldInfo {
  name: string;
  type: "string" | "number" | "boolean" | "array" | "enum" | "date" | "unknown";
  required: boolean;
  defaultValue?: unknown;
  enumValues?: string[];
}

/**
 * Unwrap Zod wrappers (optional, default, nullable) to get the base type.
 * Returns the inner type and whether the field is optional/has a default.
 */
function unwrap(schema: z.ZodTypeAny): {
  inner: z.ZodTypeAny;
  required: boolean;
  defaultValue?: unknown;
} {
  let inner = schema;
  let required = true;
  let defaultValue: unknown = undefined;
  let hasDefault = false;

  // Peel layers — order matters because ZodDefault wraps ZodOptional etc.
  let changed = true;
  while (changed) {
    changed = false;

    if (inner instanceof z.ZodOptional) {
      required = false;
      inner = inner._def.innerType;
      changed = true;
    }

    if (inner instanceof z.ZodDefault) {
      required = false;
      hasDefault = true;
      defaultValue = inner._def.defaultValue();
      inner = inner._def.innerType;
      changed = true;
    }

    if (inner instanceof z.ZodNullable) {
      required = false;
      inner = inner._def.innerType;
      changed = true;
    }
  }

  const result: {
    inner: z.ZodTypeAny;
    required: boolean;
    defaultValue?: unknown;
  } = {
    inner,
    required,
  };
  if (hasDefault) {
    result.defaultValue = defaultValue;
  }
  return result;
}

/**
 * Determine the field type from the unwrapped Zod type.
 */
function classifyType(
  schema: z.ZodTypeAny,
): Pick<FieldInfo, "type" | "enumValues" | "defaultValue"> {
  if (schema instanceof z.ZodEnum) {
    return { type: "enum", enumValues: schema._def.values as string[] };
  }
  if (schema instanceof z.ZodLiteral) {
    return { type: "string", defaultValue: schema._def.value };
  }
  if (schema instanceof z.ZodString) return { type: "string" };
  if (schema instanceof z.ZodNumber) return { type: "number" };
  if (schema instanceof z.ZodBoolean) return { type: "boolean" };
  if (schema instanceof z.ZodArray) return { type: "array" };
  if (schema instanceof z.ZodDate) return { type: "date" };

  // z.coerce.date() produces a ZodPipeline wrapping ZodDate
  if (schema instanceof z.ZodPipeline) {
    const out = schema._def.out;
    if (out instanceof z.ZodDate) return { type: "date" };
  }

  return { type: "unknown" };
}

/**
 * Introspect a Zod object schema and extract field information.
 */
export function introspectSchema(
  schema: z.ZodObject<z.ZodRawShape>,
): FieldInfo[] {
  const shape = schema.shape;
  const fields: FieldInfo[] = [];

  for (const [name, fieldSchema] of Object.entries(shape)) {
    const {
      inner,
      required,
      defaultValue: unwrapDefault,
    } = unwrap(fieldSchema);
    const classified = classifyType(inner);

    const field: FieldInfo = {
      name,
      type: classified.type,
      required,
    };

    // Merge default values: unwrap default (from ZodDefault) takes precedence,
    // then classified default (from ZodLiteral)
    const effectiveDefault =
      unwrapDefault !== undefined ? unwrapDefault : classified.defaultValue;
    if (effectiveDefault !== undefined) {
      field.defaultValue = effectiveDefault;
    }

    if (classified.enumValues) {
      field.enumValues = classified.enumValues;
    }

    fields.push(field);
  }

  return fields;
}
