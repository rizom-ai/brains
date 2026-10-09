import {
  BaseEntityDataSource,
  findRelatedEntities,
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

interface BookListData {
  books: BookWithData[];
}

type EntityServiceClient = BaseDataSourceContext["entityService"];

/** A theme near a section: a topic page to link to. */
export interface Theme {
  id: string;
  title: string;
}

/** One section in a book's score: enough to draw and link it. */
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

export function parseBookSectionData(entity: BookSection): BookSectionWithData {
  const parsed = parseMarkdownWithFrontmatter(
    entity.content,
    bookSectionFrontmatterSchema,
  );
  return bookSectionWithDataSchema.parse({
    ...entity,
    frontmatter: parsed.metadata,
    body: parsed.content,
  });
}

/**
 * Books are listed by title. A book's page holds its score; a section's page
 * holds its book and its neighbours in reading order, each found by one
 * indexed lookup so a book of any length costs the same.
 */
export class BookDataSource extends BaseEntityDataSource<
  Book,
  BookWithData,
  BookListData
> {
  readonly id = "book:entities";
  readonly name = "Book Entity DataSource";
  readonly description = "Fetches books and their sections for reading";

  protected readonly config: EntityDataSourceConfig<Book> = {
    entityType: "book",
    entitySchema: bookSchema,
    // A book opens at its id; sections are found by their slug.
    lookupField: "id",
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
    const id = params.query.id;

    if (!id) {
      const list = await this.fetchList(params.query, entityService);
      return outputSchema.parse(
        this.buildListResult(list.items, list.pagination, params.query),
      );
    }

    if (params.entityType === "book-section") {
      return outputSchema.parse(await this.sectionPage(id, entityService));
    }

    const book = this.transformEntity(
      await this.lookupEntity(id, entityService),
    );
    const [first, score] = await Promise.all([
      this.findSection(book.id, 1, entityService),
      this.scoreOf(book.id, entityService),
    ]);
    return outputSchema.parse({ book, first, score });
  }

  /** A section with its book, its neighbours, and the themes nearest it. */
  private async sectionPage(
    slug: string,
    entityService: EntityServiceClient,
  ): Promise<{
    section: BookSectionWithData;
    book: BookWithData;
    prev: BookSectionWithData | null;
    next: BookSectionWithData | null;
    total: number;
    themes: Theme[];
  }> {
    const [found] = await entityService.listEntities(
      {
        entityType: "book-section",
        options: { filter: { metadata: { slug } }, limit: 1 },
      },
      bookSectionSchema,
    );
    if (!found) throw new Error(`book-section not found: ${slug}`);
    const section = parseBookSectionData(found);
    const { book: bookId, order } = section.metadata;
    const [book, prev, next, total, themes] = await Promise.all([
      this.lookupEntity(bookId, entityService),
      this.findSection(bookId, order - 1, entityService),
      this.findSection(bookId, order + 1, entityService),
      entityService.countEntities({
        entityType: "book-section",
        options: { filter: { metadata: { book: bookId } } },
      }),
      this.themesOf(section.id, entityService),
    ]);
    return {
      section,
      book: this.transformEntity(book),
      prev,
      next,
      total,
      themes,
    };
  }

  /** Every section of a book in reading order, measured. */
  private async scoreOf(
    book: string,
    entityService: EntityServiceClient,
  ): Promise<ScoreEntry[]> {
    const entities = await entityService.listEntities(
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
    return entities.map(parseBookSectionData).map((section) => ({
      slug: section.metadata.slug,
      title: section.metadata.title,
      section: section.metadata.section,
      order: section.metadata.order,
      headings: section.frontmatter.headings,
      length: Buffer.byteLength(section.body.trim(), "utf8"),
    }));
  }

  /** The topics nearest a section, by their stored embeddings: no API calls. */
  private async themesOf(
    sectionId: string,
    entityService: EntityServiceClient,
  ): Promise<Theme[]> {
    const related = await findRelatedEntities(entityService, {
      origin: { entityType: "book-section", entityId: sectionId },
      types: ["topic"],
      maxDistance: THEME_DISTANCE,
      limit: THEME_LIMIT,
    });
    return related.map(({ entity, title }) => ({ id: entity.id, title }));
  }

  private async findSection(
    book: string,
    order: number,
    entityService: EntityServiceClient,
  ): Promise<BookSectionWithData | null> {
    if (order < 1) return null;
    const [entity] = await entityService.listEntities(
      {
        entityType: "book-section",
        options: { filter: { metadata: { book, order } }, limit: 1 },
      },
      bookSectionSchema,
    );
    return entity ? parseBookSectionData(entity) : null;
  }

  protected buildListResult(
    items: BookWithData[],
    _pagination: PaginationInfo | null,
    _query: BaseQuery,
  ): BookListData {
    return { books: items };
  }
}
