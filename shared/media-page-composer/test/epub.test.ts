import { describe, expect, it } from "bun:test";
import { createElement as h } from "react";
import { strFromU8, unzipSync } from "fflate";
import { createTemplate, toViewTemplate } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { renderEpub } from "../src";

interface Book {
  title: string;
  chapters: { title: string; html: string }[];
}

const book = toViewTemplate(
  "test:book",
  createTemplate<Book>({
    name: "book",
    description: "Book",
    schema: z.object({
      title: z.string(),
      chapters: z.array(z.object({ title: z.string(), html: z.string() })),
    }),
    requiredPermission: "public",
    layout: {
      formats: {
        epub: ({ chapters }) =>
          h(
            "article",
            null,
            chapters.map((chapter) =>
              h(
                "section",
                { key: chapter.title, "data-epub-chapter": chapter.title },
                h("h2", null, chapter.title),
                h("div", { dangerouslySetInnerHTML: { __html: chapter.html } }),
              ),
            ),
          ),
      },
    },
  }),
);
if (!book) throw new Error("the test book renders in no format");

const content: Book = {
  title: "Erfundenes Buch",
  chapters: [
    { title: "Vorrede & Einleitung", html: "<p>Erster<br>Absatz.</p><hr>" },
    { title: "Erstes Hauptstück", html: "<p>Zweiter Absatz.</p>" },
  ],
};
const metadata = {
  identifier: "urn:brains:book:erfundenes-buch",
  title: "Erfundenes Buch",
  creator: "Erfundener Autor",
  language: "de",
  modified: "2026-10-06T00:00:00Z",
  source: "https://example.org/eb",
  rights: "CC BY-NC-ND 4.0 · Testquelle",
};

describe("renderEpub", () => {
  const epub = renderEpub({ template: book, content, metadata });
  const files = unzipSync(epub);
  const text = (path: string): string => {
    const file = files[path];
    if (!file) throw new Error(`no ${path} in the package`);
    return strFromU8(file);
  };

  it("opens with the mimetype, stored uncompressed", () => {
    const view = new DataView(epub.buffer, epub.byteOffset, epub.byteLength);
    expect(strFromU8(epub.subarray(30, 38))).toBe("mimetype");
    expect(view.getUint16(8, true)).toBe(0);
    expect(text("mimetype")).toBe("application/epub+zip");
  });

  it("points its container at the package document", () => {
    expect(text("META-INF/container.xml")).toContain(
      'full-path="OEBPS/content.opf"',
    );
  });

  it("reads its chapters in order, one file each", () => {
    const opf = text("OEBPS/content.opf");
    expect(opf.indexOf('idref="chapter-1"')).toBeLessThan(
      opf.indexOf('idref="chapter-2"'),
    );
    expect(text("OEBPS/chapter-1.xhtml")).toContain("Vorrede &amp; Einleitung");
    expect(text("OEBPS/chapter-2.xhtml")).toContain("Zweiter Absatz.");
    expect(text("OEBPS/chapter-2.xhtml")).not.toContain("Erster");
  });

  it("names the book in its metadata", () => {
    const opf = text("OEBPS/content.opf");
    expect(opf).toContain("<dc:title>Erfundenes Buch</dc:title>");
    expect(opf).toContain("<dc:creator>Erfundener Autor</dc:creator>");
    expect(opf).toContain("<dc:language>de</dc:language>");
    expect(opf).toContain(
      '<meta property="dcterms:modified">2026-10-06T00:00:00Z</meta>',
    );
    expect(opf).toContain("<dc:source>https://example.org/eb</dc:source>");
    expect(opf).toContain(
      "<dc:rights>CC BY-NC-ND 4.0 · Testquelle</dc:rights>",
    );
  });

  it("lists every chapter in its table of contents", () => {
    const nav = text("OEBPS/nav.xhtml");
    expect(nav).toContain(
      '<a href="chapter-1.xhtml">Vorrede &amp; Einleitung</a>',
    );
    expect(nav).toContain('<a href="chapter-2.xhtml">Erstes Hauptstück</a>');
  });

  it("closes void elements, so every chapter is XHTML", () => {
    const chapter = text("OEBPS/chapter-1.xhtml");
    expect(chapter).toContain("<br />");
    expect(chapter).toContain("<hr />");
    expect(chapter).not.toMatch(/<(br|hr)>/);
  });

  it("yields the same bytes for the same book", () => {
    expect(renderEpub({ template: book, content, metadata })).toEqual(epub);
  });

  it("nests its table of contents by the headings each chapter stands under", () => {
    interface Parted {
      chapters: { title: string; headings: string[] }[];
    }
    const parted = toViewTemplate(
      "test:parted",
      createTemplate<Parted>({
        name: "parted",
        description: "Parted",
        schema: z.object({
          chapters: z.array(
            z.object({ title: z.string(), headings: z.array(z.string()) }),
          ),
        }),
        requiredPermission: "public",
        layout: {
          formats: {
            epub: ({ chapters }) =>
              h(
                "article",
                null,
                chapters.map((chapter) =>
                  h(
                    "section",
                    {
                      key: chapter.title,
                      "data-epub-chapter": chapter.title,
                      "data-epub-headings": JSON.stringify(chapter.headings),
                    },
                    h("p", null, chapter.title),
                  ),
                ),
              ),
          },
        },
      }),
    );
    if (!parted) throw new Error("the parted book renders in no format");
    const files = unzipSync(
      renderEpub({
        template: parted,
        content: {
          chapters: [
            { title: "Vorrede", headings: [] },
            { title: "1", headings: ["Erster Theil", "Zarathustra's Vorrede"] },
            { title: "2", headings: ["Erster Theil", "Zarathustra's Vorrede"] },
            {
              title: "Von den drei Verwandlungen",
              headings: ["Erster Theil", "Die Reden Zarathustra's"],
            },
          ],
        },
        metadata,
      }),
    );
    const nav = strFromU8(files["OEBPS/nav.xhtml"] ?? new Uint8Array()).replace(
      />\s+</g,
      "><",
    );

    expect(nav).toContain(
      [
        '<ol><li><a href="chapter-1.xhtml">Vorrede</a></li>',
        '<li><a href="chapter-2.xhtml">Erster Theil</a><ol>',
        `<li><a href="chapter-2.xhtml">Zarathustra's Vorrede</a><ol>`,
        '<li><a href="chapter-2.xhtml">1</a></li>',
        '<li><a href="chapter-3.xhtml">2</a></li></ol></li>',
        `<li><a href="chapter-4.xhtml">Die Reden Zarathustra's</a><ol>`,
        '<li><a href="chapter-4.xhtml">Von den drei Verwandlungen</a></li>',
        "</ol></li></ol></li></ol>",
      ].join(""),
    );
  });

  it("renders a book of thousands of chapters without stalling", () => {
    const many: Book = {
      title: "Langes Buch",
      chapters: Array.from({ length: 3000 }, (_, index) => ({
        title: `Abschnitt ${index + 1}`,
        html: `<p>${"Wort ".repeat(100)}</p>`,
      })),
    };
    const started = performance.now();
    const files = unzipSync(
      renderEpub({ template: book, content: many, metadata }),
    );

    expect(performance.now() - started).toBeLessThan(3000);
    expect(files["OEBPS/chapter-3000.xhtml"]).toBeDefined();
  });
});
