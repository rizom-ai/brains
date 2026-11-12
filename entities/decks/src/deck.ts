import { deckFrontmatterSchema } from "./schemas/deck";
import { defineEntity, type EntityDefinition } from "@brains/sdk/entities";
import {
  restatingMetadata,
  withFrontmatterSchema,
} from "@brains/sdk/internal/entity-runtime";
import { deckAtproto } from "./atproto-projection";
import { createDeckCarouselProvider } from "./attachments/carousel-provider";
import {
  DECK_CAROUSEL_ATTACHMENT_TYPE,
  deckCarouselTemplate,
} from "./attachments/carousel-template";
import { createDeckOgImageProvider } from "./attachments/og-image-provider";
import {
  DECK_OG_IMAGE_ATTACHMENT_TYPE,
  deckOgImageTemplate,
} from "./attachments/og-image-template";
import { deckGeneration } from "./handlers/deckGenerationJobHandler";
import { deckFromText } from "./lib/create-from-text";
import { deckMarkdown } from "./lib/deck-markdown";
import { deckEvals } from "./lib/eval-handlers";
import { deckCreateFieldsSchema, deckMetadataSchema } from "./schemas/deck";
import { deckTemplate } from "./templates/deck-template";
import { deckListTemplate } from "./templates/deck-list";
import { deckDescriptionTemplate } from "./templates/description-template";
import { deckGenerationTemplate } from "./templates/generation-template";

/**
 * A slide deck: its slides in the body, its frontmatter its metadata. It is
 * written from the writer's text or generated from a prompt, rendered on the
 * site, as a carousel and as a social card, published by the site itself,
 * and as an ai.rizom.brain.deck record. Once stored, its file states its
 * slug, resolved or not, so later writes put it where a stated slug goes,
 * as the deck adapter wrote it.
 */
export const deck: EntityDefinition<"deck", typeof deckMetadataSchema> =
  withFrontmatterSchema(
    restatingMetadata(
      defineEntity({
        type: "deck",
        purpose: "A slide-deck presentation.",
        metadata: deckMetadataSchema,
        markdown: deckMarkdown,
        config: { weight: 1.5, projectionSourceRole: "primary" },
        coverImage: true,
        // A title slide before the separator: a body that is only "---" reads
        // as an opening frontmatter fence and is dropped, and the stub then
        // fails slide validation every time it is stored.
        stub: ({ id, title }) => ({
          content: `# ${title}\n\n---\n`,
          metadata: {
            title,
            slug: id,
            authoredSlug: true,
            status: "generating",
          },
        }),
        templates: {
          "deck-detail": deckTemplate,
          "deck-list": deckListTemplate,
          generation: deckGenerationTemplate,
          description: deckDescriptionTemplate,
          "og-image": deckOgImageTemplate,
          carousel: deckCarouselTemplate,
        },
        create: { fromContent: deckFromText, fields: deckCreateFieldsSchema },
        generation: deckGeneration,
        attachments: [
          {
            type: DECK_CAROUSEL_ATTACHMENT_TYPE,
            provider: (context) => createDeckCarouselProvider(context),
          },
          {
            type: DECK_OG_IMAGE_ATTACHMENT_TYPE,
            provider: (context) => createDeckOgImageProvider(context),
          },
        ],
        // Decks publish to the site itself, so the provider records the outcome
        // and nothing more.
        publish: {
          provider: {
            name: "internal",
            publish: async (): Promise<{ id: string }> => ({ id: "internal" }),
          },
        },
        atproto: deckAtproto,
        evals: deckEvals,
      }),
      (stored) => ({ ...stored, authoredSlug: true }),
    ),
    deckFrontmatterSchema,
  );
