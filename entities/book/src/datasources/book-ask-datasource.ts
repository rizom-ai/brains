import {
  defineDataSource,
  type DataSourceDefinition,
} from "@brains/sdk/entities";
import { bookSchema } from "../schemas/book";
import { parseBookData } from "./book-datasource";

export interface AskBook {
  book: string;
  title: string;
  year: number | null;
}
export interface BookAskSources {
  name: () => string;
  chatAvailable: (context: {
    readonly publishedOnly?: boolean | undefined;
  }) => Promise<boolean>;
}

/** Presentation availability never grants permission to ask. */
export function bookAskDataSource(
  sources: BookAskSources,
): DataSourceDefinition {
  return defineDataSource({
    id: "ask",
    name: "Book Ask DataSource",
    description:
      "The brain's name, guest availability and the books an answer cites",
    fetch: async (_query, entities, context) => {
      const [titles, askBox] = await Promise.all([
        entities.listEntities(
          {
            entityType: "book",
            options: { filter: { metadata: { order: 0 } }, limit: 1000 },
          },
          bookSchema,
        ),
        sources.chatAvailable(context),
      ]);
      const books = titles
        .map(parseBookData)
        .map((entry) => ({
          book: entry.metadata.book,
          title: entry.metadata.title,
          year: entry.frontmatter.year,
        }))
        .sort((a, b) => (a.year ?? Infinity) - (b.year ?? Infinity));
      return { name: sources.name(), askBox, books };
    },
  });
}
