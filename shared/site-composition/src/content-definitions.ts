import { StructuredContentFormatter } from "@brains/content-formatters";
import type { JsonValue } from "@brains/contracts";
import type { Template } from "@brains/templates";
import { z } from "@brains/utils/zod";
import type {
  SiteContentArrayFieldDefinition,
  SiteContentDefinition,
  SiteContentFieldDefinition,
} from "@rizom/site";
export type {
  SiteContentArrayFieldDefinition,
  SiteContentDefinition,
  SiteContentEnumFieldDefinition,
  SiteContentFieldDefinition,
  SiteContentNumberFieldDefinition,
  SiteContentObjectFieldDefinition,
  SiteContentSectionDefinition,
  SiteContentStringFieldDefinition,
} from "@rizom/site";

export interface SiteContentPluginConfig {
  definitions?: SiteContentDefinition | SiteContentDefinition[];
}

interface FormatterFieldMapping {
  key: string;
  label: string;
  type: "string" | "number" | "object" | "array" | "custom";
  children?: FormatterFieldMapping[];
  itemType?: "string" | "number" | "object";
  itemMappings?: FormatterFieldMapping[];
  formatter?: (value: unknown) => string;
  parser?: (text: string) => unknown;
}

// Every field schema this module builds produces JSON: optional fields become
// `.nullable().default(null)`, and null is a JsonPrimitive. Declaring that
// makes z.object(shape) output a JsonObject, where ZodTypeAny made it
// Record<string, unknown> and forced the result to be asserted.
function applyOptional<T extends z.ZodType<JsonValue>>(
  schema: T,
  optional?: boolean,
): z.ZodType<JsonValue> {
  return optional ? schema.nullable().default(null) : schema;
}

function buildFieldSchema(
  field: SiteContentFieldDefinition,
): z.ZodType<JsonValue> {
  switch (field.type) {
    case "string":
      return applyOptional(z.string(), field.optional);
    case "number":
      return applyOptional(z.number(), field.optional);
    case "enum":
      return applyOptional(z.enum(field.options), field.optional);
    case "object": {
      const shape: Record<string, z.ZodType<JsonValue>> = {};
      for (const [key, child] of Object.entries(field.fields)) {
        shape[key] = buildFieldSchema(child);
      }
      return applyOptional(z.object(shape), field.optional);
    }
    case "array": {
      let schema = z.array(buildArrayItemSchema(field));
      if (field.minItems !== undefined) {
        schema = schema.min(field.minItems);
      }
      if (field.length !== undefined) {
        schema = schema.length(field.length);
      }
      return applyOptional(schema, field.optional);
    }
  }
}

function buildArrayItemSchema(
  field: SiteContentArrayFieldDefinition,
): z.ZodType<JsonValue> {
  const { items } = field;
  switch (items.type) {
    case "string":
      return z.string();
    case "number":
      return z.number();
    case "enum":
      return z.enum(items.options);
    case "object": {
      const shape: Record<string, z.ZodType<JsonValue>> = {};
      for (const [key, child] of Object.entries(items.fields)) {
        shape[key] = buildFieldSchema(child);
      }
      return z.object(shape);
    }
  }
}

function buildFieldMapping(
  key: string,
  field: SiteContentFieldDefinition,
): FormatterFieldMapping {
  switch (field.type) {
    case "string":
    case "enum":
      return { key, label: field.label, type: "string" };
    case "number":
      return { key, label: field.label, type: "number" };
    case "object":
      return {
        key,
        label: field.label,
        type: "object",
        children: Object.entries(field.fields).map(([childKey, childField]) =>
          buildFieldMapping(childKey, childField),
        ),
      };
    case "array": {
      const mapping: FormatterFieldMapping = {
        key,
        label: field.label,
        type: "array",
      };

      switch (field.items.type) {
        case "string":
        case "enum":
          mapping.itemType = "string";
          return mapping;
        case "number":
          mapping.itemType = "number";
          return mapping;
        case "object":
          mapping.itemType = "object";
          mapping.itemMappings = Object.entries(field.items.fields).map(
            ([childKey, childField]) => buildFieldMapping(childKey, childField),
          );
          return mapping;
      }
    }
  }
}

/**
 * One configured section, taken apart.
 *
 * A section is a schema, a way of writing it down and reading it back, and
 * a component that renders it. `createSiteContentTemplate` assembles those
 * into the runtime's `Template`; a package declaring the section instead
 * needs the parts, and its schema at the shape a declared view requires
 * rather than widened by the assembly.
 */
export interface SiteContentSectionParts {
  readonly description: string;
  readonly schema: z.ZodObject<Record<string, z.ZodType<JsonValue>>>;
  readonly formatter: StructuredContentFormatter<Record<string, JsonValue>>;
  readonly component: SiteContentDefinition["sections"][string]["layout"];
  readonly requiredPermission: NonNullable<
    SiteContentDefinition["sections"][string]["requiredPermission"]
  >;
  readonly fullscreen?: boolean | undefined;
  readonly runtimeScripts?:
    SiteContentDefinition["sections"][string]["runtimeScripts"] | undefined;
}

export function siteContentSectionParts(
  section: SiteContentDefinition["sections"][string],
): SiteContentSectionParts {
  const shape: Record<string, z.ZodType<JsonValue>> = {};
  for (const [key, field] of Object.entries(section.fields)) {
    shape[key] = buildFieldSchema(field);
  }
  const schema = z.object(shape);
  return {
    description: section.description,
    schema,
    formatter: new StructuredContentFormatter(schema, {
      title: section.title,
      mappings: Object.entries(section.fields).map(([key, field]) =>
        buildFieldMapping(key, field),
      ),
    }),
    component: section.layout,
    requiredPermission: section.requiredPermission ?? "public",
    ...(section.fullscreen !== undefined
      ? { fullscreen: section.fullscreen }
      : {}),
    ...(section.runtimeScripts
      ? { runtimeScripts: section.runtimeScripts }
      : {}),
  };
}

export function createSiteContentTemplate(
  name: string,
  section: SiteContentDefinition["sections"][string],
): Template {
  const parts = siteContentSectionParts(section);
  return {
    name,
    description: parts.description,
    schema: parts.schema,
    formatter: parts.formatter,
    requiredPermission: parts.requiredPermission,
    layout: {
      component: parts.component,
      ...(parts.fullscreen !== undefined
        ? { fullscreen: parts.fullscreen }
        : {}),
    },
    ...(parts.runtimeScripts ? { runtimeScripts: parts.runtimeScripts } : {}),
  };
}

export function createSiteContentTemplates(
  definition: SiteContentDefinition,
): Record<string, Template> {
  const templates: Record<string, Template> = {};
  for (const [sectionId, section] of Object.entries(definition.sections)) {
    templates[sectionId] = createSiteContentTemplate(sectionId, section);
  }
  return templates;
}
