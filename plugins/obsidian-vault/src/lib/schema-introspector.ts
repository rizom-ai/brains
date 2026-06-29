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

interface UnwrappedSchema {
  inner: unknown;
  required: boolean;
  defaultValue?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getDefinition(schema: unknown): Record<string, unknown> | undefined {
  if (!isRecord(schema)) return undefined;
  const definition = schema["def"];
  return isRecord(definition) ? definition : undefined;
}

function getSchemaKind(schema: unknown): string | undefined {
  const type = getDefinition(schema)?.["type"];
  return typeof type === "string" ? type : undefined;
}

function readDefaultValue(value: unknown): unknown {
  return typeof value === "function" ? value() : value;
}

/**
 * Unwrap Zod 4 wrappers (optional, default, nullable) to get the base type.
 */
function unwrap(schema: unknown): UnwrappedSchema {
  let inner = schema;
  let required = true;
  let defaultValue: unknown = undefined;
  let hasDefault = false;

  let changed = true;
  while (changed) {
    changed = false;
    const definition = getDefinition(inner);
    const kind = getSchemaKind(inner);

    if (kind === "optional" || kind === "nullable") {
      required = false;
      inner = definition?.["innerType"];
      changed = true;
      continue;
    }

    if (kind === "default") {
      required = false;
      hasDefault = true;
      defaultValue = readDefaultValue(definition?.["defaultValue"]);
      inner = definition?.["innerType"];
      changed = true;
    }
  }

  const result: UnwrappedSchema = {
    inner,
    required,
  };
  if (hasDefault) {
    result.defaultValue = defaultValue;
  }
  return result;
}

function readEnumValues(schema: unknown): string[] | undefined {
  const definition = getDefinition(schema);
  const entries = definition?.["entries"];
  if (!isRecord(entries)) return undefined;
  const entryValues = Object.values(entries);
  if (!entryValues.every((value) => typeof value === "string"))
    return undefined;
  return entryValues;
}

function readLiteralValue(schema: unknown): unknown {
  const definition = getDefinition(schema);
  const values = definition?.["values"];
  if (Array.isArray(values)) return values[0];
  return definition?.["value"];
}

/**
 * Determine the field type from the unwrapped Zod type.
 */
function classifyType(
  schema: unknown,
): Pick<FieldInfo, "type" | "enumValues" | "defaultValue"> {
  const kind = getSchemaKind(schema);

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

  // Coerced date shapes can produce a pipeline/pipe wrapping ZodDate.
  if (kind === "pipeline" || kind === "pipe") {
    const definition = getDefinition(schema);
    return classifyType(definition?.["out"]);
  }

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
