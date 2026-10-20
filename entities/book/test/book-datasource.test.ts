import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import { createMockShell, type MockShell } from "@brains/plugins/test";
import type { BaseDataSourceContext, BaseEntity } from "@brains/plugins";
import { createMockLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { BookDataSource } from "../src/datasources/book-datasource";
import { getTemplates } from "../src/lib/register-templates";
import { nearestStore, type NearestMatch } from "./helpers/nearest-store";
import { book, section } from "./helpers/books";
import type { Book } from "../src/schemas/book";
import {
  bookDetailPageSchema,
  bookSectionPageSchema,
} from "../src/schemas/book-pages";

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
    expect(result.prev.slug).toBe("erstes/1");
    expect(result.next.slug).toBe("erstes/3");
    expect(result.total).toBe(3);
  });

  it("looks every section up by its slug, which a build finds by index", async () => {
    const listEntities = spyOn(shell.getEntityService(), "listEntities");

    await datasource.fetch(
      { entityType: "book-section", query: { id: "erstes/2" } },
      z.object({ section: z.any() }),
      context,
    );

    const filters = listEntities.mock.calls.map(
      ([request]) => request.options?.filter?.metadata,
    );
    expect(filters.length).toBeGreaterThan(0);
    expect(
      filters.every((filter) => Object.keys(filter ?? {}).join() === "slug"),
    ).toBe(true);
  });

  it("reads a book's sections by their slug prefix, the book alone", async () => {
    const listEntities = spyOn(shell.getEntityService(), "listEntities");

    const result = await datasource.fetch(
      { entityType: "book", query: { id: "erstes" } },
      bookDetailPageSchema,
      context,
    );

    expect(result.score.map((entry) => entry.slug)).toEqual([
      "erstes/1",
      "erstes/2",
      "erstes/3",
    ]);
    const sectionFilters = listEntities.mock.calls
      .filter(([request]) => request.entityType === "book-section")
      .map(([request]) => request.options?.filter);
    expect(sectionFilters).toContainEqual({
      metadataPrefix: { slug: "erstes/" },
    });
    expect(
      sectionFilters.some((filter) => filter?.metadata?.["book"] !== undefined),
    ).toBe(false);
  });

  it("counts a book's sections by their slug prefix when the book has no count", async () => {
    const countEntities = spyOn(shell.getEntityService(), "countEntities");

    const result = await datasource.fetch(
      { entityType: "book-section", query: { id: "erstes/2" } },
      bookSectionPageSchema,
      context,
    );

    expect(result.total).toBe(3);
    expect(
      countEntities.mock.calls.map(([request]) => request.options),
    ).toEqual([{ filter: { metadataPrefix: { slug: "erstes/" } } }]);
  });

  it("carries what the page shows: its text once, links to its neighbours, its book without text", async () => {
    const result = await datasource.fetch(
      { entityType: "book-section", query: { id: "erstes/2" } },
      bookSectionPageSchema,
      context,
    );

    expect(result.prev).toEqual({
      slug: "erstes/1",
      title: "Anfang",
      section: "S-1",
    });
    expect(result.next).toEqual({
      slug: "erstes/3",
      title: "Ende",
      section: "S-3",
    });
    expect(result.section).not.toHaveProperty("content");
    expect(result.section.body.trim()).toBe("Erfundener Text 2.");
    expect(result.book).not.toHaveProperty("content");
    expect(result.book).not.toHaveProperty("body");
  });

  it("opens a book's title page with a link where reading begins", async () => {
    const result = await datasource.fetch(
      { entityType: "book", query: { id: "erstes" } },
      bookDetailPageSchema,
      context,
    );

    expect(result.first).toEqual({
      slug: "erstes/1",
      title: "Anfang",
      section: "S-1",
    });
    expect(result.book).not.toHaveProperty("content");
    expect(result.book).not.toHaveProperty("body");
  });

  it("opens a book on its title page, its first section where reading begins", async () => {
    const result = await datasource.fetch(
      { entityType: "book", query: { id: "erstes" } },
      z.object({ book: z.any(), first: z.any() }),
      context,
    );

    expect(result.book.id).toBe("erstes");
    expect(result.book.frontmatter.author).toBe("Erfundener Autor");
    expect(result.first.slug).toBe("erstes/1");
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

  describe("a section split for length", () => {
    // Section S-2 is long: its entries 2, 3 and 4 are one section.
    beforeEach(() => {
      shell.addEntities([
        book("langes", "Langes Buch", "\nsections: 3\ncontinuations: [3, 4]"),
        section("langes:0001-a", "langes", 1, "A"),
        section("langes:0002-b", "langes", 2, "B", "S-2"),
        section("langes:0003-b", "langes", 3, "B", "S-2"),
        section("langes:0004-b", "langes", 4, "B", "S-2"),
        section("langes:0005-c", "langes", 5, "C", "S-3"),
      ]);
    });
    const page = z.object({
      section: z.any(),
      prev: z.any(),
      next: z.any(),
      position: z.number(),
      total: z.number(),
    });

    it("reads as one section from any of its entries", async () => {
      const result = await datasource.fetch(
        { entityType: "book-section", query: { id: "langes/3" } },
        page,
        context,
      );

      expect(result.section.metadata.slug).toBe("langes/2");
      expect(result.section.body).toContain("Erfundener Text 2.");
      expect(result.section.body).toContain("Erfundener Text 3.");
      expect(result.section.body).toContain("Erfundener Text 4.");
      expect(result.prev.slug).toBe("langes/1");
      expect(result.next.slug).toBe("langes/5");
      expect(result.position).toBe(2);
      expect(result.total).toBe(3);
    });

    it("keeps its place through the page template's schema", async () => {
      const schema = getTemplates()["book-section-detail"]?.schema;
      if (!schema) throw new Error("missing book-section-detail template");
      const result = await datasource.fetch(
        { entityType: "book-section", query: { id: "langes/3" } },
        schema,
        context,
      );

      expect(result).toMatchObject({ position: 2, total: 3 });
    });

    it("steps back to the start of the section before", async () => {
      const result = await datasource.fetch(
        { entityType: "book-section", query: { id: "langes/5" } },
        page,
        context,
      );

      expect(result.prev.slug).toBe("langes/2");
      expect(result.position).toBe(3);
    });

    it("scores it once, at its whole length", async () => {
      const result = await datasource.fetch(
        { entityType: "book", query: { id: "langes" } },
        z.object({ score: z.array(z.any()) }),
        context,
      );

      expect(result.score.map((s: { slug: string }) => s.slug)).toEqual([
        "langes/1",
        "langes/2",
        "langes/5",
      ]);
      expect(result.score[1].length).toBe(
        3 * Buffer.byteLength("Erfundener Text 2.", "utf8"),
      );
    });
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
    const topics = ["fern", "mitleid", "macht", "leben", "schwaeche"].map(
      (id) => topic(id, id.toUpperCase()),
    );
    const nearestToEntity = nearestStore(
      [
        near("fern", 0.7),
        near("mitleid", 0.3),
        near("macht", 0.55),
        near("leben", 0.5),
        near("schwaeche", 0.58),
      ],
      topics,
    );
    const themeSchema = z.object({
      themes: z.array(z.object({ id: z.string(), title: z.string() })),
    });

    beforeEach(() => {
      shell.addEntities(topics);
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
