import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  bookFrontmatterSchema,
  bookSectionFrontmatterSchema,
  type BookSectionFrontmatter,
} from "@brains/book";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import { EKGWB_BASE } from "./adapters/ekgwb";
import type { BookRead, BookReader } from "./import-books";
import { bookPaths, type BookUnit } from "./render-book";

interface CorpusSection {
  frontmatter: BookSectionFrontmatter;
  body: string;
}

/** A book as rendered, with its sections in reading order. */
interface CorpusBook {
  title: string;
  /** The siglum its source names: its own, or its first part's. */
  siglum: string;
  sections: CorpusSection[];
}

/**
 * Read books back from a corpus the importer rendered, so a book's structure
 * can change without fetching its source again. A siglum reads the sections
 * whose source it names, wherever they are filed: a book's own, or one part
 * of a book printed in parts. Each section becomes a unit under the headings
 * it records; in a book of parts the outermost of them is the part, which
 * the importer adds again.
 */
export async function corpusReader(brainData: string): Promise<BookReader> {
  const books = await readBooks(brainData);
  return {
    read: async (siglum): Promise<BookRead> => {
      const parts = books.flatMap((book) => {
        const sections = book.sections.filter((section) =>
          names(section.frontmatter.source, siglum),
        );
        return sections.length > 0 ? [{ book, sections }] : [];
      });
      const [found, ...others] = parts;
      if (!found) throw new Error(`No book in the corpus has siglum ${siglum}`);
      if (others.length > 0) {
        throw new Error(`Siglum ${siglum} is in more than one book`);
      }
      const ofParts = isOfParts(found.book);
      return {
        title: found.book.title,
        units: found.sections.map(({ frontmatter, body }): BookUnit => ({
          parents: ofParts
            ? frontmatter.headings.slice(1)
            : frontmatter.headings,
          title: frontmatter.title,
          section: frontmatter.section,
          page: frontmatter.page,
          source: frontmatter.source,
          paragraphs: body.trim().split("\n\n"),
        })),
      };
    },
  };
}

/** Whether a source is the siglum's own page or one of its units. */
function names(source: string, siglum: string): boolean {
  const own = `${EKGWB_BASE}${siglum}`;
  return source === own || source.startsWith(`${own}-`);
}

/** A book of parts holds sections its own siglum does not name. */
function isOfParts(book: CorpusBook): boolean {
  return book.sections.some(
    (section) => !names(section.frontmatter.source, book.siglum),
  );
}

async function readBooks(brainData: string): Promise<CorpusBook[]> {
  const files = (await readdir(join(brainData, "book"))).filter((name) =>
    name.endsWith(".md"),
  );
  const books = await Promise.all(
    files.map(async (file): Promise<CorpusBook | null> => {
      const paths = bookPaths(file.slice(0, -".md".length));
      const { metadata } = parseMarkdownWithFrontmatter(
        await readFile(join(brainData, paths.book), "utf8"),
        bookFrontmatterSchema,
      );
      if (!metadata.source.startsWith(EKGWB_BASE)) return null;
      return {
        title: metadata.title,
        siglum: metadata.source.slice(EKGWB_BASE.length),
        sections: await readSections(join(brainData, paths.sections)),
      };
    }),
  );
  return books.filter((book) => book !== null);
}

async function readSections(dir: string): Promise<CorpusSection[]> {
  const files = (await readdir(dir, { recursive: true })).filter((file) =>
    file.endsWith(".md"),
  );
  const sections = await Promise.all(
    files.map(async (file): Promise<CorpusSection> => {
      const { metadata, content } = parseMarkdownWithFrontmatter(
        await readFile(join(dir, file), "utf8"),
        bookSectionFrontmatterSchema,
      );
      return { frontmatter: metadata, body: content };
    }),
  );
  return sections.sort(
    (left, right) => left.frontmatter.order - right.frontmatter.order,
  );
}
