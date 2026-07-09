import { createSiteContentTemplates as createInternalSiteContentTemplates } from "@brains/site-composition";
import type { SiteContentDefinition } from "@rizom/site";
import type { Template } from "./contracts";

export function createSiteContentTemplates(
  definition: SiteContentDefinition,
): Record<string, Template> {
  return createInternalSiteContentTemplates(definition);
}
