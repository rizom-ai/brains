import type { JSX } from "preact";
import { createTemplate, type Template } from "@brains/templates";
import type { SectionDefinition } from "@brains/site-composition";
import type { z } from "@brains/utils/zod";

export const CONTENT_NAMESPACE = "rizom-ai-site";

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

/** Route `sections:` list for a page, in page order. */
export function toRouteSections(
  defs: readonly AnySectionDef[],
): SectionDefinition[] {
  return defs.map((def) => ({
    id: def.name,
    template: `${CONTENT_NAMESPACE}:${def.name}`,
    content: def.fallback,
  }));
}
