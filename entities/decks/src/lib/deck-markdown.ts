import { EntityValidationError } from "@brains/plugins";
import type { EntityMarkdownCodec } from "@brains/sdk/entities";
import {
  generateMarkdown,
  parseMarkdown,
} from "@brains/utils/markdown-frontmatter";
import { slugify } from "@brains/utils/string-utils";
import {
  assertPublishedDeckHasPublishedAt,
  deckFrontmatterSchema,
  type DeckMetadata,
  type deckMetadataSchema,
} from "../schemas/deck";

const MISSING_SLIDES_MESSAGE =
  "Invalid deck: markdown must contain slide separators (---) to be a valid presentation";

/** True when the body has a standalone --- line between slides. */
export function hasSlideSeparators(body: string): boolean {
  return /^---$/m.test(body);
}

/**
 * A deck's body must hold slides. The refusal is a validation error on the
 * body, so editors show it beside the text being drafted instead of
 * failing the request.
 */
function assertSlides(body: string): void {
  if (hasSlideSeparators(body)) return;
  throw new EntityValidationError(
    "deck",
    Object.assign(new Error(MISSING_SLIDES_MESSAGE), {
      issues: [{ path: ["body"], message: MISSING_SLIDES_MESSAGE }],
    }),
  );
}

/** The fields a deck writes, defined ones only. */
function defined(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  );
}

/**
 * A deck's frontmatter, in the order the deck adapter wrote it: its fields
 * in schema order, the slug among them when the file states it and after
 * them when it was resolved from the title, then the error a failed
 * generation recorded.
 */
export function deckFrontmatter(
  metadata: Omit<DeckMetadata, "authoredSlug"> & {
    readonly authoredSlug?: boolean | undefined;
  },
): Record<string, unknown> {
  const authored = metadata.authoredSlug === true;
  return defined({
    title: metadata.title,
    ...(authored && { slug: metadata.slug }),
    description: metadata.description,
    author: metadata.author,
    status: metadata.status,
    publishedAt: metadata.publishedAt,
    event: metadata.event,
    coverImageId: metadata.coverImageId,
    ogImageId: metadata.ogImageId,
    ...(!authored && { slug: metadata.slug }),
    error: metadata.error,
  });
}

/**
 * A deck as its stored document: its frontmatter and its slides, which is
 * how readers that take a deck whole (the site's templates, cover lookups)
 * have always read it.
 */
export function deckDocument(deck: {
  readonly content: string;
  readonly metadata: DeckMetadata;
}): string {
  return generateMarkdown(deckFrontmatter(deck.metadata), deck.content);
}

/**
 * A deck's stored document is its frontmatter and its slides. Its metadata
 * is the frontmatter, the slug resolved from the title when the file states
 * none; a published deck needs its publication date, and the body needs
 * slide separators, read or written.
 */
export const deckMarkdown: EntityMarkdownCodec<typeof deckMetadataSchema> = {
  decode: ({ content, frontmatter }) => {
    const parsed = deckFrontmatterSchema.parse(frontmatter);
    assertPublishedDeckHasPublishedAt(parsed);
    assertSlides(content);
    const error = frontmatter["error"];
    return {
      content,
      metadata: {
        ...parsed,
        slug: parsed.slug ?? slugify(parsed.title),
        ...(parsed.slug !== undefined && { authoredSlug: true }),
        ...(typeof error === "string" && { error }),
      },
    };
  },
  // A whole document handed in, as an import or an editor writes it, has
  // had its frontmatter decoded into the metadata already: its slides are
  // written under the frontmatter in the deck's own order.
  encode: ({ content, metadata }) => {
    const slides = parseMarkdown(content).content;
    assertSlides(slides);
    assertPublishedDeckHasPublishedAt(metadata);
    return { content: slides, frontmatter: deckFrontmatter(metadata) };
  },
};
