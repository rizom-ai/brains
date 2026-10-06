import {
  BaseEntityDataSource,
  parseMarkdownWithFrontmatter,
} from "@brains/plugins";
import type {
  BaseDataSourceContext,
  BaseQuery,
  DataSourceSchema,
  EntityDataSourceConfig,
  PaginationInfo,
} from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import {
  bookFrontmatterSchema,
  bookSchema,
  bookWithDataSchema,
  type Book,
  type BookWithData,
} from "../schemas/book";

interface BookListData {
  books: BookWithData[];
}

type EntityServiceClient = BaseDataSourceContext["entityService"];

/** A theme near a section: a topic page to link to. */
export interface Theme {
  id: string;
  title: string;
}

/** At most this many themes per section, and none further than this. */
const THEME_LIMIT = 3;
const THEME_DISTANCE = 0.6;

const topicFrontmatterSchema = z.object({ title: z.string() });

/** One section in a book's score: enough to draw and link it. */
export interface ScoreEntry {
  slug: string;
  title: string;
  section: string | null;
  order: number;
  part: string | null;
  /** Bytes of the section's text. */
  length: number;
}

export function parseBookData(entity: Book): BookWithData {
  const parsed = parseMarkdownWithFrontmatter(
    entity.content,
    bookFrontmatterSchema,
  );
  return bookWithDataSchema.parse({
    ...entity,
    frontmatter: parsed.metadata,
    body: parsed.content,
  });
}

/**
 * Books are listed by their title entries; an entry is read with its book and
 * its neighbours in reading order, each found by one indexed lookup so a book
 * of any length costs the same.
 */
export class BookDataSource extends BaseEntityDataSource<
  Book,
  BookWithData,
  BookListData
> {
  readonly id = "book:entities";
  readonly name = "Book Entity DataSource";
  readonly description = "Fetches books and their entries for reading";

  protected readonly config: EntityDataSourceConfig<Book> = {
    entityType: "book",
    entitySchema: bookSchema,
    defaultSort: [{ field: "title", direction: "asc" }],
    defaultLimit: 1000,
  };

  constructor(logger: Logger) {
    super(logger);
  }

  protected transformEntity(entity: Book): BookWithData {
    return parseBookData(entity);
  }

  override async fetch<T>(
    query: unknown,
    outputSchema: DataSourceSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const params = this.parseQuery(query);
    const entityService = context.entityService;

    if (!params.query.id) {
      const list = await this.fetchList(params.query, entityService, {
        filter: { metadata: { order: 0 } },
      });
      return outputSchema.parse(
        this.buildListResult(list.items, list.pagination, params.query),
      );
    }

    const entry = this.transformEntity(
      await this.lookupEntity(params.query.id, entityService),
    );
    const { book, order } = entry.metadata;
    const [title, prev, next, entries, score, themes] = await Promise.all([
      order === 0 ? entry : this.findEntry(book, 0, entityService),
      order === 0 ? null : this.findEntry(book, order - 1, entityService),
      this.findEntry(book, order + 1, entityService),
      entityService.countEntities({
        entityType: "book",
        options: { filter: { metadata: { book } } },
      }),
      order === 0 ? this.scoreOf(book, entityService) : [],
      order === 0 ? [] : this.themesOf(entry.id, entityService),
    ]);

    return outputSchema.parse({
      entry,
      book: title ?? entry,
      prev,
      next,
      // The title entry is not a section.
      total: Math.max(0, entries - 1),
      score,
      themes,
    });
  }

  /** Every section of a book in reading order, measured. */
  private async scoreOf(
    book: string,
    entityService: EntityServiceClient,
  ): Promise<ScoreEntry[]> {
    const entities = await entityService.listEntities(
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
    return entities
      .map((entity) => this.transformEntity(entity))
      .filter((entry) => entry.metadata.order > 0)
      .map((entry) => ({
        slug: entry.metadata.slug,
        title: entry.metadata.title,
        section: entry.metadata.section,
        order: entry.metadata.order,
        part: entry.frontmatter.part,
        length: Buffer.byteLength(entry.body.trim(), "utf8"),
      }));
  }

  /** The topics nearest a section, by their stored embeddings: no API calls. */
  private async themesOf(
    entryId: string,
    entityService: EntityServiceClient,
  ): Promise<Theme[]> {
    const projection = await entityService
      .projectSemanticSpace({
        types: ["topic"],
        origin: { entityType: "book", entityId: entryId },
      })
      // A brain without embeddings has no themes; the section still reads.
      .catch(() => null);
    if (!projection) return [];
    const nearest = projection.points
      .filter((point) => point.distanceToOrigin <= THEME_DISTANCE)
      .sort((a, b) => a.distanceToOrigin - b.distanceToOrigin)
      .slice(0, THEME_LIMIT);
    const topics = await Promise.all(
      nearest.map((point) =>
        entityService.getEntity({ entityType: "topic", id: point.entityId }),
      ),
    );
    return topics
      .filter((topic) => topic !== null)
      .map((topic) => ({
        id: topic.id,
        title: parseMarkdownWithFrontmatter(
          topic.content,
          topicFrontmatterSchema,
        ).metadata.title,
      }));
  }

  private async findEntry(
    book: string,
    order: number,
    entityService: EntityServiceClient,
  ): Promise<BookWithData | null> {
    const [entity] = await entityService.listEntities(
      {
        entityType: "book",
        options: { filter: { metadata: { book, order } }, limit: 1 },
      },
      bookSchema,
    );
    return entity ? this.transformEntity(entity) : null;
  }

  protected buildListResult(
    items: BookWithData[],
    _pagination: PaginationInfo | null,
    _query: BaseQuery,
  ): BookListData {
    return { books: items };
  }
}
