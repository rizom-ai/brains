import {
  z,
  entityGroupingSchema,
  type OperatorEntityGroupings,
} from "@brains/sdk/services";
import { formatLabel, pluralize } from "@brains/utils/string-utils";
import { normalizeStudioBasePath } from "./studio-paths";
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
import { isRecord } from "@brains/utils/is-record";
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
 * Notes use whole-document editing unless their type participates in a
 * registered grouping. Participation exposes the effective Properties schema
 * for every note, including notes with no membership yet.
 */
export function isRawEntityType(
  entityType: string,
  groupings: Pick<OperatorEntityGroupings, "contributes">,
): boolean {
  return entityType === NOTE_ENTITY_TYPE && !groupings.contributes(entityType);
}

/**
 * Resolve the display labels for an entity type, honouring any
 * entityDisplay override.
 */
export function entityTypeLabels(
  entityType: string,
  display?: EntityDisplayLabel,
): { label: string; pluralLabel: string } {
  if (entityType === "grouping-vocabulary")
    return {
      label: display?.label ?? "Groupings",
      pluralLabel: display?.pluralName ?? "Groupings",
    };
  const defaultLabel =
    entityType === NOTE_ENTITY_TYPE ? "Note" : formatLabel(entityType);
  const label = display?.label ?? defaultLabel;
  return { label, pluralLabel: display?.pluralName ?? pluralizeLabel(label) };
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

const entityDisplayEntrySchema: z.ZodObject<
  {
    label: z.ZodOptional<z.ZodString>;
    pluralName: z.ZodOptional<z.ZodString>;
  },
  z.core.$loose
> = z.looseObject({
  label: z.string().optional(),
  pluralName: z.string().optional(),
});

const entityDisplaySchema: z.ZodRecord<
  z.ZodString,
  typeof entityDisplayEntrySchema
> = z.record(z.string(), entityDisplayEntrySchema);

export const studioConfigSchema: z.ZodObject<{
  entityDisplay: z.ZodOptional<typeof entityDisplaySchema>;
  groupings: z.ZodDefault<z.ZodArray<typeof entityGroupingSchema>>;
  routePath: z.ZodDefault<z.ZodString>;
}> = z.object({
  entityDisplay: entityDisplaySchema.optional(),
  groupings: z.array(entityGroupingSchema).max(20).default([]),
  routePath: z
    .string()
    .default("/studio")
    .refine(
      (routePath) =>
        !["/cms", "/account", "/admin"].includes(
          normalizeStudioBasePath(routePath),
        ),
      {
        message:
          '"/cms", "/account", and "/admin" are reserved for Studio redirects',
      },
    ),
});

export type StudioConfig = z.output<typeof studioConfigSchema>;
export type StudioConfigInput = z.input<typeof studioConfigSchema>;

/** The brain's own display map, when it parses as one. */
export function parseEntityDisplay(
  value: unknown,
): StudioEntityDisplayMap | undefined {
  const parsed = entityDisplaySchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
