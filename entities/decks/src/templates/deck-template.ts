import { z } from "@brains/utils/zod-v4";
import { PresentationLayout } from "@brains/ui-library";
import { createTemplate, type Template } from "@brains/templates";
import { enrichedDeckSchema } from "./deck-list/schema";

/**
 * Schema for deck template data
 */
export const deckTemplateSchema: z.ZodObject<{
  markdown: z.ZodString;
  deck: z.ZodOptional<typeof enrichedDeckSchema>;
}> = z.object({
  markdown: z.string().describe("Markdown content with slide separators (---)"),
  deck: enrichedDeckSchema.optional(),
});

export type DeckTemplateData = z.output<typeof deckTemplateSchema>;

/**
 * Deck detail template
 * Renders a deck entity as a Reveal.js presentation
 */
export const deckTemplate: Template = createTemplate<DeckTemplateData>({
  name: "deck-detail",
  description: "Render a presentation deck as Reveal.js slides",
  schema: deckTemplateSchema,
  dataSourceId: "decks:entities",
  requiredPermission: "public",
  layout: {
    component: PresentationLayout,
    fullscreen: true,
  },
});
