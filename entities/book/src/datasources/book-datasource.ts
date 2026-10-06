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
    const [title, prev, next, entries] = await Promise.all([
      order === 0 ? entry : this.findEntry(book, 0, entityService),
      order === 0 ? null : this.findEntry(book, order - 1, entityService),
      this.findEntry(book, order + 1, entityService),
      entityService.countEntities({
        entityType: "book",
        options: { filter: { metadata: { book } } },
      }),
    ]);

    return outputSchema.parse({
      entry,
      book: title ?? entry,
      prev,
      next,
      // The title entry is not a section.
      total: Math.max(0, entries - 1),
    });
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
