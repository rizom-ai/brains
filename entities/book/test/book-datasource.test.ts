import { beforeEach, describe, expect, it } from "bun:test";
import { createMockShell, type MockShell } from "@brains/plugins/test";
import type { BaseDataSourceContext } from "@brains/plugins";
import { createMockLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { BookDataSource } from "../src/datasources/book-datasource";
import { bookAdapter } from "../src/adapters/book-adapter";
import type { Book } from "../src/schemas/book";

function entry(
  id: string,
  book: string,
  order: number,
  title: string,
  extra = "",
): Book {
  const content = `---
title: ${title}
book: ${book}
order: ${order}
section: ${order === 0 ? "null" : `S-${order}`}
page: null
source: https://example.org/${book}/${order}
${extra}---

Erfundener Text ${order}.
`;
  const parsed = bookAdapter.fromMarkdown(content);
  return {
    id,
    entityType: "book",
    content,
    contentHash: id,
    created: "2026-10-06T00:00:00.000Z",
    updated: "2026-10-06T00:00:00.000Z",
    visibility: "public",
    metadata: parsed.metadata ?? {
      title,
      section: null,
      book,
      order,
      slug: book,
      pageTitle: title,
    },
  };
}

const titleExtra = `author: Erfundener Autor
year: 1888
kind: work
edition: Testausgabe
license: public-domain
`;

describe("BookDataSource", () => {
  let shell: MockShell;
  let context: BaseDataSourceContext;
  let datasource: BookDataSource;

  beforeEach(() => {
    shell = createMockShell();
    context = { entityService: shell.getEntityService() };
    datasource = new BookDataSource(createMockLogger());
    shell.addEntities([
      entry("zweites:0000-titel", "zweites", 0, "Zweites Buch", titleExtra),
      entry("erstes:0000-titel", "erstes", 0, "Erstes Buch", titleExtra),
      entry("erstes:0001-anfang", "erstes", 1, "Anfang"),
      entry("erstes:0002-mitte:0001-teil", "erstes", 2, "Mitte"),
      entry("erstes:0003-ende", "erstes", 3, "Ende"),
    ]);
  });

  it("lists only the books' title entries, by title", async () => {
    const result = await datasource.fetch(
      { entityType: "book" },
      z.object({ books: z.array(z.any()) }),
      context,
    );

    expect(result.books.map((book: Book) => book.metadata.title)).toEqual([
      "Erstes Buch",
      "Zweites Buch",
    ]);
  });

  it("returns an entry with its book and reading neighbours", async () => {
    const result = await datasource.fetch(
      { entityType: "book", query: { id: "erstes/2" } },
      z.object({
        entry: z.any(),
        book: z.any(),
        prev: z.any(),
        next: z.any(),
        total: z.number(),
      }),
      context,
    );

    expect(result.entry.metadata.title).toBe("Mitte");
    expect(result.entry.body.trim()).toBe("Erfundener Text 2.");
    expect(result.book.metadata.title).toBe("Erstes Buch");
    expect(result.book.frontmatter.author).toBe("Erfundener Autor");
    expect(result.prev.metadata.slug).toBe("erstes/1");
    expect(result.next.metadata.slug).toBe("erstes/3");
    expect(result.total).toBe(3);
  });

  it("opens a book on its title entry with the first section next", async () => {
    const result = await datasource.fetch(
      { entityType: "book", query: { id: "erstes" } },
      z.object({
        entry: z.any(),
        book: z.any(),
        prev: z.any(),
        next: z.any(),
      }),
      context,
    );

    expect(result.entry.metadata.order).toBe(0);
    expect(result.book.metadata.slug).toBe("erstes");
    expect(result.prev).toBeNull();
    expect(result.next.metadata.slug).toBe("erstes/1");
  });

  it("has no next entry after the last section", async () => {
    const result = await datasource.fetch(
      { entityType: "book", query: { id: "erstes/3" } },
      z.object({ entry: z.any(), book: z.any(), prev: z.any(), next: z.any() }),
      context,
    );

    expect(result.next).toBeNull();
  });
});
