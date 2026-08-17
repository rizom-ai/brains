import { defineEntity, type EntityDefinition } from "@brains/plugins";
import { slugify } from "@brains/utils/string-utils";
import {
  deckFrontmatterSchema,
  deckMetadataSchema,
  assertPublishedDeckHasPublishedAt,
} from "./schemas/deck";
import { deckTemplate } from "./templates/deck-template";
import { deckListTemplate } from "./templates/deck-list";
import { deckGenerationTemplate } from "./templates/generation-template";
import { deckDescriptionTemplate } from "./templates/description-template";
import { deckDataSource } from "./datasources/deck-datasource";
import { createDeckAtprotoProjection } from "./atproto-projection";
import {
  DECK_CAROUSEL_ATTACHMENT_TYPE,
  createDeckCarouselProvider,
} from "./attachments/carousel-provider";
import {
  DECK_OG_IMAGE_ATTACHMENT_TYPE,
  createDeckOgImageProvider,
} from "./attachments/og-image-provider";
import { deckGeneration } from "./handlers/deckGenerationJobHandler";
import { deckEvals } from "./lib/eval-handlers";

/**
 * A slide deck.
 *
 * Decks weigh above ordinary content in search because a deck is a
 * deliberate, presented artifact rather than a note.
 */
export const deck: EntityDefinition<"deck", typeof deckMetadataSchema> =
  defineEntity({
    type: "deck",
    purpose: "A slide deck presented from markdown.",
    metadata: deckMetadataSchema,
    config: { weight: 1.5, projectionSourceRole: "primary" },
    markdown: {
      // Metadata indexes the queryable fields; the rest of the frontmatter
      // — author, event, ogImageId — is carried forward on write.
      decode: ({ content, frontmatter }) => {
        const parsed = deckFrontmatterSchema.parse(frontmatter);
        assertPublishedDeckHasPublishedAt(parsed);
        return {
          content,
          metadata: {
            slug: parsed.slug ?? slugify(parsed.title),
            title: parsed.title,
            status: parsed.status,
            ...(parsed.description === undefined
              ? {}
              : { description: parsed.description }),
            ...(parsed.publishedAt === undefined
              ? {}
              : { publishedAt: parsed.publishedAt }),
            ...(parsed.coverImageId === undefined
              ? {}
              : { coverImageId: parsed.coverImageId }),
          },
        };
      },
      encode: ({ content, metadata }) => ({
        content,
        frontmatter: {
          title: metadata.title,
          slug: metadata.slug,
          status: metadata.status,
          ...(metadata.description === undefined
            ? {}
            : { description: metadata.description }),
          ...(metadata.publishedAt === undefined
            ? {}
            : { publishedAt: metadata.publishedAt }),
          ...(metadata.coverImageId === undefined
            ? {}
            : { coverImageId: metadata.coverImageId }),
        },
      }),
    },
    templates: {
      "deck-detail": deckTemplate,
      "deck-list": deckListTemplate,
      generation: deckGenerationTemplate,
      description: deckDescriptionTemplate,
    },
    dataSources: [deckDataSource],
    attachments: [
      {
        type: DECK_CAROUSEL_ATTACHMENT_TYPE,
        provider: createDeckCarouselProvider,
      },
      {
        type: DECK_OG_IMAGE_ATTACHMENT_TYPE,
        provider: createDeckOgImageProvider,
      },
    ],
    atproto: createDeckAtprotoProjection(),
    generation: deckGeneration,
    evals: deckEvals,
    // Decks publish to the site itself rather than to an external channel,
    // so the provider records the outcome and nothing more.
    publish: {
      provider: {
        name: "internal",
        publish: async (): Promise<{ id: string }> => ({ id: "internal" }),
      },
    },
  });
