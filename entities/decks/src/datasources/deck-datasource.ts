import { imageMetadataSchema } from "@brains/image";
import {
  defineDataSource,
  defineEntity,
  type EntityDataSourceDefinition,
  type EntityDefinition,
  type EntityOf,
  type EntityReader,
} from "@brains/sdk/entities";
import type { JsonObject } from "@brains/contracts";
import {
  deckFrontmatterSchema,
  type DeckWithData,
  type deckMetadataSchema,
} from "../schemas/deck";
import { deckDocument } from "../lib/deck-markdown";
import { deckViewSchema } from "../templates/deck-view-schema";

type DeckDefinition = EntityDefinition<"deck", typeof deckMetadataSchema>;

/**
 * The image a deck's cover names, read for its data URL. The image type is
 * the images package's; a deck reads it by this shape and never installs it.
 */
const imageShape = defineEntity({
  type: "image",
  purpose: "An image a deck shows as its cover.",
  metadata: imageMetadataSchema,
});

/**
 * A deck as the site reads it, as the deck plugin class's data source read
 * it: its record, its content the document it is stored as, its metadata
 * the fields the class indexed, its frontmatter and its slides.
 */
function deckWithData(entity: EntityOf<DeckDefinition>): DeckWithData {
  const { metadata } = entity;
  const document = deckDocument(entity);
  return {
    ...entity,
    content: document,
    metadata: {
      title: metadata.title,
      ...(metadata.description !== undefined && {
        description: metadata.description,
      }),
      status: metadata.status,
      ...(metadata.publishedAt !== undefined && {
        publishedAt: metadata.publishedAt,
      }),
      ...(metadata.coverImageId !== undefined && {
        coverImageId: metadata.coverImageId,
      }),
      slug: metadata.slug,
      ...(metadata.error !== undefined && { error: metadata.error }),
    },
    frontmatter: deckFrontmatterSchema.parse(metadata),
    body: entity.content,
  };
}

/** The cover image, as a slide directive on the first slide. */
async function withCover(
  deck: DeckWithData,
  entities: EntityReader,
): Promise<DeckWithData> {
  const coverImageId = deck.frontmatter.coverImageId;
  if (!coverImageId) return deck;
  const image = await entities.get(imageShape, coverImageId);
  if (!image) return deck;
  const directive = `<!-- .slide: data-background-image="${image.content}" data-background-opacity="0.4" -->`;
  return { ...deck, body: `${directive}\n${deck.body}` };
}

/** Fetches and transforms decks for rendering: one deck, or all of them. */
export function deckDataSource(
  deck: DeckDefinition,
): EntityDataSourceDefinition<DeckDefinition, DeckWithData, JsonObject> {
  return defineDataSource({
    id: "entities",
    name: "Deck Entity DataSource",
    description: "Fetches and transforms deck entities for rendering",
    entity: deck,
    defaultSort: [{ field: "publishedAt", direction: "desc" }],
    defaultLimit: 100,
    transform: deckWithData,
    list: (items) => ({
      decks: items.map((item) => deckViewSchema.parse(item)),
    }),
    detail: async ({ item, entities }) => {
      const shown = await withCover(item, entities);
      return { markdown: shown.body, deck: shown };
    },
  });
}
