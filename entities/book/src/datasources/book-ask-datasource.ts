import type {
  BaseDataSourceContext,
  DataSource,
  DataSourceSchema,
} from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { bookSchema } from "../schemas/book";
import { parseBookData } from "./book-datasource";

/** A book as the Ask page names the passages an answer cites. */
export interface AskBook {
  book: string;
  title: string;
  year: number | null;
}

export interface BookAskSources {
  /** The anchor's name, as the site and its homepage box name it. */
  name: () => string;
  /** Whether Web Chat serves the guest box for this build. */
  chatAvailable: (context: BaseDataSourceContext) => Promise<boolean>;
}

/** Title entries are few; one page holds every book of any author. */
const BOOK_LIMIT = 1000;

/**
 * The Ask page: who answers, whether asking is open, and the books whose
 * sections an answer can cite, so the page can name them.
 */
export class BookAskDataSource implements DataSource {
  readonly id = "book:ask";
  readonly name = "Book Ask DataSource";
  readonly description =
    "The brain's name, the guest box's availability and the books an answer cites";

  private readonly logger: Logger;
  private readonly sources: BookAskSources;

  constructor(logger: Logger, sources: BookAskSources) {
    this.logger = logger;
    this.sources = sources;
  }

  async fetch<T>(
    _query: unknown,
    outputSchema: DataSourceSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const [titles, askBox] = await Promise.all([
      context.entityService.listEntities(
        {
          entityType: "book",
          options: { filter: { metadata: { order: 0 } }, limit: BOOK_LIMIT },
        },
        bookSchema,
      ),
      this.sources.chatAvailable(context),
    ]);
    const books = titles
      .map(parseBookData)
      .map((entry) => ({
        book: entry.metadata.book,
        title: entry.metadata.title,
        year: entry.frontmatter.year,
      }))
      .sort((a, b) => (a.year ?? Infinity) - (b.year ?? Infinity));
    this.logger.debug("Ask page", { books: books.length, askBox });

    return outputSchema.parse({ name: this.sources.name(), askBox, books });
  }
}
