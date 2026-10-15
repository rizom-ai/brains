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
import type {
  BookDetailPage,
  BookFields,
  BookSectionLink,
  BookSectionPage,
  ScoreEntry,
  Theme,
} from "../schemas/book-pages";
import { bookSectionSlug } from "../adapters/book-section-adapter";

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

interface BookListData {
  books: BookWithData[];
}

type EntityServiceClient = BaseDataSourceContext["entityService"];

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

/** Every entry of a book in reading order, as stored: one per entry. */
export async function listBookSections(
  book: string,
  entityService: EntityServiceClient,
): Promise<BookSectionWithData[]> {
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
  return entities.map(parseBookSectionData);
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
      this.scoreOf(
        book.id,
        new Set(book.frontmatter.continuations),
        entityService,
      ),
    ]);
    const page: BookDetailPage = {
      book: fieldsOf(book),
      first: linkTo(first),
      score,
    };
    return outputSchema.parse(page);
  }

  /**
   * A section with its book, its neighbours, and the themes nearest it. A
   * section split for length reads whole from any of its entries, and its
   * neighbours are the sections around it, not its own entries.
   */
  private async sectionPage(
    slug: string,
    entityService: EntityServiceClient,
  ): Promise<BookSectionPage> {
    const found = await this.findBySlug(slug, entityService);
    if (!found) throw new Error(`book-section not found: ${slug}`);
    const { book: bookId, order } = found.metadata;
    const book = this.transformEntity(
      await this.lookupEntity(bookId, entityService),
    );
    const continuations = new Set(book.frontmatter.continuations);
    const first = sectionStart(order, continuations);
    const last = sectionEnd(order, continuations);
    const [entries, prev, next, total] = await Promise.all([
      Promise.all(
        Array.from({ length: last - first + 1 }, (_, index) =>
          this.findSection(bookId, first + index, entityService),
        ),
      ),
      this.findSection(
        bookId,
        sectionStart(first - 1, continuations),
        entityService,
      ),
      this.findSection(bookId, last + 1, entityService),
      book.frontmatter.sections ??
        entityService.countEntities({
          entityType: "book-section",
          options: { filter: { metadata: { book: bookId } } },
        }),
    ]);
    const pieces = entries.filter(
      (entry): entry is BookSectionWithData => entry !== null,
    );
    const [head] = pieces;
    if (!head) throw new Error(`book-section not found: ${slug}`);
    const themes = (
      await Promise.all(
        pieces.map(({ id }) => this.themesOf(id, entityService)),
      )
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

  /** Every section of a book in reading order, measured; one per section. */
  private async scoreOf(
    book: string,
    continuations: ReadonlySet<number>,
    entityService: EntityServiceClient,
  ): Promise<ScoreEntry[]> {
    return groupContinuations(
      await listBookSections(book, entityService),
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

  /** A section at its place in reading order, found by the slug it has there. */
  private async findSection(
    book: string,
    order: number,
    entityService: EntityServiceClient,
  ): Promise<BookSectionWithData | null> {
    if (order < 1) return null;
    return this.findBySlug(bookSectionSlug(book, order), entityService);
  }

  /** A section by its slug: an index lookup, whatever the brain's size. */
  private async findBySlug(
    slug: string,
    entityService: EntityServiceClient,
  ): Promise<BookSectionWithData | null> {
    const [entity] = await entityService.listEntities(
      {
        entityType: "book-section",
        options: { filter: { metadata: { slug } }, limit: 1 },
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
