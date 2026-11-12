import type {
  ServiceCorpusReads,
  ServiceDataSourceDeclaration,
} from "@brains/sdk/internal/service-runtime";
import type { Logger } from "@brains/utils/logger";
import { parseBookData } from "../lib/book-records";
import { bookSchema } from "../schemas/book";

/** Title entries are few; one page holds every book of any author. */
const BOOK_LIMIT = 1000;

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
  chatAvailable: (build: {
    readonly publishedOnly: boolean;
  }) => Promise<boolean>;
}

/**
 * The Ask page: who answers, whether asking is open, and the books whose
 * sections an answer can cite, so the page can name them.
 */
export async function fetchBookAsk(
  reads: Pick<ServiceCorpusReads, "listEntities">,
  build: { readonly publishedOnly: boolean },
  sources: BookAskSources,
  logger: Logger,
): Promise<unknown> {
  const [entities, askBox] = await Promise.all([
    reads.listEntities({
      entityType: "book",
      options: { limit: BOOK_LIMIT, source: true },
    }),
    sources.chatAvailable(build),
  ]);
  const books: AskBook[] = entities
    .map((entity) => parseBookData(bookSchema.parse(entity)))
    .map((book) => ({
      book: book.id,
      title: book.metadata.title,
      year: book.frontmatter.year,
    }))
    .sort((a, b) => (a.year ?? Infinity) - (b.year ?? Infinity));
  logger.debug("Ask page", { books: books.length, askBox });
  return { name: sources.name(), askBox, books };
}

/** The Ask source as the brain registers it: `book:ask`. */
export function bookAskDataSource(
  sources: BookAskSources,
  logger: Logger,
): ServiceDataSourceDeclaration {
  return {
    id: "ask",
    name: "Book Ask DataSource",
    description:
      "The brain's name, the guest box's availability and the books an answer cites",
    fetch: (_query, { corpus, publishedOnly }) =>
      fetchBookAsk(corpus, { publishedOnly }, sources, logger),
  };
}
