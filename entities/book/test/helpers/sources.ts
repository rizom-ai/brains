import type { BaseDataSourceContext, DataSourceSchema } from "@brains/plugins";
import { createMockLogger } from "@brains/test-utils";
import {
  fetchBookAsk,
  type BookAskSources,
} from "../../src/datasources/book-ask-datasource";
import { fetchBookData } from "../../src/datasources/book-datasource";
import { fetchBookTheme } from "../../src/datasources/book-theme-datasource";

/** A book data source as a build calls it: query, schema and build context. */
export interface BookSourceUnderTest {
  fetch<T>(
    query: unknown,
    schema: DataSourceSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T>;
}

/** book:entities, read through the build's entity service. */
export function bookSource(): BookSourceUnderTest {
  return {
    fetch: async (query, schema, context) =>
      schema.parse(await fetchBookData(query, context.entityService)),
  };
}

/** book:theme, read through the build's entity service. */
export function bookThemeSource(): BookSourceUnderTest {
  return {
    fetch: async (query, schema, context) =>
      schema.parse(
        await fetchBookTheme(query, context.entityService, {
          publishedOnly: context.publishedOnly === true,
          logger: createMockLogger(),
        }),
      ),
  };
}

/** book:ask, with the name and the guest box a test gives it. */
export function bookAskSource(sources: BookAskSources): BookSourceUnderTest {
  return {
    fetch: async (_query, schema, context) =>
      schema.parse(
        await fetchBookAsk(
          context.entityService,
          {
            publishedOnly: context.publishedOnly === true,
            // These tests give the guest box directly; book-ask-box reads it.
            sharedState: () => {
              throw new Error("No shared state in this test");
            },
          },
          sources,
          createMockLogger(),
        ),
      ),
  };
}
