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

async function findEntry(
  book: string,
  order: number,
  entities: EntityQueryReader,
): Promise<BookWithData | null> {
  const [entity] = await entities.listEntities(
    {
      entityType: "book",
      options: { filter: { metadata: { book, order } }, limit: 1 },
    },
    bookSchema,
  );
  return entity ? parseBookData(entity) : null;
}

async function scoreOf(
  book: string,
  entities: EntityQueryReader,
): Promise<ScoreEntry[]> {
  const entries = await entities.listEntities(
    {
      entityType: "book",
      options: {
        filter: { metadata: { book } },
        sortFields: [{ field: "order", direction: "asc" }],
        limit: 100000,
      },
    },
    bookSchema,
  );
  return entries
    .map(parseBookData)
    .filter((entry) => entry.metadata.order > 0)
    .map((entry) => ({
      slug: entry.metadata.slug,
      title: entry.metadata.title,
      section: entry.metadata.section,
      order: entry.metadata.order,
      headings: entry.frontmatter.headings,
      length: Buffer.byteLength(entry.body.trim(), "utf8"),
    }));
}

const querySchema = z.object({
  query: z
    .object({
      id: z.string().optional(),
      limit: z.number().int().min(1).max(100000).default(1000),
      page: z.number().int().min(1).default(1),
    })
    .default({ limit: 1000, page: 1 }),
});

/** Book navigation uses indexed lookups, not a shared/native entity service. */
export const bookDataSource: DataSourceDefinition = defineDataSource({
  id: "entities",
  name: "Book Entity DataSource",
  description: "Books and their entries in reading order",
  fetch: async (query, entities) => {
    const params = querySchema.parse(query).query;
    if (!params.id) {
      const books = await entities.listEntities(
        {
          entityType: "book",
          options: {
            filter: { metadata: { order: 0 } },
            sortFields: [{ field: "title", direction: "asc" }],
            limit: params.limit,
            offset: (params.page - 1) * params.limit,
          },
        },
        bookSchema,
      );
      return { books: books.map(parseBookData) };
    }
    const [bySlug] = await entities.listEntities(
      {
        entityType: "book",
        options: { filter: { metadata: { slug: params.id } }, limit: 1 },
      },
      bookSchema,
    );
    const entity =
      bySlug ??
      (await entities.getEntity(
        { entityType: "book", id: params.id },
        bookSchema,
      ));
    if (!entity) throw new Error(`book not found: ${params.id}`);
    const entry = parseBookData(entity);
    const { book, order } = entry.metadata;
    const [title, prev, next, count, score, related] = await Promise.all([
      order === 0 ? entry : findEntry(book, 0, entities),
      order === 0 ? null : findEntry(book, order - 1, entities),
      findEntry(book, order + 1, entities),
      entities.count({
        entityType: "book",
        options: { filter: { metadata: { book } } },
      }),
      order === 0 ? scoreOf(book, entities) : [],
      order === 0
        ? []
        : entities.related({
            origin: { entityType: "book", entityId: entry.id },
            types: ["topic"],
            maxDistance: THEME_DISTANCE,
            limit: THEME_LIMIT,
          }),
    ]);
    return {
      entry,
      book: title ?? entry,
      prev,
      next,
      total: Math.max(0, count - 1),
      score,
      themes: related.map(({ entity, title }) => ({ id: entity.id, title })),
    };
  },
});
