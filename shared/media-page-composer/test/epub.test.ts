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
});
