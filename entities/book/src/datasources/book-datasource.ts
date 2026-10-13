import {
  defineDataSource,
  parseMarkdown,
  z,
  type EntityQueryReader,
  type DataSourceDefinition,
} from "@brains/sdk/entities";
import { THEME_DISTANCE, THEME_LIMIT } from "../lib/themes";
import {
  bookFrontmatterSchema,
  bookSchema,
  bookWithDataSchema,
  type Book,
  type BookWithData,
} from "../schemas/book";
import {
  bookSectionFrontmatterSchema,
  bookSectionSchema,
  bookSectionWithDataSchema,
  type BookSection,
  type BookSectionWithData,
} from "../schemas/book-section";

export interface Theme {
  id: string;
  title: string;
}
export interface ScoreEntry {
  slug: string;
  title: string;
  section: string | null;
  order: number;
  /** The headings the section stands under, outermost first. */
  headings: string[];
  /** Bytes of the section's text. */
  length: number;
}
export function parseBookData(entity: Book): BookWithData {
  const parsed = parseMarkdown(entity.content);
  return bookWithDataSchema.parse({
    ...entity,
    frontmatter: bookFrontmatterSchema.parse(parsed.frontmatter),
    body: parsed.content,
  });
}
export function parseBookSectionData(entity: BookSection): BookSectionWithData {
  const parsed = parseMarkdown(entity.content);
  return bookSectionWithDataSchema.parse({
    ...entity,
    frontmatter: bookSectionFrontmatterSchema.parse(parsed.frontmatter),
    body: parsed.content,
  });
}
async function findBook(
  id: string,
  entities: EntityQueryReader,
): Promise<BookWithData> {
  const entity = await entities.getEntity(
    { entityType: "book", id },
    bookSchema,
  );
  if (!entity) throw new Error(`book not found: ${id}`);
  return parseBookData(entity);
}
async function findSection(
  book: string,
  order: number,
  entities: EntityQueryReader,
): Promise<BookSectionWithData | null> {
  if (order < 1) return null;
  const [entity] = await entities.listEntities(
    {
      entityType: "book-section",
      options: { filter: { metadata: { book, order } }, limit: 1 },
    },
    bookSectionSchema,
  );
  return entity ? parseBookSectionData(entity) : null;
}
async function scoreOf(
  book: string,
  entities: EntityQueryReader,
): Promise<ScoreEntry[]> {
  const sections = await entities.listEntities(
    {
      entityType: "book-section",
      options: {
        filter: { metadata: { book } },
        sortFields: [{ field: "order", direction: "asc" }],
        limit: 100000,
      },
    },
    bookSectionSchema,
  );
  return sections.map(parseBookSectionData).map((section) => ({
    slug: section.metadata.slug,
    title: section.metadata.title,
    section: section.metadata.section,
    order: section.metadata.order,
    headings: section.frontmatter.headings,
    length: Buffer.byteLength(section.body.trim(), "utf8"),
  }));
}
const querySchema = z.object({
  entityType: z.enum(["book", "book-section"]).default("book"),
  query: z
    .object({
      id: z.string().optional(),
      limit: z.number().int().min(1).max(100000).default(1000),
      page: z.number().int().min(1).default(1),
    })
    .default({ limit: 1000, page: 1 }),
});

/** Book navigation uses scoped readers, not a shared/native entity service. */
export const bookDataSource: DataSourceDefinition = defineDataSource({
  id: "entities",
  name: "Book Entity DataSource",
  description: "Books and their sections in reading order",
  fetch: async (query, entities) => {
    const { entityType, query: params } = querySchema.parse(query);
    if (!params.id) {
      const books = await entities.listEntities(
        {
          entityType: "book",
          options: {
            sortFields: [{ field: "title", direction: "asc" }],
            limit: params.limit,
            offset: (params.page - 1) * params.limit,
          },
        },
        bookSchema,
      );
      return { books: books.map(parseBookData) };
    }
    if (entityType === "book") {
      const book = await findBook(params.id, entities);
      const [first, score] = await Promise.all([
        findSection(book.id, 1, entities),
        scoreOf(book.id, entities),
      ]);
      return { book, first, score };
    }
    const [found] = await entities.listEntities(
      {
        entityType: "book-section",
        options: { filter: { metadata: { slug: params.id } }, limit: 1 },
      },
      bookSectionSchema,
    );
    if (!found) throw new Error(`book-section not found: ${params.id}`);
    const section = parseBookSectionData(found);
    const { book: bookId, order } = section.metadata;
    const [book, prev, next, total, related] = await Promise.all([
      findBook(bookId, entities),
      findSection(bookId, order - 1, entities),
      findSection(bookId, order + 1, entities),
      entities.count({
        entityType: "book-section",
        options: { filter: { metadata: { book: bookId } } },
      }),
      entities.related({
        origin: { entityType: "book-section", entityId: section.id },
        types: ["topic"],
        maxDistance: THEME_DISTANCE,
        limit: THEME_LIMIT,
      }),
    ]);
    return {
      section,
      book,
      prev,
      next,
      total,
      themes: related.map(({ entity, title }) => ({ id: entity.id, title })),
    };
  },
});
