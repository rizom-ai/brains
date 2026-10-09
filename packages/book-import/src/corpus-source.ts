import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { bookFrontmatterSchema } from "@brains/book";
import { z } from "@brains/utils/zod";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import { EKGWB_BASE } from "./adapters/ekgwb";
import type { BookRead, BookReader } from "./import-books";
import type { BookUnit } from "./render-book";

/** A book's entries as rendered under `book/<slug>`, in reading order. */
interface CorpusBook {
  slug: string;
  dir: string;
}

/**
 * Read books back from a corpus the importer rendered, so a book's structure
 * can change without fetching its source again. A book is found by the siglum
 * its title entry's source names. Each entry becomes a unit under the
 * headings it records.
 */
export async function corpusReader(brainData: string): Promise<BookReader> {
  const books = await indexBooks(brainData);
  return {
    read: async (siglum): Promise<BookRead> => {
      const book = books.get(siglum);
      if (!book) throw new Error(`No book in the corpus has siglum ${siglum}`);
      return readBook(book);
    },
  };
}

async function indexBooks(brainData: string): Promise<Map<string, CorpusBook>> {
  const root = join(brainData, "book");
  const slugs = await readdir(root);
  const entries = await Promise.all(
    slugs.map(async (slug): Promise<[string, CorpusBook] | null> => {
      const dir = join(root, slug);
      const titles = (await readdir(dir)).filter((name) =>
        name.startsWith("00000-"),
      );
      const titleFile = titles[0];
      if (!titleFile) return null;
      const { metadata } = parseMarkdownWithFrontmatter(
        await readFile(join(dir, titleFile), "utf8"),
        bookFrontmatterSchema,
      );
      if (!metadata.source.startsWith(EKGWB_BASE)) return null;
      return [metadata.source.slice(EKGWB_BASE.length), { slug, dir }];
    }),
  );
  return new Map(entries.filter((entry) => entry !== null));
}

/**
 * A corpus written before sections recorded their headings kept only the
 * outermost one, as `part`; it reads as a path of that one heading.
 */
const corpusEntrySchema = bookFrontmatterSchema.extend({
  part: z.string().nullable().optional(),
});

function headingsOf(entry: z.output<typeof corpusEntrySchema>): string[] {
  if (entry.headings.length > 0) return entry.headings;
  return entry.part ? [entry.part] : [];
}

async function readBook(book: CorpusBook): Promise<BookRead> {
  const files = (await readdir(book.dir, { recursive: true })).filter((file) =>
    file.endsWith(".md"),
  );
  const parsed = await Promise.all(
    files.map(async (file) =>
      parseMarkdownWithFrontmatter(
        await readFile(join(book.dir, file), "utf8"),
        corpusEntrySchema,
      ),
    ),
  );
  const byOrder = parsed.sort(
    (left, right) => left.metadata.order - right.metadata.order,
  );
  const title = byOrder[0];
  if (title?.metadata.order !== 0) {
    throw new Error(`${book.slug} has no title entry`);
  }
  const units = byOrder.slice(1).map(({ metadata, content }): BookUnit => ({
    parents: headingsOf(metadata),
    title: metadata.title,
    section: metadata.section,
    page: metadata.page,
    source: metadata.source,
    paragraphs: content.trim().split("\n\n"),
  }));
  return { title: title.metadata.title, units };
}
