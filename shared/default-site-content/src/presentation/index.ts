import { PresentationContentSchema, type PresentationContent } from "./schema";
import { PresentationLayout } from "@brains/ui-library";
import { createTemplate } from "@brains/templates";

export { PresentationContentSchema, type PresentationContent } from "./schema";

/**
 * Generic presentation template
 * Works with any markdown content that has slide separators (---)
 * Can be used with any entity type via the /present/:entityType/:entityId route
 */
export const presentationTemplate = createTemplate<PresentationContent>({
  name: "presentation",
  description: "Render markdown as a reveal.js presentation",
  schema: PresentationContentSchema,
  dataSourceId: "shell:entities",
  requiredPermission: "public",
  layout: {
    component: PresentationLayout,
    interactive: false,
  },
});
