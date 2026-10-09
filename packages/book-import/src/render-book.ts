import { generateMarkdownWithFrontmatter } from "@brains/plugins";
import { bookSectionSlug, type BookFrontmatter } from "@brains/book";
import { slugify } from "@brains/utils/string-utils";

/** One unit of the author's or edition's own structure, in reading order. */
export interface BookUnit {
  /** Headings of the parts that contain this unit, outermost first. */
  parents: string[];
  title: string;
  /** The citation unit: aphorism number, §, or edition siglum. */
  section: string | null;
  page: string | null;
  source: string;
  paragraphs: string[];
}

export interface BookDetails {
  slug: string;
  title: string;
  author: string;
  year: number;
  kind: NonNullable<BookFrontmatter["kind"]>;
  edition: string;
  license: NonNullable<BookFrontmatter["license"]>;
  attribution: string | null;
  source: string;
  /** Published in the author's lifetime, including private prints. */
  published: boolean;
  shortTitle: string | null;
}

export interface BookSource {
  book: BookDetails;
  units: BookUnit[];
}

export interface BookFile {
  /** Path below brain-data. */
  path: string;
  markdown: string;
}

/** Keeps every entry inside one embedding input. */
const MAX_ENTRY_BYTES = 8000;
const ORDER_DIGITS = 5;

const TRANSLITERATIONS: Record<string, string> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  Ä: "Ae",
  Ö: "Oe",
  Ü: "Ue",
  ß: "ss",
};

/** Slugs keep German words readable instead of dropping their umlauts. */
export function germanSlug(text: string): string {
  return slugify(
    text.replace(/[äöüÄÖÜß]/g, (ch) => TRANSLITERATIONS[ch] ?? ch),
  );
}

function padded(order: number): string {
  return String(order).padStart(ORDER_DIGITS, "0");
}

function bytes(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

/** Greedily join pieces into bodies of at most MAX_ENTRY_BYTES. */
function pack(pieces: string[], separator: string): string[] {
  return pieces.reduce<string[]>((bodies, piece) => {
    const last = bodies.at(-1);
    const joined = `${last}${separator}${piece}`;
    if (last !== undefined && bytes(joined) <= MAX_ENTRY_BYTES) {
      return [...bodies.slice(0, -1), joined];
    }
    return [...bodies, piece];
  }, []);
}

/** A paragraph too long for one entry breaks at its sentences instead. */
function fitParagraph(paragraph: string): string[] {
  if (bytes(paragraph) <= MAX_ENTRY_BYTES) return [paragraph];
  return pack(paragraph.split(/(?<=[.!?;:])\s+/), " ");
}

/**
 * Pack paragraphs into bodies of at most MAX_ENTRY_BYTES at paragraph
 * boundaries; only a paragraph longer than that is split, at its sentences.
 */
function packParagraphs(paragraphs: string[]): string[] {
  return pack(paragraphs.flatMap(fitParagraph), "\n\n");
}

interface PlacedEntry {
  unit: BookUnit;
  body: string;
  order: number;
  folders: string[];
}

/**
 * Number every entry in reading order and give each parent heading a folder
 * named after the order of its first entry, so folders and files sort as
 * the book reads.
 */
function placeEntries(units: BookUnit[]): PlacedEntry[] {
  return units.reduce<{ entries: PlacedEntry[]; folders: Map<string, string> }>(
    (state, unit) => {
      const firstOrder = state.entries.length + 1;
      const folders = unit.parents.map((_, depth) => {
        const key = unit.parents.slice(0, depth + 1).join("\u0000");
        const existing = state.folders.get(key);
        if (existing) return existing;
        const folder = `${padded(firstOrder)}-${germanSlug(unit.parents[depth] ?? "")}`;
        state.folders.set(key, folder);
        return folder;
      });
      const placed = packParagraphs(unit.paragraphs).map((body, index) => ({
        unit,
        body,
        order: firstOrder + index,
        folders,
      }));
      return { entries: [...state.entries, ...placed], folders: state.folders };
    },
    { entries: [], folders: new Map() },
  ).entries;
}

/** Top-level parts, each linked at its first entry. */
function tableOfContents(book: BookDetails, entries: PlacedEntry[]): string {
  const lines = entries.reduce<{ seen: Set<string>; lines: string[] }>(
    (state, entry) => {
      const heading = entry.unit.parents[0] ?? entry.unit.title;
      if (state.seen.has(heading)) return state;
      state.seen.add(heading);
      const href = `/books/${bookSectionSlug(book.slug, entry.order)}`;
      return {
        seen: state.seen,
        lines: [...state.lines, `- [${heading}](${href})`],
      };
    },
    { seen: new Set(), lines: [] },
  ).lines;
  return `## Contents\n\n${lines.join("\n")}\n`;
}

/** Where a book is written: the book itself, then a folder of its sections. */
export function bookPaths(slug: string): { book: string; sections: string } {
  return { book: `book/${slug}.md`, sections: `book-section/${slug}` };
}

/** Render a book and its sections as markdown files, deterministically. */
export function renderBook({ book, units }: BookSource): BookFile[] {
  const entries = placeEntries(units);
  const paths = bookPaths(book.slug);

  const title: BookFile = {
    path: paths.book,
    markdown: generateMarkdownWithFrontmatter(tableOfContents(book, entries), {
      title: book.title,
      source: book.source,
      author: book.author,
      year: book.year,
      kind: book.kind,
      edition: book.edition,
      license: book.license,
      attribution: book.attribution,
      published: book.published,
      shortTitle: book.shortTitle,
      sections: entries.length,
      length: entries.reduce((sum, entry) => sum + bytes(entry.body), 0),
    }),
  };

  const sections = entries.map((entry): BookFile => ({
    path: [
      paths.sections,
      ...entry.folders,
      `${padded(entry.order)}-${germanSlug(entry.unit.title)}.md`,
    ].join("/"),
    markdown: generateMarkdownWithFrontmatter(`${entry.body}\n`, {
      title: entry.unit.title,
      book: book.slug,
      order: entry.order,
      section: entry.unit.section,
      page: entry.unit.page,
      headings: entry.unit.parents,
      source: entry.unit.source,
    }),
  }));

  return [title, ...sections];
}
