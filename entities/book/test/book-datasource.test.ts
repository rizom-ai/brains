import { beforeEach, describe, expect, it } from "bun:test";
import { createMockShell, type MockShell } from "@brains/plugins/test";
import type { BaseDataSourceContext, BaseEntity } from "@brains/plugins";
import { createMockLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { BookDataSource } from "../src/datasources/book-datasource";
import { bookSectionAdapter } from "../src/adapters/book-section-adapter";
import type { Book } from "../src/schemas/book";
import type { BookSection } from "../src/schemas/book-section";
import { nearestStore, type NearestMatch } from "./helpers/nearest-store";

function book(id: string, title: string): Book {
  const content = `---
title: ${title}
source: https://example.org/${id}
author: Erfundener Autor
year: 1888
kind: work
edition: Testausgabe
license: public-domain
---

## Contents
`;
  return {
    id,
    entityType: "book",
    content,
    contentHash: id,
    created: "2026-10-06T00:00:00.000Z",
    updated: "2026-10-06T00:00:00.000Z",
    visibility: "public",
    metadata: { title },
  };
}

function section(
  id: string,
  bookId: string,
  order: number,
  title: string,
): BookSection {
  const content = `---
title: ${title}
book: ${bookId}
order: ${order}
section: S-${order}
page: null
source: https://example.org/${bookId}/${order}
---

Erfundener Text ${order}.
`;
  const parsed = bookSectionAdapter.fromMarkdown(content);
  if (!parsed.metadata) throw new Error("Expected section metadata");
  return {
    id,
    entityType: "book-section",
    content,
    contentHash: id,
    created: "2026-10-06T00:00:00.000Z",
    updated: "2026-10-06T00:00:00.000Z",
    visibility: "public",
    metadata: parsed.metadata,
  };
}

describe("BookDataSource", () => {
  let shell: MockShell;
  let context: BaseDataSourceContext;
  let datasource: BookDataSource;

  beforeEach(() => {
    shell = createMockShell();
    context = { entityService: shell.getEntityService() };
    datasource = new BookDataSource(createMockLogger());
    shell.addEntities([
      book("zweites", "Zweites Buch"),
      book("erstes", "Erstes Buch"),
      section("erstes:0001-anfang", "erstes", 1, "Anfang"),
      section("erstes:0002-mitte:0001-teil", "erstes", 2, "Mitte"),
      section("erstes:0003-ende", "erstes", 3, "Ende"),
    ]);
  });

  it("lists the books, by title", async () => {
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

  it("returns a section with its book and reading neighbours", async () => {
    const result = await datasource.fetch(
      { entityType: "book-section", query: { id: "erstes/2" } },
      z.object({
        section: z.any(),
        book: z.any(),
        prev: z.any(),
        next: z.any(),
        total: z.number(),
      }),
      context,
    );

    expect(result.section.metadata.title).toBe("Mitte");
    expect(result.section.body.trim()).toBe("Erfundener Text 2.");
    expect(result.book.metadata.title).toBe("Erstes Buch");
    expect(result.book.frontmatter.author).toBe("Erfundener Autor");
    expect(result.prev.metadata.slug).toBe("erstes/1");
    expect(result.next.metadata.slug).toBe("erstes/3");
    expect(result.total).toBe(3);
  });

  it("opens a book on its title page, its first section where reading begins", async () => {
    const result = await datasource.fetch(
      { entityType: "book", query: { id: "erstes" } },
      z.object({ book: z.any(), first: z.any() }),
      context,
    );

    expect(result.book.id).toBe("erstes");
    expect(result.book.frontmatter.author).toBe("Erfundener Autor");
    expect(result.first.metadata.slug).toBe("erstes/1");
  });

  it("opens the first section after the book, with no section before it", async () => {
    const result = await datasource.fetch(
      { entityType: "book-section", query: { id: "erstes/1" } },
      z.object({ prev: z.any(), book: z.any() }),
      context,
    );

    expect(result.prev).toBeNull();
    expect(result.book.id).toBe("erstes");
  });

  it("scores a book on its title page: every section in order with its length", async () => {
    const result = await datasource.fetch(
      { entityType: "book", query: { id: "erstes" } },
      z.object({ score: z.array(z.any()) }),
      context,
    );

    expect(result.score.map((s: { slug: string }) => s.slug)).toEqual([
      "erstes/1",
      "erstes/2",
      "erstes/3",
    ]);
    expect(result.score[0]).toMatchObject({
      title: "Anfang",
      section: "S-1",
      order: 1,
      headings: [],
    });
    expect(result.score[0].length).toBeGreaterThan(0);
  });

  describe("themes", () => {
    const topic = (id: string, title: string): BaseEntity => ({
      id,
      entityType: "topic",
      content: `---\ntitle: ${title}\n---\n\nEine erfundene Zusammenfassung.\n`,
      contentHash: id,
      created: "2026-10-06T00:00:00.000Z",
      updated: "2026-10-06T00:00:00.000Z",
      visibility: "public",
      metadata: {},
    });
    const near = (entityId: string, distance: number): NearestMatch => ({
      entityId,
      entityType: "topic",
      distance,
    });
    const nearestToEntity = nearestStore([
      near("fern", 0.7),
      near("mitleid", 0.3),
      near("macht", 0.55),
      near("leben", 0.5),
      near("schwaeche", 0.58),
    ]);
    const themeSchema = z.object({
      themes: z.array(z.object({ id: z.string(), title: z.string() })),
    });

    beforeEach(() => {
      shell.addEntities(
        ["fern", "mitleid", "macht", "leben", "schwaeche"].map((id) =>
          topic(id, id.toUpperCase()),
        ),
      );
    });

    it("finds a section's nearest themes, closest first, three at most", async () => {
      const result = await datasource.fetch(
        { entityType: "book-section", query: { id: "erstes/2" } },
        themeSchema,
        {
          entityService: {
            ...shell.getEntityService(),
            nearestToEntity,
          },
        },
      );

      expect(result.themes).toEqual([
        { id: "mitleid", title: "MITLEID" },
        { id: "leben", title: "LEBEN" },
        { id: "macht", title: "MACHT" },
      ]);
    });

    it("reads a section without themes where the brain has no embeddings", async () => {
      const result = await datasource.fetch(
        { entityType: "book-section", query: { id: "erstes/2" } },
        themeSchema,
        {
          entityService: {
            ...shell.getEntityService(),
            nearestToEntity: async () => {
              throw new Error(
                "Semantic indexing is disabled for this Brain instance",
              );
            },
          },
        },
      );

      expect(result.themes).toEqual([]);
    });
  });

  it("has no next entry after the last section", async () => {
    const result = await datasource.fetch(
      { entityType: "book-section", query: { id: "erstes/3" } },
      z.object({
        section: z.any(),
        book: z.any(),
        prev: z.any(),
        next: z.any(),
      }),
      context,
    );

    expect(result.next).toBeNull();
  });
});
