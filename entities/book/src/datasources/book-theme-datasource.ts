import {
  findRelatedEntities,
  parseMarkdownWithFrontmatter,
} from "@brains/plugins";
import type {
  BaseDataSourceContext,
  DataSource,
  DataSourceSchema,
} from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
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

type EntityServiceClient = BaseDataSourceContext["entityService"];

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
export class BookThemeDataSource implements DataSource {
  readonly id = "book:theme";
  readonly name = "Book Theme DataSource";
  readonly description =
    "A topic traced across a book brain's books, by stored embeddings";

  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async fetch<T>(
    query: unknown,
    outputSchema: DataSourceSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const { id } = themeQuerySchema.parse(query).query;
    const entityService = context.entityService;
    const topic = await entityService.getEntity({ entityType: "topic", id });
    if (!topic) throw new Error(`topic not found: ${id}`);
    const page = parseMarkdownWithFrontmatter(
      topic.content,
      topicFrontmatterSchema,
    );

    const related = await findRelatedEntities(entityService, {
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
    const books = await this.titleEntries(
      [...new Set(sections.map((entry) => entry.metadata.book))],
      entityService,
    );
    this.logger.debug("Traced theme across the books", {
      theme: id,
      sections: sections.length,
      books: books.size,
    });

    return outputSchema.parse({
      theme: { id, title: page.metadata.title, summary: page.content.trim() },
      strand: this.strandOf(sections, books),
      passages: sections.slice(0, THEME_PASSAGES).map((entry) => ({
        slug: entry.metadata.slug,
        title: entry.metadata.title,
        section: entry.metadata.section,
        bookTitle:
          books.get(entry.metadata.book)?.metadata.title ?? entry.metadata.book,
      })),
    });
  }

  private strandOf(
    sections: BookWithData[],
    books: Map<string, BookWithData>,
  ): StrandEntry[] {
    const counts = sections.reduce<Map<string, number>>(
      (tally, entry) =>
        tally.set(
          entry.metadata.book,
          (tally.get(entry.metadata.book) ?? 0) + 1,
        ),
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
  private async titleEntries(
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
}
