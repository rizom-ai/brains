import type {
  CreateCheckResult,
  CreateInput,
  CreateInterceptionResult,
  EntityPluginContext,
  EntityTextResult,
} from "@brains/plugins";
import {
  checkEntityText,
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

type DeckTextFields = z.output<typeof deckTextFieldsSchema>;

/**
 * The writer's deck text split into slides, with its description: the one
 * they state, else written from the slides. Text with no separators or
 * headings to split it on asks where the slides break.
 */
async function readDeckText(
  input: CreateInput,
  context: Pick<EntityPluginContext, "ai" | "entityService" | "logger">,
): Promise<EntityTextResult<DeckTextFields>> {
  const read = readEntityText(input, {
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
 * Before a deck from the writer's text is confirmed: ask where the slides
 * break when nothing says, and fill in the title and description the
 * confirmation shows and the confirmed save receives.
 */
export async function checkDeckText(
  input: CreateInput,
  context: Pick<EntityPluginContext, "ai" | "entityService" | "logger">,
): Promise<CreateCheckResult> {
  return checkEntityText(
    await readDeckText(input, context),
    ({ title, fields }) => ({
      title,
      ...(fields.description !== undefined && {
        fields: { description: fields.description },
      }),
    }),
  );
}

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
  const read = await readDeckText(input, context);
  if (read.kind === "not-text") return { kind: "continue", input };
  if (read.kind !== "text") return entityTextError(read);
  const { title, body: slides, fields } = read.text;
  const { description } = fields;

  const status = fields.status ?? "draft";

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
