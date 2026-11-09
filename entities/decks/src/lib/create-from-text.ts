import type {
  EntityCreateContext,
  EntityCreateRoute,
} from "@brains/sdk/entities";
import {
  checkEntityText,
  entityRuntime,
  entityTextError,
  readEntityText,
  statedDateSchema,
  type EntityTextResult,
} from "@brains/sdk/internal/entity-runtime";
import { getErrorMessage } from "@brains/utils/error";
import { generateMarkdown } from "@brains/utils/markdown-frontmatter";
import { z } from "@brains/utils/zod";
import {
  deckFrontmatterSchema,
  type deckMetadataSchema,
} from "../schemas/deck";
import { hasSlideSeparators } from "./deck-markdown";
import { describeDeck } from "./describe-deck";
import { splitSlides } from "./slides";

/** Deck fields a writer can state for their own slides, in frontmatter or as `fields`. */
const deckTextFieldsSchema = z.object({
  status: z.enum(["draft", "queued", "published"]).optional(),
  publishedAt: statedDateSchema.optional(),
  description: z.string().trim().min(1).optional(),
  author: z.string().trim().min(1).optional(),
  event: z.string().trim().min(1).optional(),
  coverImageId: z.string().min(1).optional(),
  /** Where the slides break in text without --- separators; not stored. */
  slides: z.enum(["headings", "paragraphs"]).optional(),
});

type DeckTextFields = z.output<typeof deckTextFieldsSchema>;

/**
 * The writer's deck text split into slides, with its description: the one
 * they state, else written from the slides. Text with no separators or
 * headings to split it on asks where the slides break.
 */
async function readDeckText(
  context: EntityCreateContext,
): Promise<EntityTextResult<DeckTextFields>> {
  const read = readEntityText(context.input, {
    noun: "deck",
    fieldsSchema: deckTextFieldsSchema,
    keepTitleHeading: true,
    isComplete: (frontmatter, body) =>
      deckFrontmatterSchema.safeParse(frontmatter).success &&
      hasSlideSeparators(body),
  });
  if (read.kind !== "text") return read;
  const { title, body, fields } = read.text;

  const slides = hasSlideSeparators(body)
    ? body
    : splitSlides(body, fields.slides ?? "headings");
  if (!slides) {
    return {
      kind: "question",
      asks: "slide-breaks",
      question:
        "Where should the slides break: one slide per paragraph, or at places you name?",
      answerWith:
        'For a slide per paragraph, pass fields { slides: "paragraphs" }. For other breaks, pass the text as source kind "text" with a line containing only --- inserted at each break the user names, changing nothing else in the text.',
    };
  }

  const runtime = entityRuntime(context);
  const description =
    fields.description ??
    (await describeDeck(runtime.generate, { title, content: slides }).catch(
      (error: unknown) => {
        // The description is optional: the deck is saved without one.
        runtime.logger.warn("Could not describe the deck", {
          title,
          error: getErrorMessage(error),
        });
        return undefined;
      },
    ));
  return {
    kind: "text",
    text: {
      title,
      body: slides,
      fields: { ...fields, ...(description !== undefined && { description }) },
    },
  };
}

/**
 * system_create for a deck from the writer's own text: the text stays as
 * written, split into slides on its headings when it has no --- separators,
 * titled from its first heading (which stays as the title slide), and saved
 * as a draft with a description written from the slides. Before the save
 * is confirmed it asks where the slides break when nothing says, and fills
 * in the title and description the confirmation shows. A complete deck, or
 * anything that is not the writer's text, goes on to the ordinary create.
 */
export const deckFromText: EntityCreateRoute<typeof deckMetadataSchema> = {
  check: async (context) =>
    checkEntityText(await readDeckText(context), ({ title, fields }) => ({
      title,
      ...(fields.description !== undefined && {
        fields: { description: fields.description },
      }),
    })),
  resolve: async (context) => {
    const read = await readDeckText(context);
    const runtime = entityRuntime(context);
    if (read.kind === "not-text") return runtime.ordinaryCreate();
    if (read.kind !== "text") {
      const refused = entityTextError(read);
      return {
        refuse:
          refused.kind === "handled" && !refused.result.success
            ? refused.result.error
            : "This text cannot be saved as a deck",
      };
    }
    const { title, body: slides, fields } = read.text;
    const status = fields.status ?? "draft";
    const frontmatter = Object.fromEntries(
      Object.entries({
        title,
        status,
        description: fields.description,
        author: fields.author,
        event: fields.event,
        publishedAt:
          fields.publishedAt ??
          (status === "published" ? new Date().toISOString() : undefined),
        coverImageId: fields.coverImageId,
      }).filter(([, value]) => value !== undefined),
    );
    return runtime.ordinaryCreate({
      title,
      content: generateMarkdown(frontmatter, slides),
    });
  },
};
