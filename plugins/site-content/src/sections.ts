import {
  siteContentSectionParts,
  type SiteContentDefinition,
} from "@brains/site-composition";
import type {
  ServiceSchema,
  ServiceTemplateDefinition,
  ServiceViewDefinition,
  ServiceViewSchema,
} from "@brains/sdk/services";
import { ensureArray } from "@brains/utils/array";

/**
 * One section, taken apart once.
 *
 * The template and the view of a section are declared through separate
 * slots but describe the same thing, and the runtime checks that they share
 * one schema — so the parts are built once per section rather than once per
 * slot.
 */
const partsOf = new WeakMap<
  SiteContentDefinition["sections"][string],
  ReturnType<typeof siteContentSectionParts>
>();

function sectionParts(
  section: SiteContentDefinition["sections"][string],
): ReturnType<typeof siteContentSectionParts> {
  const existing = partsOf.get(section);
  if (existing) return existing;
  const parts = siteContentSectionParts(section);
  partsOf.set(section, parts);
  return parts;
}

/** The definitions a brain configured, however it configured them. */
export function configuredDefinitions(
  definitions: SiteContentDefinition | SiteContentDefinition[] | undefined,
): SiteContentDefinition[] {
  return ensureArray(definitions);
}

/**
 * The page sections a brain's configuration declares, as templates.
 *
 * A section is written down as markdown and read back as the value it came
 * from, which is what its formatter does in both directions. It is named
 * from the namespace its author chose, because a route names it that way.
 */
export function sectionTemplates(
  definitions: SiteContentDefinition | SiteContentDefinition[] | undefined,
): Record<string, ServiceTemplateDefinition<ServiceSchema>> {
  const templates: Record<
    string,
    ServiceTemplateDefinition<ServiceSchema>
  > = {};
  for (const definition of configuredDefinitions(definitions)) {
    for (const [name, section] of Object.entries(definition.sections)) {
      const parts = sectionParts(section);
      templates[name] = {
        schema: parts.schema,
        namespace: definition.namespace,
        permission: parts.requiredPermission,
        // The runtime parses through the schema before formatting, so what
        // arrives here is this section shape whatever the slot type erased.
        format: ({ value }): string =>
          parts.formatter.format(parts.schema.parse(value)),
        parse: (content): unknown => parts.formatter.parse(content),
      };
    }
  }
  return templates;
}

/** The same sections, as the components that render them. */
export function sectionViews(
  definitions: SiteContentDefinition | SiteContentDefinition[] | undefined,
): Record<string, ServiceViewDefinition<ServiceViewSchema>> {
  const views: Record<string, ServiceViewDefinition<ServiceViewSchema>> = {};
  for (const definition of configuredDefinitions(definitions)) {
    for (const [name, section] of Object.entries(definition.sections)) {
      const parts = sectionParts(section);
      views[name] = {
        schema: parts.schema,
        description: parts.description,
        renderers: { web: parts.component },
      };
    }
  }
  return views;
}
