import { z } from "@brains/utils";
import { PresentationLayout } from "@brains/ui-library";
import { createTemplate } from "@brains/templates";

/**
 * Schema for deck template data
 */
export const deckTemplateSchema = z.object({
  markdown: z.string().describe("Markdown content with slide separators (---)"),
});

export type DeckTemplateData = z.infer<typeof deckTemplateSchema>;

/**
 * Deck detail template
 * Renders a deck entity as a Reveal.js presentation
 */
export const deckTemplate = createTemplate<DeckTemplateData>({
  name: "deck-detail",
  description: "Render a presentation deck as Reveal.js slides",
  schema: deckTemplateSchema,
  dataSourceId: "shell:entities",
  requiredPermission: "public",
  layout: {
    component: PresentationLayout,
    interactive: false,
  },
});
