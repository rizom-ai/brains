import {
  defineDataSource,
  parseMarkdown,
  type EntityQueryReader,
  type DataSourceDefinition,
} from "@brains/sdk/entities";
import { z } from "@brains/utils/zod";
import { bookSchema, type BookWithData } from "../schemas/book";
import { parseBookData } from "./book-datasource";
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

type EntityServiceClient = EntityQueryReader;

/**
 * A long section is split across entries that share its siglum; it counts
 * once, by its closest entry.
 */
function oncePerSection(entries: BookWithData[]): BookWithData[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = `${entry.metadata.book}:${entry.metadata.section ?? entry.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * A theme across the work: its own page, how many sections of each book are
 * close to it, and the closest of them, found by stored embeddings.
 */
export const bookThemeDataSource: DataSourceDefinition = defineDataSource({
  id: "theme",
  name: "Book Theme DataSource",
  description:
    "A topic traced across a book brain's books, by stored embeddings",
  fetch: async (query, entityService) => {
    const { id } = themeQuerySchema.parse(query).query;
    const topic = await entityService.getEntity({ entityType: "topic", id });
    if (!topic) throw new Error(`topic not found: ${id}`);
    const page = parseMarkdown(topic.content);
    const fields = topicFrontmatterSchema.parse(page.frontmatter);

    const related = await entityService.related({
      origin: { entityType: "topic", entityId: id },
      types: ["book"],
      maxDistance: THEME_DISTANCE,
      limit: THEME_REACH,
    });
    const sections = oncePerSection(
      related
        .map(({ entity }) => parseBookData(bookSchema.parse(entity)))
        .filter((entry) => entry.metadata.order > 0),
    );
    const books = await titleEntries(
      [...new Set(sections.map((entry) => entry.metadata.book))],
      entityService,
    );
    return {
      theme: { id, title: fields.title, summary: page.content.trim() },
      strand: strandOf(sections, books),
      passages: sections.slice(0, THEME_PASSAGES).map((entry) => ({
        slug: entry.metadata.slug,
        title: entry.metadata.title,
        section: entry.metadata.section,
        bookTitle:
          books.get(entry.metadata.book)?.metadata.title ?? entry.metadata.book,
      })),
    };
  },
});

function strandOf(
  sections: BookWithData[],
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
    .sort((a, b) => (a.year ?? Infinity) - (b.year ?? Infinity));
}

/** Each book's title entry, by book slug. */
async function titleEntries(
  books: string[],
  entityService: EntityServiceClient,
): Promise<Map<string, BookWithData>> {
  const entries = await Promise.all(
    books.map(async (book) => {
      const [entity] = await entityService.listEntities(
        {
          entityType: "book",
          options: { filter: { metadata: { book, order: 0 } }, limit: 1 },
        },
        bookSchema,
      );
      return entity ? parseBookData(entity) : null;
    }),
  );
  return new Map(
    entries
      .filter((entry): entry is BookWithData => entry !== null)
      .map((entry) => [entry.metadata.book, entry]),
  );
}
