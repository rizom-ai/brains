import { describe, expect, it } from "bun:test";
import { bookFrontmatterSchema } from "@brains/book";
import { parseMarkdown } from "@brains/sdk/entities";
import { germanSlug, renderBook, type BookSource } from "../src/render-book";

const source: BookSource = {
  book: {
    slug: "erfundenes-buch",
    title: "Erfundenes Buch",
    author: "Erfundener Autor",
    year: 1888,
    kind: "work",
    edition: "Testausgabe",
    license: "CC-BY-NC-ND-4.0",
    attribution: "Testquelle",
    source: "https://example.org/eb",
    published: true,
    shortTitle: "Erfunden",
  },
  units: [
    {
      parents: [],
      title: "Vorrede",
      section: "EB-Vorrede",
      page: null,
      source: "https://example.org/eb/vorrede",
      paragraphs: ["Erster erfundener Absatz.", "Zweiter erfundener Absatz."],
    },
    {
      parents: ["Erstes Hauptstück"],
      title: "Über das Erfinden",
      section: "EB-1",
      page: "12",
      source: "https://example.org/eb/1",
      paragraphs: ["Dritter erfundener Absatz."],
    },
    {
      parents: ["Erstes Hauptstück"],
      title: "Größere Fragen",
      section: "EB-2",
      page: null,
      source: "https://example.org/eb/2",
      paragraphs: ["Vierter erfundener Absatz."],
    },
  ],
};

function frontmatterOf(markdown: string): Record<string, unknown> {
  return bookFrontmatterSchema.parse(parseMarkdown(markdown).frontmatter);
}

describe("renderBook", () => {
  it("opens with a title entry holding the book's details and contents", () => {
    const [title] = renderBook(source);

    expect(title?.path).toBe("book/erfundenes-buch/00000-titel.md");
    expect(frontmatterOf(title?.markdown ?? "")).toMatchObject({
      title: "Erfundenes Buch",
      book: "erfundenes-buch",
      order: 0,
      author: "Erfundener Autor",
      license: "CC-BY-NC-ND-4.0",
      source: "https://example.org/eb",
    });
    expect(title?.markdown).toContain("[Vorrede](/books/erfundenes-buch/1)");
    expect(title?.markdown).toContain(
      "[Erstes Hauptstück](/books/erfundenes-buch/2)",
    );
  });

  it("measures the book on its title entry", () => {
    const [title, ...sections] = renderBook(source);
    const bodyBytes = sections
      .map((file) => file.markdown.split("---\n").slice(2).join("---\n").trim())
      .reduce((sum, body) => sum + Buffer.byteLength(body, "utf8"), 0);

    expect(frontmatterOf(title?.markdown ?? "")).toMatchObject({
      published: true,
      shortTitle: "Erfunden",
      sections: 3,
      length: bodyBytes,
    });
  });

  it("writes one entry per unit in reading order, parents as folders", () => {
    const files = renderBook(source);

    expect(files.map((file) => file.path)).toEqual([
      "book/erfundenes-buch/00000-titel.md",
      "book/erfundenes-buch/00001-vorrede.md",
      "book/erfundenes-buch/00002-erstes-hauptstueck/00002-ueber-das-erfinden.md",
      "book/erfundenes-buch/00002-erstes-hauptstueck/00003-groessere-fragen.md",
    ]);
    expect(frontmatterOf(files[2]?.markdown ?? "")).toMatchObject({
      title: "Über das Erfinden",
      order: 2,
      section: "EB-1",
      page: "12",
      source: "https://example.org/eb/1",
    });
    expect(files[1]?.markdown).toContain(
      "Erster erfundener Absatz.\n\nZweiter erfundener Absatz.",
    );
  });

  it("records each section's headings, outermost first", () => {
    const [, vorrede, first] = renderBook(source);

    expect(frontmatterOf(vorrede?.markdown ?? "")["headings"]).toEqual([]);
    expect(frontmatterOf(first?.markdown ?? "")["headings"]).toEqual([
      "Erstes Hauptstück",
    ]);
  });

  it("records every level of a nested section's headings", () => {
    const [, nested] = renderBook({
      ...source,
      units: [
        {
          parents: ["Erster Theil", "Zarathustra's Vorrede"],
          title: "1",
          section: "EB-I-Vorrede-1",
          page: null,
          source: "http://www.nietzschesource.org/eKGWB/EB-I-Vorrede-1",
          paragraphs: ["Als Zarathustra dreissig Jahr alt war."],
        },
      ],
    });

    expect(frontmatterOf(nested?.markdown ?? "")["headings"]).toEqual([
      "Erster Theil",
      "Zarathustra's Vorrede",
    ]);
  });

  it("splits a unit over 8,000 bytes at paragraph boundaries", () => {
    const paragraph = "Wort ".repeat(700).trim();
    const files = renderBook({
      ...source,
      units: [
        {
          parents: [],
          title: "Lang",
          section: "EB-L",
          page: null,
          source: "https://example.org/eb/l",
          paragraphs: [paragraph, paragraph, paragraph],
        },
      ],
    });
    const entries = files.slice(1);

    expect(entries).toHaveLength(2);
    expect(entries.map((file) => frontmatterOf(file.markdown))).toMatchObject([
      { title: "Lang", section: "EB-L", order: 1 },
      { title: "Lang", section: "EB-L", order: 2 },
    ]);
    for (const file of entries) {
      const body = file.markdown.split("---\n").slice(2).join("---\n");
      expect(Buffer.byteLength(body.trim(), "utf8")).toBeLessThanOrEqual(8000);
    }
  });

  it("splits a single paragraph over 8,000 bytes at sentence boundaries", () => {
    const sentence = "Ein erfundener Satz mit einigen Worten darin.";
    const paragraph = Array.from({ length: 300 }, () => sentence).join(" ");
    const files = renderBook({
      ...source,
      units: [
        {
          parents: [],
          title: "Ein Absatz",
          section: "EB-A",
          page: null,
          source: "https://example.org/eb/a",
          paragraphs: [paragraph],
        },
      ],
    });
    const bodies = files
      .slice(1)
      .map((file) =>
        file.markdown.split("---\n").slice(2).join("---\n").trim(),
      );

    expect(bodies.length).toBeGreaterThan(1);
    for (const body of bodies) {
      expect(Buffer.byteLength(body, "utf8")).toBeLessThanOrEqual(8000);
      expect(body.endsWith(".")).toBe(true);
    }
    expect(bodies.join(" ")).toBe(paragraph);
  });

  it("writes only files the book schema accepts", () => {
    for (const file of renderBook(source)) {
      expect(() => frontmatterOf(file.markdown)).not.toThrow();
    }
  });

  it("renders the same files every time", () => {
    expect(renderBook(source)).toEqual(renderBook(source));
  });
});

describe("germanSlug", () => {
  it("transliterates umlauts and ß before slugifying", () => {
    expect(germanSlug("Über Größe & Maß")).toBe("ueber-groesse-mass");
  });
});
