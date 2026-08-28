import { formatLabel, pluralize } from "@brains/utils/string-utils";
import {
  getArrayElement,
  getKind,
  getObjectShape,
  hasStringFormat,
  readEnumValues,
  readLiteralValue,
  readMetadata,
  unwrapField,
} from "@brains/utils/zod-introspect";
// Base-note entity type id (mirrors NOTE_ENTITY_TYPE in @brains/entity-service,
// which plugins may not import directly and @brains/plugins does not re-export).
const NOTE_ENTITY_TYPE = "note";

/**
 * Per-entity-type display metadata accepted by the editor API.
 * Structurally compatible with `EntityDisplayEntry` from `@brains/plugins` —
 * shell callers can pass their full registry map without conversion.
 */
export interface EntityDisplayLabel {
  label?: string | undefined;
  pluralName?: string | undefined;
}

export type StudioEntityDisplayMap = Partial<
  Record<string, EntityDisplayLabel>
>;

/**
 * Field widget descriptor the editor form renderer consumes.
 * (Inherited from the Sveltia widget vocabulary; now first-party.)
 */
export interface StudioFieldCondition {
  field: string;
  value: unknown;
}

export interface StudioFieldWidget {
  name: string;
  label: string;
  widget: string;
  required?: boolean;
  default?: unknown;
  options?: string[];
  condition?: StudioFieldCondition;
  field?: StudioFieldWidget;
  fields?: StudioFieldWidget[];
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readStudioCondition(
  schema: unknown,
): StudioFieldCondition | undefined {
  const condition = readMetadata(schema)?.["studioCondition"];
  if (
    !isRecord(condition) ||
    typeof condition["field"] !== "string" ||
    !Object.hasOwn(condition, "value")
  ) {
    return undefined;
  }
  return { field: condition["field"], value: condition["value"] };
}

/**
 * String fields holding image-entity ids follow the <role>ImageId naming
 * convention (coverImageId, ogImageId, plain imageId).
 */
function isImageReferenceField(name: string): boolean {
  return name === "imageId" || name.endsWith("ImageId");
}

/**
 * Map a single Zod field to a form widget descriptor
 */
export function zodFieldToStudioWidget(
  name: string,
  fieldSchema: unknown,
): StudioFieldWidget {
  const { inner, required, defaultValue } = unwrapField(fieldSchema);
  const kind = getKind(inner);
  const effectiveDefault = defaultValue ?? readLiteralValue(inner);
  const condition = readStudioCondition(fieldSchema);

  const base: StudioFieldWidget = {
    name,
    label: formatLabel(name),
    widget: "string",
    ...(!required && { required: false }),
    ...(effectiveDefault !== undefined && { default: effectiveDefault }),
    ...(condition && { condition }),
  };

  switch (kind) {
    case "string": {
      if (isImageReferenceField(name)) {
        return { ...base, widget: "image" };
      }
      if (hasStringFormat(inner, "datetime")) {
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
      const elementType = getArrayElement(inner);
      const elementWidget = zodFieldToStudioWidget("item", elementType);
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
      const fields = Object.entries(getObjectShape(inner) ?? {}).map(
        ([key, value]) => zodFieldToStudioWidget(key, value),
      );
      return { ...base, widget: "object", fields };
    }
    case "literal":
      return { ...base, widget: "string" };
    default:
      return { ...base, widget: "string" };
  }
}
