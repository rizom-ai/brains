import type { JSX } from "preact";
import { z } from "@brains/utils/zod";
import { OgCard } from "@brains/ui-library";
import type { MediaPageTemplate } from "@brains/media-page-composer";

export const DECK_OG_IMAGE_ATTACHMENT_TYPE = "og-image";
export const DECK_OG_IMAGE_TEMPLATE_NAME = "decks:og-image";

export const deckOgImageTemplateSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  event: z.string().optional(),
  brandLabel: z.string().optional(),
  slideCount: z.number().int().positive().optional(),
  coverImageUrl: z.string().optional(),
});

export type DeckOgImageTemplateData = z.infer<typeof deckOgImageTemplateSchema>;

export const deckOgImageTemplate: MediaPageTemplate = {
  name: DECK_OG_IMAGE_TEMPLATE_NAME,
  pluginId: "decks",
  schema: deckOgImageTemplateSchema,
  renderers: {
    image: renderDeckOgImage,
  },
};

function renderDeckOgImage(props: Record<string, unknown>): JSX.Element {
  const data = deckOgImageTemplateSchema.parse(props);
  const countLabel = data.slideCount
    ? `${data.slideCount} slide${data.slideCount === 1 ? "" : "s"}`
    : undefined;

  return (
    <OgCard
      brandLabel={data.brandLabel ?? data.title}
      eyebrow="Deck"
      title={data.title}
      subtitle={data.description}
      meta={[data.event]}
      tag={countLabel}
    />
  );
}
