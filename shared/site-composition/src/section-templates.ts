import { StructuredContentFormatter } from "@brains/content-formatters";
import type { Template } from "@brains/templates";
import { z } from "@brains/utils/zod";
import type { SectionDefinition, SectionGroup } from "@rizom/site-sections";

/**
 * Schema-first section → `Template`. The markdown formatter's field structure is
 * derived from the section's zod schema by introspection, so the schema is the
 * single source of truth for the component props, the CMS fields, and the
 * stored markdown. Ported from the rev-5 `section-def.ts` machinery, adapted to
 * zod 4 (`instanceof` narrowing, no casts).
 */

interface FieldMapping {
  key: string;
  label: string;
  type: "string" | "number" | "object" | "array";
  children?: FieldMapping[];
  itemType?: "string" | "number" | "object";
  itemMappings?: FieldMapping[];
}

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

// Introspection runs over `unknown` and narrows with `instanceof`: zod 4's
// `.unwrap()`/`.element` return the core `$ZodType` (a supertype of `ZodType`),
// so `unknown` + `instanceof` keeps this cast-free.

/** Peel optional/nullable wrappers to reach the value type. */
function unwrap(schema: unknown): unknown {
  let current = schema;
  while (current instanceof z.ZodOptional || current instanceof z.ZodNullable) {
    current = current.unwrap();
  }
  return current;
}

function toMapping(key: string, fieldSchema: unknown): FieldMapping {
  const label = fieldLabel(key);
  const schema = unwrap(fieldSchema);

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
    const element = unwrap(schema.element);
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
    `Section field "${key}" has a schema type the markdown formatter cannot ` +
      `derive headings for — use string/number/enum/object/array.`,
  );
}

function shapeMappings(schema: z.ZodObject): FieldMapping[] {
  return Object.entries(schema.shape).map(([key, field]) =>
    toMapping(key, field),
  );
}

/**
 * Build a `Template` from a schema-first section. The schema must be a zod
 * object (its fields become the markdown headings). Throws at definition time
 * for unsupported schema shapes rather than failing silently at render.
 */
export function sectionToTemplate(
  name: string,
  section: SectionDefinition,
): Template {
  const schema = section.schema;
  if (!(schema instanceof z.ZodObject)) {
    throw new Error(`Section "${name}" schema must be a zod object.`);
  }

  const formatter = new StructuredContentFormatter(schema, {
    title: section.title,
    mappings: shapeMappings(schema),
  });

  return {
    name,
    description: section.description,
    schema,
    formatter,
    requiredPermission: section.requiredPermission ?? "public",
    layout: {
      component: section.component,
      ...(section.fullscreen !== undefined
        ? { fullscreen: section.fullscreen }
        : {}),
    },
  };
}

/** Build the template registry for a section group, keyed by section id. */
export function sectionGroupToTemplates(
  group: SectionGroup,
): Record<string, Template> {
  const templates: Record<string, Template> = {};
  for (const [id, section] of Object.entries(group.sections)) {
    templates[id] = sectionToTemplate(id, section);
  }
  return templates;
}
