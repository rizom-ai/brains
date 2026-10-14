import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ViewTemplate } from "@brains/plugins";
import { zip } from "./zip";

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
  /** Where the text comes from, e.g. the edition's URL. */
  source?: string | undefined;
  /** The license and attribution the text is distributed under. */
  rights?: string | undefined;
}

export interface RenderEpubOptions {
  /** A view template with an `epub` renderer. */
  template: ViewTemplate;
  content: unknown;
  metadata: EpubMetadata;
}

interface Chapter {
  title: string;
  /** The headings the chapter stands under, outermost first. */
  headings: string[];
  markup: string;
}

/** A node of the table of contents: a heading, or a chapter under it. */
interface NavNode {
  title: string;
  href: string;
  heading: boolean;
  children: NavNode[];
}

/**
 * A chapter opens where the EPUB component marks one, as
 * `<section data-epub-chapter="Title" data-epub-headings="[\"Part\"]">`.
 */
const CHAPTER_MARK = /\sdata-epub-chapter="/;
const ATTRIBUTE = (name: string): RegExp => new RegExp(`\\s${name}="([^"]*)"`);
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

/** An attribute value as React wrote it, unescaped. */
function attributeValue(tag: string, name: string): string | undefined {
  const value = ATTRIBUTE(name).exec(tag)?.[1];
  return value
    ?.replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function headingsOf(tag: string): string[] {
  const value = attributeValue(tag, "data-epub-headings");
  if (!value) return [];
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed)
    ? parsed.filter((heading): heading is string => typeof heading === "string")
    : [];
}

function closeVoidElements(markup: string): string {
  return markup.replace(VOID_ELEMENT, "<$1$2 />");
}

/** Where a marked chapter opened, while its section is open. */
interface OpenChapter {
  tag: string;
  start: number;
  /** The section depth the chapter opened at. */
  depth: number;
}

/**
 * The marked chapters in reading order, found in one pass over the section
 * tags: a chapter closes where its own section does, however deeply its text
 * nests sections. A book of thousands of chapters splits in linear time.
 */
function chaptersOf(markup: string): Chapter[] {
  const walk = [...markup.matchAll(SECTION_TAG)].reduce<{
    depth: number;
    open: OpenChapter | undefined;
    chapters: Chapter[];
  }>(
    (state, tag) => {
      if (!tag[1]) {
        if (!state.open && CHAPTER_MARK.test(tag[0]))
          state.open = { tag: tag[0], start: tag.index, depth: state.depth };
        state.depth += 1;
        return state;
      }
      state.depth -= 1;
      if (state.open?.depth === state.depth) {
        state.chapters.push({
          title: attributeValue(state.open.tag, "data-epub-chapter") ?? "",
          headings: headingsOf(state.open.tag),
          markup: markup.slice(state.open.start, tag.index + tag[0].length),
        });
        state.open = undefined;
      }
      return state;
    },
    { depth: 0, open: undefined, chapters: [] },
  );
  if (walk.open) throw new Error("An EPUB chapter is never closed");
  return walk.chapters;
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
${metadata.source ? `<dc:source>${escapeXml(metadata.source)}</dc:source>\n` : ""}${metadata.rights ? `<dc:rights>${escapeXml(metadata.rights)}</dc:rights>\n` : ""}<meta property="dcterms:modified">${metadata.modified}</meta>
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

/**
 * The contents as a tree: consecutive chapters under the same heading share
 * its node, which links to the first of them.
 */
function navTree(chapters: Chapter[]): NavNode[] {
  const root: NavNode[] = [];
  chapters.forEach((chapter, index) => {
    const href = `chapter-${index + 1}.xhtml`;
    const parent = chapter.headings.reduce<NavNode[]>((level, title) => {
      const last = level.at(-1);
      if (last?.heading && last.title === title) return last.children;
      const node: NavNode = { title, href, heading: true, children: [] };
      level.push(node);
      return node.children;
    }, root);
    parent.push({ title: chapter.title, href, heading: false, children: [] });
  });
  return root;
}

function navList(nodes: NavNode[]): string {
  const items = nodes.map(
    (node) =>
      `<li><a href="${node.href}">${escapeXml(node.title)}</a>${
        node.children.length > 0 ? `\n${navList(node.children)}\n` : ""
      }</li>`,
  );
  return `<ol>\n${items.join("\n")}\n</ol>`;
}

function navigationDocument(
  metadata: EpubMetadata,
  chapters: Chapter[],
): string {
  return xhtmlDocument(
    escapeXml(metadata.title),
    metadata.language,
    `<nav epub:type="toc" id="toc">
<h1>${escapeXml(metadata.title)}</h1>
${navList(navTree(chapters))}
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

  const encoder = new TextEncoder();
  const file = (
    name: string,
    text: string,
  ): { name: string; data: Uint8Array } => ({
    name,
    data: encoder.encode(text),
  });
  return zip(
    [
      // The first entry, stored uncompressed: how readers recognise an EPUB.
      { ...file("mimetype", "application/epub+zip"), store: true },
      file("META-INF/container.xml", CONTAINER),
      file("OEBPS/content.opf", packageDocument(metadata, chapters.length)),
      file("OEBPS/nav.xhtml", navigationDocument(metadata, chapters)),
      ...chapters.map((chapter, i) =>
        file(
          `OEBPS/chapter-${i + 1}.xhtml`,
          xhtmlDocument(
            escapeXml(chapter.title),
            metadata.language,
            closeVoidElements(chapter.markup),
          ),
        ),
      ),
    ],
    new Date(metadata.modified),
  );
}
