import {
  createOgImageProvider,
  preferredSlug,
  type OgImageProviderFactory,
} from "@brains/media-page-composer";
import { parseMarkdown } from "@brains/sdk/entities";
import type { DeckEntity } from "../schemas/deck";
import { deckFrontmatterSchema } from "../schemas/deck";
import {
  DECK_OG_IMAGE_ATTACHMENT_TYPE,
  deckOgImageTemplate,
  type DeckOgImageTemplateData,
} from "./og-image-template";

export { DECK_OG_IMAGE_ATTACHMENT_TYPE };

export const createDeckOgImageProvider: OgImageProviderFactory =
  createOgImageProvider<DeckEntity, DeckOgImageTemplateData>({
    sourceEntityType: "deck",
    attachmentType: DECK_OG_IMAGE_ATTACHMENT_TYPE,
    template: deckOgImageTemplate,
    themeMode: "dark",
    buildContent: async (deck, helpers) => {
      const { frontmatter, content: body } = parseMarkdown(deck.content);
      const parsed = deckFrontmatterSchema.parse(frontmatter);
      const slideCount = countSlides(body);
      const coverImageUrl = await helpers.resolveImageDataUrl(
        parsed.coverImageId,
      );

      return {
        title: parsed.title,
        ...(parsed.description ? { description: parsed.description } : {}),
        ...(parsed.event ? { event: parsed.event } : {}),
        ...(slideCount ? { slideCount } : {}),
        ...(coverImageUrl ? { coverImageUrl } : {}),
        ...(helpers.brandLabel ? { brandLabel: helpers.brandLabel } : {}),
      };
    },
    pageTitle: (content) => content.title,
    slug: (deck) => preferredSlug(deck.metadata.slug, deck.metadata.title),
  });

function countSlides(content: string): number {
  return content
    .split(/^---$/gm)
    .map((slide) => slide.trim())
    .filter((slide) => slide.length > 0).length;
}
