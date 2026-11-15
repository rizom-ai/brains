import { findRelatedEntities } from "@brains/sdk/internal/service-runtime";
import type {
  ServiceCorpusReads,
  ServiceDataSourceDeclaration,
} from "@brains/sdk/internal/service-runtime";
import { z } from "@brains/utils/zod";
import { THEME_DISTANCE, THEME_LIMIT } from "../lib/themes";
import { parseBookData, parseBookSectionData } from "../lib/book-records";
import { bookSectionSlug, bookSectionSlugPrefix } from "../lib/slugs";
import { bookSchema, type BookWithData } from "../schemas/book";
import {
  bookSectionSchema,
  type BookSectionWithData,
} from "../schemas/book-section";
import type {
  BookDetailPage,
  BookFields,
  BookSectionLink,
  BookSectionPage,
  ScoreEntry,
  Theme,
} from "../schemas/book-pages";

export { parseBookData, parseBookSectionData } from "../lib/book-records";

/** A book as its pages show it, without its text. */
function fieldsOf(book: BookWithData): BookFields {
  return {
    id: book.id,
    entityType: "book",
    metadata: book.metadata,
    frontmatter: book.frontmatter,
  };
}

/** A section as a link to it shows it. */
function linkTo(section: BookSectionWithData | null): BookSectionLink | null {
  return (
    section && {
      slug: section.metadata.slug,
      title: section.metadata.title,
      section: section.metadata.section,
    }
  );
}

/** The reads a book's pages are built from, at the build's scope. */
export type BookReads = Pick<
  ServiceCorpusReads,
  "listEntities" | "getEntity" | "countEntities" | "nearestToEntity"
>;

/** What a template asks the book source: a list, a book, or a section. */
const bookQuerySchema = z.looseObject({
  entityType: z.string().optional(),
  query: z
    .looseObject({
      id: z.string().optional(),
      limit: z.number().optional(),
      page: z.number().optional(),
      pageSize: z.number().optional(),
    })
    .optional(),
});

/** Title entries are few; one page holds every book of any author. */
const BOOK_LIMIT = 1000;

/** The first entry of the section an entry belongs to. */
function sectionStart(
  order: number,
  continuations: ReadonlySet<number>,
): number {
  return continuations.has(order)
    ? sectionStart(order - 1, continuations)
    : order;
}

/** The last entry of the section an entry belongs to. */
function sectionEnd(order: number, continuations: ReadonlySet<number>): number {
  return continuations.has(order + 1)
    ? sectionEnd(order + 1, continuations)
    : order;
}

/** A book as stored, by its id; refused when the build cannot see it. */
export async function readBook(
  id: string,
  reads: Pick<BookReads, "getEntity">,
): Promise<BookWithData> {
  const entity = await reads.getEntity({
    entityType: "book",
    id,
    source: true,
  });
  if (!entity) throw new Error(`book not found: ${id}`);
  return parseBookData(bookSchema.parse(entity));
}

/** The books the build sees, as stored, by title: one page of them. */
export async function listBooks(
  reads: Pick<BookReads, "listEntities">,
  page: {
    readonly limit?: number | undefined;
    readonly page?: number | undefined;
    readonly pageSize?: number | undefined;
  } = {},
): Promise<BookWithData[]> {
  const perPage = page.pageSize ?? page.limit ?? BOOK_LIMIT;
  const entities = await reads.listEntities({
    entityType: "book",
    options: {
      limit: perPage,
      offset: ((page.page ?? 1) - 1) * perPage,
      sortFields: [{ field: "title", direction: "asc" }],
      source: true,
    },
  });
  return entities.map((entity) => parseBookData(bookSchema.parse(entity)));
}

/** Every entry of a book in reading order, as stored: one per entry. */
export async function listBookSections(
  book: string,
  reads: Pick<BookReads, "listEntities">,
): Promise<BookSectionWithData[]> {
  const entities = await reads.listEntities({
    entityType: "book-section",
    options: {
      // A book's sections share its slug prefix, which the store reads as an
      // index range: the cost of the book, not of every book's sections.
      filter: { metadataPrefix: { slug: bookSectionSlugPrefix(book) } },
      sortFields: [{ field: "order", direction: "asc" }],
      limit: 100000,
      source: true,
    },
  });
  return entities.map((entity) =>
    parseBookSectionData(bookSectionSchema.parse(entity)),
  );
}

/**
 * A book's entries as the sections they make up: an entry that continues
 * the one before joins its section.
 */
export function groupContinuations(
  entries: BookSectionWithData[],
  continuations: ReadonlySet<number>,
): [BookSectionWithData, ...BookSectionWithData[]][] {
  return entries.reduce<[BookSectionWithData, ...BookSectionWithData[]][]>(
    (sections, entry) => {
      const previous = sections.at(-1);
      return previous && continuations.has(entry.metadata.order)
        ? [...sections.slice(0, -1), [...previous, entry]]
        : [...sections, [entry]];
    },
    [],
  );
}

/** A section by its slug: an index lookup, whatever the brain's size. */
async function findBySlug(
  slug: string,
  reads: Pick<BookReads, "listEntities">,
): Promise<BookSectionWithData | null> {
  const [entity] = await reads.listEntities({
    entityType: "book-section",
    options: { filter: { metadata: { slug } }, limit: 1, source: true },
  });
  return entity ? parseBookSectionData(bookSectionSchema.parse(entity)) : null;
}

/** A section at its place in reading order, found by the slug it has there. */
async function findSection(
  book: string,
  order: number,
  reads: Pick<BookReads, "listEntities">,
): Promise<BookSectionWithData | null> {
  if (order < 1) return null;
  return findBySlug(bookSectionSlug(book, order), reads);
}

/** Every section of a book in reading order, measured; one per section. */
async function scoreOf(
  book: string,
  continuations: ReadonlySet<number>,
  reads: Pick<BookReads, "listEntities">,
): Promise<ScoreEntry[]> {
  return groupContinuations(
    await listBookSections(book, reads),
    continuations,
  ).map(([first, ...rest]) => ({
    slug: first.metadata.slug,
    title: first.metadata.title,
    section: first.metadata.section,
    order: first.metadata.order,
    headings: first.frontmatter.headings,
    length: [first, ...rest].reduce(
      (sum, entry) => sum + Buffer.byteLength(entry.body.trim(), "utf8"),
      0,
    ),
  }));
}

/** The topics nearest a section, by their stored embeddings: no API calls. */
async function themesOf(sectionId: string, reads: BookReads): Promise<Theme[]> {
  const related = await findRelatedEntities(reads, {
    origin: { entityType: "book-section", entityId: sectionId },
    types: ["topic"],
    maxDistance: THEME_DISTANCE,
    limit: THEME_LIMIT,
  });
  return related.map(({ entity, title }) => ({ id: entity.id, title }));
}

/**
 * A section with its book, its neighbours, and the themes nearest it. A
 * section split for length reads whole from any of its entries, and its
 * neighbours are the sections around it, not its own entries.
 */
async function sectionPage(
  slug: string,
  reads: BookReads,
): Promise<BookSectionPage> {
  const found = await findBySlug(slug, reads);
  if (!found) throw new Error(`book-section not found: ${slug}`);
  const { book: bookId, order } = found.metadata;
  const book = await readBook(bookId, reads);
  const continuations = new Set(book.frontmatter.continuations);
  const first = sectionStart(order, continuations);
  const last = sectionEnd(order, continuations);
  const [entries, prev, next, total] = await Promise.all([
    Promise.all(
      Array.from({ length: last - first + 1 }, (_, index) =>
        findSection(bookId, first + index, reads),
      ),
    ),
    findSection(bookId, sectionStart(first - 1, continuations), reads),
    findSection(bookId, last + 1, reads),
    book.frontmatter.sections ??
      reads.countEntities({
        entityType: "book-section",
        options: {
          filter: { metadataPrefix: { slug: bookSectionSlugPrefix(bookId) } },
        },
      }),
  ]);
  const pieces = entries.filter(
    (entry): entry is BookSectionWithData => entry !== null,
  );
  const [head] = pieces;
  if (!head) throw new Error(`book-section not found: ${slug}`);
  const themes = (
    await Promise.all(pieces.map(({ id }) => themesOf(id, reads)))
  )
    .flat()
    .filter(
      (theme, index, all) =>
        all.findIndex(({ id }) => id === theme.id) === index,
    )
    .slice(0, THEME_LIMIT);
  return {
    section: {
      id: head.id,
      entityType: "book-section",
      metadata: head.metadata,
      frontmatter: head.frontmatter,
      body: pieces.map(({ body }) => body.trim()).join("\n\n"),
    },
    book: fieldsOf(book),
    prev: linkTo(prev),
    next: linkTo(next),
    position:
      first - [...continuations].filter((entry) => entry < first).length,
    total,
    themes,
  };
}

/**
 * Books are listed by title. A book's page holds its score; a section's page
 * holds its book and its neighbours in reading order, each found by one
 * indexed lookup so a book of any length costs the same.
 */
export async function fetchBookData(
  query: unknown,
  reads: BookReads,
): Promise<unknown> {
  const params = bookQuerySchema.parse(query);
  const id = params.query?.id;
  if (!id) return { books: await listBooks(reads, params.query) };
  if (params.entityType === "book-section") return sectionPage(id, reads);
  const book = await readBook(id, reads);
  const [first, score] = await Promise.all([
    findSection(book.id, 1, reads),
    scoreOf(book.id, new Set(book.frontmatter.continuations), reads),
  ]);
  const page: BookDetailPage = {
    book: fieldsOf(book),
    first: linkTo(first),
    score,
  };
  return page;
}

/** The book source as the brain registers it: `book:entities`. */
export const bookDataSource: ServiceDataSourceDeclaration = {
  id: "entities",
  name: "Book Entity DataSource",
  description: "Fetches books and their sections for reading",
  fetch: (query, { corpus }) => fetchBookData(query, corpus),
};
