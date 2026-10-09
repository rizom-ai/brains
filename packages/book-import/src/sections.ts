import type { BookUnit } from "./render-book";

/** A paragraph or note, and the page its text starts on, in reading order. */
export interface PlacedText {
  text: string;
  page: number;
}

/** The text under one heading, with the headings above it. */
export interface TitledSection<Block extends PlacedText> {
  /** The headings above the text and its own, as they stand in the work. */
  path: readonly object[];
  /** Their titles, in the same order. */
  titles: string[];
  paragraphs: Block[];
  notes: Block[];
}

/**
 * A long section's text in parts of about this many bytes, split at
 * paragraphs, leaving room for its notes within an entry's 8,000 bytes.
 */
export const ENTRY_BYTES = 6000;

function bytes(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

/** Paragraphs grouped into parts, each starting where its first paragraph does. */
function partsOf<Block extends PlacedText>(
  paragraphs: Block[],
  entryBytes: number,
): Block[][] {
  return paragraphs.reduce<Block[][]>((parts, paragraph) => {
    const last = parts.at(-1);
    const size = (last ?? []).reduce(
      (sum, block) => sum + bytes(block.text),
      0,
    );
    return last && last.length > 0 && size + bytes(paragraph.text) <= entryBytes
      ? [...parts.slice(0, -1), [...last, paragraph]]
      : [...parts, [paragraph]];
  }, []);
}

/** Where a part is cited from and where its text can be seen. */
export interface Citation {
  citation: string;
  source: string;
}

/**
 * A work's sections as the book's units. A long section is split at
 * paragraphs into parts, each cited from the page it starts on and carrying
 * the notes of its pages; a section with subsections holds its opening text
 * beside them, under its own heading.
 */
export function unitsOfSections<Block extends PlacedText>(
  sections: TitledSection<Block>[],
  cite: (start: Block) => Citation,
  entryBytes: number = ENTRY_BYTES,
): BookUnit[] {
  const filled = sections.filter((section) => section.paragraphs.length > 0);
  return filled.flatMap((section) => {
    const hasSubsections = filled.some(
      (other) =>
        other.path.length > section.path.length &&
        section.path.every((step, index) => other.path[index] === step),
    );
    const parents = hasSubsections
      ? section.titles
      : section.titles.slice(0, -1);
    const parts = partsOf(section.paragraphs, entryBytes);
    // A note goes with the last part that starts on or before its page.
    const partOfNote = (note: Block): number =>
      parts.reduce(
        (found, part, partIndex) =>
          (part[0]?.page ?? Infinity) <= note.page ? partIndex : found,
        0,
      );
    return parts.flatMap((part, partIndex) => {
      const start = part[0];
      if (!start) return [];
      const { citation, source } = cite(start);
      const notes = section.notes.filter(
        (note) => partOfNote(note) === partIndex,
      );
      return [
        {
          parents,
          title: section.titles.at(-1) ?? citation,
          section: citation,
          page: citation,
          source,
          paragraphs: [...part, ...notes].map((block) => block.text),
        },
      ];
    });
  });
}
