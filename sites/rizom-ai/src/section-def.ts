import type { JSX } from "preact";
import { createTemplate, type Template } from "@brains/templates";
import type { SectionDefinition } from "@brains/site-composition";
import {
  StructuredContentFormatter,
  type FieldMapping,
} from "@brains/content-formatters";
import { z } from "@brains/utils/zod";

export const CONTENT_NAMESPACE = "rizom-ai-site";

/** "buttonText" → "Button Text", "cap" → "Cap" */
function fieldLabel(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ");
  return spaced
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function unwrapOptional(schema: z.ZodType): z.ZodType {
  let current = schema;
  while (current instanceof z.ZodOptional) {
    current = current.unwrap() as z.ZodType;
  }
  return current;
}

function toMapping(key: string, fieldSchema: z.ZodType): FieldMapping {
  const label = fieldLabel(key);
  const schema = unwrapOptional(fieldSchema);

  if (
    schema instanceof z.ZodString ||
    schema instanceof z.ZodEnum ||
    schema instanceof z.ZodLiteral
  ) {
    return { key, label, type: "string" };
  }
  if (schema instanceof z.ZodNumber) {
    return { key, label, type: "number" };
  }
  if (schema instanceof z.ZodObject) {
    return { key, label, type: "object", children: shapeMappings(schema) };
  }
  if (schema instanceof z.ZodArray) {
    const element = unwrapOptional(schema.element as z.ZodType);
    if (element instanceof z.ZodObject) {
      return {
        key,
        label,
        type: "array",
        itemType: "object",
        itemMappings: shapeMappings(element),
      };
    }
    if (element instanceof z.ZodNumber) {
      return { key, label, type: "array", itemType: "number" };
    }
    return { key, label, type: "array", itemType: "string" };
  }

  throw new Error(
    `Section field "${key}" has a schema type the markdown formatter ` +
      `cannot derive headings for — use string/number/enum/object/array.`,
  );
}

function shapeMappings(schema: z.ZodObject<z.ZodRawShape>): FieldMapping[] {
  return Object.entries(schema.shape).map(([key, field]) =>
    toMapping(key, field as z.ZodType),
  );
}

/**
 * Derive the markdown heading structure for a section straight from its
 * zod schema, so stored content is site-content-style editable markdown
 * (## per field, ### per array item) with no per-section mapping tables.
 * Unsupported schema shapes fail here, at definition time.
 */
function sectionFormatter<T>(
  title: string,
  schema: z.ZodType<T>,
): StructuredContentFormatter<T> {
  const runtimeSchema: unknown = schema;
  if (!(runtimeSchema instanceof z.ZodObject)) {
    throw new Error(`Section schema for "${title}" must be a zod object.`);
  }
  return new StructuredContentFormatter<T>(schema, {
    title,
    mappings: shapeMappings(runtimeSchema),
  });
}

/**
 * One site section, fully colocated: zod schema, Preact component,
 * and the fallback copy the route ships when no content entity
 * overrides it. Pages export an ordered `SectionDef[]`; the template
 * registry and route section lists are derived from those lists, so
 * adding a section is a single entry in its page file.
 */
export interface SectionDef<T = unknown> {
  name: string;
  template: Template;
  component: (props: T) => JSX.Element;
  fallback: T;
}

/** Erased element type for heterogeneous section lists. */
export interface AnySectionDef {
  name: string;
  template: Template;
  component: (props: never) => JSX.Element;
  fallback: unknown;
}

export function defineSection<T>(options: {
  name: string;
  description: string;
  schema: z.ZodType<T>;
  component: (props: T) => JSX.Element;
  fallback: T;
}): SectionDef<T> {
  return {
    name: options.name,
    component: options.component,
    fallback: options.schema.parse(options.fallback),
    template: createTemplate<T>({
      name: options.name,
      description: options.description,
      schema: options.schema,
      formatter: sectionFormatter(options.description, options.schema),
      requiredPermission: "public",
      layout: { component: options.component },
    }),
  };
}

/** Template registry entries for a page's sections. */
export function toTemplates(
  defs: readonly AnySectionDef[],
): Record<string, Template> {
  return Object.fromEntries(defs.map((def) => [def.name, def.template]));
}

/**
 * Route `sections:` list for a page, in page order. Section names carry
 * the page prefix for the flat template registry ("home-hero"); the route
 * section id drops it, so the saved-content entity id is "home:hero" and
 * the synced file nests as site-content/home/hero.md instead of
 * site-content/home/home-hero.md.
 */
export function toRouteSections(
  routeId: string,
  defs: readonly AnySectionDef[],
): SectionDefinition[] {
  return defs.map((def) => ({
    id: def.name.startsWith(`${routeId}-`)
      ? def.name.slice(routeId.length + 1)
      : def.name,
    template: `${CONTENT_NAMESPACE}:${def.name}`,
    content: def.fallback,
  }));
}
