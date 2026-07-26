import {
  getKind,
  readEnumValues,
  readLiteralValue,
  unwrapField,
} from "@brains/utils/zod-introspect";

export interface FieldInfo {
  name: string;
  type: "string" | "number" | "boolean" | "array" | "enum" | "date" | "unknown";
  required: boolean;
  defaultValue?: unknown;
  enumValues?: string[];
}

interface ZodObjectLike {
  shape: Record<string, unknown>;
}

/**
 * Determine the field type from the unwrapped Zod type.
 */
function classifyType(
  schema: unknown,
): Pick<FieldInfo, "type" | "enumValues" | "defaultValue"> {
  const kind = getKind(schema);

  if (kind === "enum") {
    const enumValues = readEnumValues(schema);
    return enumValues ? { type: "enum", enumValues } : { type: "enum" };
  }
  if (kind === "literal") {
    return { type: "string", defaultValue: readLiteralValue(schema) };
  }
  if (kind === "string") return { type: "string" };
  if (kind === "number") return { type: "number" };
  if (kind === "boolean") return { type: "boolean" };
  if (kind === "array") return { type: "array" };
  if (kind === "date") return { type: "date" };

  return { type: "unknown" };
}

/**
 * Introspect a Zod object schema and extract field information.
 */
export function introspectSchema(schema: ZodObjectLike): FieldInfo[] {
  const fields: FieldInfo[] = [];

  for (const [name, fieldSchema] of Object.entries(schema.shape)) {
    const {
      inner,
      required,
      defaultValue: unwrapDefault,
    } = unwrapField(fieldSchema);
    const classified = classifyType(inner);

    const field: FieldInfo = {
      name,
      type: classified.type,
      required,
    };

    // Merge default values: explicit schema defaults take precedence, then
    // literal-derived defaults.
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
