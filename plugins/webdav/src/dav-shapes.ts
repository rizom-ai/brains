import {
  getKind,
  readEnumValues,
  readLiteralValue,
  readMetadata,
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
    // Bookkeeping the type hides from Studio's form is internal, not
    // authored, and stays out of the vault.
    if (readMetadata(fieldSchema)?.["studioWidget"] === "hidden") continue;
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

/** What a sync client needs of a type to write its template, fileClass and base. */
export interface VaultShape {
  entityType: string;
  /** A singleton gets no template or base of its own, only a place in Settings. */
  singleton: boolean;
  /** The body a new entry of the type starts from. */
  bodyTemplate: string;
  fields: FieldInfo[];
}

/** The parts of the brain's entity shapes the vault description reads. */
export interface VaultShapeSource {
  types(): string[];
  frontmatterSchema(type: string): ZodObjectLike | undefined;
  isSingleton(type: string): boolean;
  bodyTemplate(type: string): string;
  fileExtension(type: string): ".md" | ".yaml";
}

/**
 * Every type a vault writes markdown for, with its fields. A YAML type is
 * left out (Obsidian hides YAML files: its records are edited in Studio), as
 * is a type with no frontmatter schema.
 */
export function vaultShapes(source: VaultShapeSource): VaultShape[] {
  return source.types().flatMap((entityType): VaultShape[] => {
    if (source.fileExtension(entityType) === ".yaml") return [];
    const schema = source.frontmatterSchema(entityType);
    if (!schema) return [];
    return [
      {
        entityType,
        singleton: source.isSingleton(entityType),
        bodyTemplate: source.bodyTemplate(entityType),
        fields: introspectSchema(schema),
      },
    ];
  });
}
