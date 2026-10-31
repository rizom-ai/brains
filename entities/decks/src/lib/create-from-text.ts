import type {
  CreateInput,
  CreateInterceptionResult,
  EntityPluginContext,
} from "@brains/plugins";
import {
  continueWithEntityText,
  entityTextError,
  readEntityText,
  statedDateSchema,
} from "@brains/plugins";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import { hasSlideSeparators } from "../adapters/deck-adapter";
import { deckFrontmatterSchema } from "../schemas/deck";
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

/**
 * system_create for a deck from the writer's own text: the text stays as
 * written, split into slides on its headings when it has no --- separators,
 * titled from its first heading (which stays as the title slide), and saved
 * as a draft with a description written from the slides.
 */
export async function createDeckFromText(
  input: CreateInput,
  context: Pick<EntityPluginContext, "ai" | "entityService" | "logger">,
): Promise<CreateInterceptionResult> {
  const read = readEntityText(input, {
    noun: "deck",
    fieldsSchema: deckTextFieldsSchema,
    keepTitleHeading: true,
    isComplete: (frontmatter, body) =>
      deckFrontmatterSchema.safeParse(frontmatter).success &&
      hasSlideSeparators(body),
  });
  if (read.kind === "not-text") return { kind: "continue", input };
  if (read.kind === "error") {
    return entityTextError(read.error, read.question);
  }
  const { title, body, fields } = read.text;

  const slides = hasSlideSeparators(body)
    ? body
    : splitSlides(body, fields.slides ?? "headings");
  if (!slides) {
    return entityTextError(
      'Where should the slides break? The text has no --- separator lines or headings to split it on. For a slide per paragraph, pass fields { slides: "paragraphs" }; for other breaks, insert a line containing only --- at each break the user names, changing nothing else in the text.',
      "slide-breaks",
    );
  }

  const status = fields.status ?? "draft";
  const description =
    fields.description ??
    (await describeDeck(context, { title, content: slides }).catch(
      (error: unknown) => {
        // The description is optional: the deck is saved without one.
        context.logger.warn("Could not describe the deck", {
          title,
          error: getErrorMessage(error),
        });
        return undefined;
      },
    ));

  return continueWithEntityText(input, {
    title,
    body: slides,
    frontmatter: {
      title,
      status,
      description,
      author: fields.author,
      event: fields.event,
      publishedAt:
        fields.publishedAt ??
        (status === "published" ? new Date().toISOString() : undefined),
      coverImageId: fields.coverImageId,
    },
  });
}
