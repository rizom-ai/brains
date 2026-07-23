import { formatLabel, pluralize } from "@brains/utils/string-utils";
// Base-note entity type id (mirrors NOTE_ENTITY_TYPE in @brains/entity-service,
// which plugins may not import directly and @brains/plugins does not re-export).
const NOTE_ENTITY_TYPE = "note";

/**
 * Per-entity-type display metadata accepted by the editor API.
 * Structurally compatible with `EntityDisplayEntry` from `@brains/plugins` —
 * shell callers can pass their full registry map without conversion.
 */
export interface EntityDisplayLabel {
  label?: string;
  pluralName?: string;
}

export type CmsEntityDisplayMap = Partial<Record<string, EntityDisplayLabel>>;

/**
 * Field widget descriptor the editor form renderer consumes.
 * (Inherited from the Sveltia widget vocabulary; now first-party.)
 */
export interface CmsFieldCondition {
  field: string;
  value: unknown;
}

export interface CmsFieldWidget {
  name: string;
  label: string;
  widget: string;
  required?: boolean;
  default?: unknown;
  options?: string[];
  condition?: CmsFieldCondition;
  field?: CmsFieldWidget;
  fields?: CmsFieldWidget[];
}

const LONG_TEXT_FIELDS = new Set([
  "description",
  "excerpt",
  "summary",
  "tagline",
  "story",
]);

function pluralizeLabel(label: string): string {
  if (label.endsWith("s")) return label;
  return pluralize(label);
}

/**
 * Base notes are raw Markdown: no frontmatter form, and a leading `---`
 * is a horizontal rule, not a YAML delimiter.
 */
export function isRawEntityType(entityType: string): boolean {
  return entityType === NOTE_ENTITY_TYPE;
}

/**
 * Resolve the display labels for an entity type, honouring any
 * entityDisplay override.
 */
export function entityTypeLabels(
  entityType: string,
  display?: EntityDisplayLabel,
): { label: string; pluralLabel: string } {
  const defaultLabel =
    entityType === NOTE_ENTITY_TYPE ? "Note" : formatLabel(entityType);
  const label = display?.label ?? defaultLabel;
  return { label, pluralLabel: display?.pluralName ?? pluralizeLabel(label) };
}

interface UnwrappedSchema {
  inner: unknown;
  isOptional: boolean;
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

function getKind(schema: unknown): string | undefined {
  const type = getDefinition(schema)?.["type"];
  return typeof type === "string" ? type : undefined;
}

function readCmsCondition(schema: unknown): CmsFieldCondition | undefined {
  if (!isRecord(schema)) return undefined;
  const readMetadata = schema["meta"];
  if (typeof readMetadata !== "function") return undefined;
  const metadata: unknown = readMetadata.call(schema);
  if (!isRecord(metadata)) return undefined;
  const condition = metadata["cmsCondition"];
  if (
    !isRecord(condition) ||
    typeof condition["field"] !== "string" ||
    !Object.hasOwn(condition, "value")
  ) {
    return undefined;
  }
  return { field: condition["field"], value: condition["value"] };
}

function readDefaultValue(value: unknown): unknown {
  return typeof value === "function" ? value() : value;
}

function unwrapZodType(
  schema: unknown,
  isOptional = false,
  defaultValue?: unknown,
): UnwrappedSchema {
  const kind = getKind(schema);
  const definition = getDefinition(schema);

  if (kind === "optional" || kind === "nullable") {
    return unwrapZodType(definition?.["innerType"], true, defaultValue);
  }
  if (kind === "default") {
    return unwrapZodType(
      definition?.["innerType"],
      true,
      readDefaultValue(definition?.["defaultValue"]),
    );
  }
  const result: UnwrappedSchema = { inner: schema, isOptional };
  if (defaultValue !== undefined) {
    result.defaultValue = defaultValue;
  }
  return result;
}

function readEnumValues(schema: unknown): string[] | undefined {
  const entries = getDefinition(schema)?.["entries"];
  if (!isRecord(entries)) return undefined;
  const values = Object.values(entries);
  return values.every((value) => typeof value === "string")
    ? values
    : undefined;
}

function readLiteralDefault(schema: unknown): unknown {
  const values = getDefinition(schema)?.["values"];
  return Array.isArray(values) ? values[0] : undefined;
}

function hasDateTimeCheck(schema: unknown): boolean {
  const checks = getDefinition(schema)?.["checks"];
  if (!Array.isArray(checks)) return false;
  return checks.some((check) => {
    const definition = getDefinition(check);
    return definition?.["format"] === "datetime";
  });
}

/**
 * String fields holding image-entity ids follow the <role>ImageId naming
 * convention (coverImageId, ogImageId, plain imageId).
 */
function isImageReferenceField(name: string): boolean {
  return name === "imageId" || name.endsWith("ImageId");
}

function readShape(schema: unknown): Record<string, unknown> | undefined {
  if (!isRecord(schema)) return undefined;
  const shape = schema["shape"];
  return isRecord(shape) ? shape : undefined;
}

/**
 * Map a single Zod field to a form widget descriptor
 */
export function zodFieldToCmsWidget(
  name: string,
  fieldSchema: unknown,
): CmsFieldWidget {
  const { inner, isOptional, defaultValue } = unwrapZodType(fieldSchema);
  const kind = getKind(inner);
  const effectiveDefault = defaultValue ?? readLiteralDefault(inner);
  const condition = readCmsCondition(fieldSchema);

  const base: CmsFieldWidget = {
    name,
    label: formatLabel(name),
    widget: "string",
    ...(isOptional && { required: false }),
    ...(effectiveDefault !== undefined && { default: effectiveDefault }),
    ...(condition && { condition }),
  };

  switch (kind) {
    case "string": {
      if (isImageReferenceField(name)) {
        return { ...base, widget: "image" };
      }
      if (hasDateTimeCheck(inner)) {
        return { ...base, widget: "datetime" };
      }
      if (LONG_TEXT_FIELDS.has(name)) {
        return { ...base, widget: "text" };
      }
      return { ...base, widget: "string" };
    }
    case "number":
      return { ...base, widget: "number" };
    case "boolean":
      return { ...base, widget: "boolean" };
    case "enum": {
      const options = readEnumValues(inner);
      return { ...base, widget: "select", ...(options ? { options } : {}) };
    }
    case "array": {
      const elementType = getDefinition(inner)?.["element"];
      const elementWidget = zodFieldToCmsWidget("item", elementType);
      if (elementWidget.widget === "object" && elementWidget.fields) {
        return { ...base, widget: "list", fields: elementWidget.fields };
      }
      return {
        ...base,
        widget: "list",
        field: { name, label: formatLabel(name), widget: elementWidget.widget },
      };
    }
    case "object": {
      const fields = Object.entries(readShape(inner) ?? {}).map(
        ([key, value]) => zodFieldToCmsWidget(key, value),
      );
      return { ...base, widget: "object", fields };
    }
    case "literal":
      return { ...base, widget: "string" };
    default:
      return { ...base, widget: "string" };
  }
}
