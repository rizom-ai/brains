import { z } from "@brains/sdk/entities";
import { PresentationLayout } from "@brains/ui-library";
import { createTemplate, type Template } from "@brains/sdk/entities";
import { deckViewSchema } from "./deck-view-schema";

/**
 * Schema for deck template data
 */
export const deckTemplateSchema: z.ZodObject<{
  markdown: z.ZodString;
  deck: z.ZodDefault<z.ZodNullable<typeof deckViewSchema>>;
}> = z.object({
  markdown: z.string().describe("Markdown content with slide separators (---)"),
  deck: deckViewSchema.nullable().default(null),
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
  dataSourceId: "entities",
  requiredPermission: "public",
  layout: {
    component: PresentationLayout,
    fullscreen: true,
  },
});
