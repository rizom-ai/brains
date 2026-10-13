import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { strToU8, zipSync, type Zippable } from "fflate";
import type { ViewTemplate } from "@brains/plugins";

/** What the package says about the publication. */
export interface EpubMetadata {
  /** Unique and stable across renders, e.g. `urn:brains:book:<id>`. */
  identifier: string;
  title: string;
  /** BCP 47 language of the text, e.g. `de`. */
  language: string;
  creator?: string | undefined;
  /** Last change, `YYYY-MM-DDThh:mm:ssZ`; also every file's timestamp. */
  modified: string;
}

export interface RenderEpubOptions {
  /** A view template with an `epub` renderer. */
  template: ViewTemplate;
  content: unknown;
  metadata: EpubMetadata;
}

interface Chapter {
  /** As marked, already escaped for markup. */
  title: string;
  markup: string;
}

/** A chapter opens where the EPUB component marks one. */
const CHAPTER_OPEN = /<section\b[^>]*\sdata-epub-chapter="([^"]*)"[^>]*>/g;
const SECTION_TAG = /<(\/?)section\b[^>]*>/g;
/** HTML's void elements; XHTML closes each. */
const VOID_ELEMENT =
  /<(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)\b([^>]*?)\s*\/?>/g;

const XHTML = "application/xhtml+xml";

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function closeVoidElements(markup: string): string {
  return markup.replace(VOID_ELEMENT, "<$1$2 />");
}

/** Where the section opening at `start` closes, counting nested sections. */
function sectionEnd(markup: string, start: number): number {
  const tags = [...markup.slice(start).matchAll(SECTION_TAG)];
  const depths = tags.reduce<number[]>(
    (all, tag) => [...all, (all.at(-1) ?? 0) + (tag[1] ? -1 : 1)],
    [],
  );
  const closing = tags[depths.findIndex((depth) => depth === 0)];
  if (!closing) throw new Error("An EPUB chapter is never closed");
  return start + closing.index + closing[0].length;
}

function chaptersOf(markup: string): Chapter[] {
  return [...markup.matchAll(CHAPTER_OPEN)].map((open) => ({
    title: open[1] ?? "",
    markup: markup.slice(open.index, sectionEnd(markup, open.index)),
  }));
}

function xhtmlDocument(title: string, language: string, body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${language}" xml:lang="${language}">
<head>
<meta charset="utf-8" />
<title>${title}</title>
</head>
<body>
${body}
</body>
</html>
`;
}

const CONTAINER = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles>
<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
</rootfiles>
</container>
`;

function packageDocument(metadata: EpubMetadata, chapters: number): string {
  const ids = Array.from({ length: chapters }, (_, i) => `chapter-${i + 1}`);
  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="publication-id" xml:lang="${metadata.language}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="publication-id">${escapeXml(metadata.identifier)}</dc:identifier>
<dc:title>${escapeXml(metadata.title)}</dc:title>
${metadata.creator ? `<dc:creator>${escapeXml(metadata.creator)}</dc:creator>\n` : ""}<dc:language>${metadata.language}</dc:language>
<meta property="dcterms:modified">${metadata.modified}</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="${XHTML}" properties="nav"/>
${ids.map((id) => `<item id="${id}" href="${id}.xhtml" media-type="${XHTML}"/>`).join("\n")}
</manifest>
<spine>
${ids.map((id) => `<itemref idref="${id}"/>`).join("\n")}
</spine>
</package>
`;
}

function navigationDocument(
  metadata: EpubMetadata,
  chapters: Chapter[],
): string {
  const entries = chapters
    .map(
      (chapter, i) =>
        `<li><a href="chapter-${i + 1}.xhtml">${chapter.title}</a></li>`,
    )
    .join("\n");
  return xhtmlDocument(
    escapeXml(metadata.title),
    metadata.language,
    `<nav epub:type="toc" id="toc">
<h1>${escapeXml(metadata.title)}</h1>
<ol>
${entries}
</ol>
</nav>`,
  );
}

/**
 * Render a template's `epub` variant to an EPUB 3 package. The component
 * marks each chapter as a `<section data-epub-chapter="Title">`; each becomes
 * one XHTML file in reading order, listed in the table of contents. No
 * browser is involved, and timestamps are fixed, so the same content yields
 * the same bytes.
 */
export function renderEpub(options: RenderEpubOptions): Uint8Array {
  const renderer = options.template.renderers.epub;
  if (!renderer || typeof renderer !== "function") {
    throw new Error(`No epub renderer for template: ${options.template.name}`);
  }
  const markup = renderToStaticMarkup(
    h(renderer, options.template.schema.parse(options.content)),
  );
  const chapters = chaptersOf(markup);
  if (chapters.length === 0) {
    throw new Error(`${options.template.name} marks no EPUB chapters`);
  }
  const { metadata } = options;

  const files: Zippable = {
    // The first entry, stored uncompressed: how readers recognise an EPUB.
    mimetype: [strToU8("application/epub+zip"), { level: 0 }],
    "META-INF/container.xml": strToU8(CONTAINER),
    "OEBPS/content.opf": strToU8(packageDocument(metadata, chapters.length)),
    "OEBPS/nav.xhtml": strToU8(navigationDocument(metadata, chapters)),
    ...Object.fromEntries(
      chapters.map((chapter, i) => [
        `OEBPS/chapter-${i + 1}.xhtml`,
        strToU8(
          xhtmlDocument(
            chapter.title,
            metadata.language,
            closeVoidElements(chapter.markup),
          ),
        ),
      ]),
    ),
  };
  return zipSync(files, { level: 9, mtime: new Date(metadata.modified) });
}
