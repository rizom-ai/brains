import { StructuredContentFormatter } from "@brains/content-formatters";
import { createTypedComponent, type Template } from "@brains/templates";
import { useContext } from "react";
import { PageLanguageContext } from "./page-language";
import { z } from "@brains/utils/zod";
import type {
  ComponentType,
  SiteSectionDefinition,
  SiteSectionGroup,
} from "@rizom/site";

/**
 * Schema-first section → `Template`. The markdown formatter's field structure is
 * derived from the section's zod schema by introspection, so the schema is the
 * single source of truth for the component props, the Studio fields, and the
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

/** Peel optional/nullable/default wrappers to reach the value type. */
function unwrap(schema: unknown): unknown {
  let current = schema;
  while (
    current instanceof z.ZodOptional ||
    current instanceof z.ZodNullable ||
    current instanceof z.ZodDefault
  ) {
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
 * A section's component that draws the page language's own way when the
 * section brings one, else the default way.
 */
function drawnPerLanguage<P>(
  component: ComponentType<P>,
  components: Record<string, ComponentType<P>> | undefined,
): ComponentType<P> {
  if (!components || Object.keys(components).length === 0) return component;
  return function DrawnInPageLanguage(props: P) {
    const language = useContext(PageLanguageContext)?.toLowerCase();
    const drawing = Object.entries(components).find(
      ([tag]) => tag.toLowerCase() === language,
    )?.[1];
    return (drawing ?? component)(props);
  };
}

/**
 * Build a `Template` from a schema-first section. The schema must be a zod
 * object (its fields become the markdown headings). Throws at definition time
 * for unsupported schema shapes rather than failing silently at render.
 */
export function sectionToTemplate(
  name: string,
  section: SiteSectionDefinition,
): Template {
  // Two bindings on purpose. `section.schema` is typed ZodType<JsonObject> —
  // defineSection proved that — and the template needs it under that type.
  // Narrowing it with `instanceof z.ZodObject` would replace the output type
  // with ZodObject's own Record<string, unknown>, losing the proof, so the
  // shape inspection uses a separate binding.
  const objectSchema = section.schema;
  if (!(objectSchema instanceof z.ZodObject)) {
    throw new Error(`Section "${name}" schema must be a zod object.`);
  }

  const formatter = new StructuredContentFormatter(objectSchema, {
    title: section.title,
    mappings: shapeMappings(objectSchema),
  });

  return {
    name,
    description: section.description,
    schema: section.schema,
    formatter,
    requiredPermission: section.requiredPermission ?? "public",
    layout: {
      // Parsed against the section schema, so the erased component is safe.
      component: createTypedComponent(
        section.schema,
        drawnPerLanguage(section.component, section.components),
      ),
      ...(section.fullscreen !== undefined
        ? { fullscreen: section.fullscreen }
        : {}),
    },
  };
}

/** Build the template registry for a section group, keyed by section id. */
export function sectionGroupToTemplates(
  group: SiteSectionGroup,
): Record<string, Template> {
  const templates: Record<string, Template> = {};
  for (const [id, section] of Object.entries(group.sections)) {
    templates[id] = sectionToTemplate(id, section);
  }
  return templates;
}
