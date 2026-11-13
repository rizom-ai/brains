import { frontmatterRecordFields } from "@brains/contracts";
import type {
  ServiceCorpusReads,
  ServiceDataSourceDeclaration,
} from "@brains/sdk/internal/service-runtime";
import type { Logger } from "@brains/utils/logger";
import { compareIds } from "@brains/utils/sort";
import { z } from "@brains/utils/zod";
import { bookSchema, type BookWithData } from "../schemas/book";
import { parseBookData } from "../lib/book-records";
import {
  bookSectionMetadataSchema,
  type BookSectionMetadata,
} from "../schemas/book-section";
import { THEME_DISTANCE, THEME_PASSAGES, THEME_REACH } from "../lib/themes";
/** A book's share of a theme. */
export interface StrandEntry {
  book: string;
  title: string;
  shortTitle: string | null;
  year: number | null;
  published: boolean;
  /** Sections of the book close to the theme. */
  sections: number;
}

/** A section close to a theme. */
export interface Passage {
  slug: string;
  title: string;
  section: string | null;
  bookTitle: string;
}

const themeQuerySchema = z.object({
  query: z.object({ id: z.string() }),
});

const topicFrontmatterSchema = z.object({ title: z.string() });

type ThemeReads = Pick<ServiceCorpusReads, "getEntity" | "nearestToEntity">;

/** A section near a theme, as the store's index reads it: no text. */
interface NearSection {
  id: string;
  metadata: BookSectionMetadata;
}

/**
 * A long section is split across entries that share its siglum; it counts
 * once, by its closest entry.
 */
function oncePerSection(entries: NearSection[]): NearSection[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = `${entry.metadata.book}:${entry.metadata.section ?? entry.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** A book's share of a theme, by section count. */
function strandOf(
  sections: NearSection[],
  books: Map<string, BookWithData>,
): StrandEntry[] {
  const counts = sections.reduce<Map<string, number>>(
    (tally, entry) =>
      tally.set(entry.metadata.book, (tally.get(entry.metadata.book) ?? 0) + 1),
    new Map(),
  );
  return [...counts.entries()]
    .map(([book, count]) => {
      const title = books.get(book);
      return {
        book,
        title: title?.metadata.title ?? book,
        shortTitle: title?.frontmatter.shortTitle ?? null,
        year: title?.frontmatter.year ?? null,
        published: title?.frontmatter.published !== false,
        sections: count,
      };
    })
    .sort(
      (a, b) =>
        (a.year ?? Infinity) - (b.year ?? Infinity) ||
        compareIds(a.book, b.book),
    );
}

/** Each book, by its slug; one the build cannot see is left out. */
async function booksOf(
  books: string[],
  reads: Pick<ThemeReads, "getEntity">,
): Promise<Map<string, BookWithData>> {
  const found = await Promise.all(
    books.map(async (id) => {
      const entity = await reads.getEntity({
        entityType: "book",
        id,
        source: true,
      });
      return entity ? parseBookData(bookSchema.parse(entity)) : null;
    }),
  );
  return new Map(
    found
      .filter((book): book is BookWithData => book !== null)
      .map((book) => [book.id, book]),
  );
}

/**
 * A theme across the work: its own page, how many sections of each book are
 * close to it, and the closest of them, found by stored embeddings.
 */
export async function fetchBookTheme(
  query: unknown,
  reads: ThemeReads,
  context: { readonly publishedOnly: boolean; readonly logger: Logger },
): Promise<unknown> {
  const { id } = themeQuerySchema.parse(query).query;
  const topic = await reads.getEntity({
    entityType: "topic",
    id,
    source: true,
  });
  if (!topic) throw new Error(`topic not found: ${id}`);
  const { fields, body } = frontmatterRecordFields(topic);
  const page = topicFrontmatterSchema.parse(fields);

  // Up to THEME_REACH sections count toward the strand, so each is read
  // from the index's fields, never loaded with its text.
  const nearest = await reads
    .nearestToEntity({
      origin: { entityType: "topic", entityId: id },
      types: ["book-section"],
      maxDistance: THEME_DISTANCE,
      limit: THEME_REACH,
      includeMetadata: true,
      ...(context.publishedOnly && { publishedOnly: true }),
    })
    // A brain without embeddings has no theme to trace; the page shows none.
    .catch(() => []);
  const sections = oncePerSection(
    nearest.map(({ entityId, metadata }) => ({
      id: entityId,
      metadata: bookSectionMetadataSchema.parse(metadata),
    })),
  );
  const books = await booksOf(
    [...new Set(sections.map((entry) => entry.metadata.book))],
    reads,
  );
  context.logger.debug("Traced theme across the books", {
    theme: id,
    sections: sections.length,
    books: books.size,
  });

  return {
    theme: { id, title: page.title, summary: body.trim() },
    strand: strandOf(sections, books),
    passages: sections.slice(0, THEME_PASSAGES).map((entry) => ({
      slug: entry.metadata.slug,
      title: entry.metadata.title,
      section: entry.metadata.section,
      bookTitle:
        books.get(entry.metadata.book)?.metadata.title ?? entry.metadata.book,
    })),
  };
}

/** The theme source as the brain registers it: `book:theme`. */
export function bookThemeDataSource(
  logger: Logger,
): ServiceDataSourceDeclaration {
  return {
    id: "theme",
    name: "Book Theme DataSource",
    description:
      "A topic traced across a book brain's books, by stored embeddings",
    fetch: (query, { corpus, publishedOnly }) =>
      fetchBookTheme(query, corpus, { publishedOnly, logger }),
  };
}
