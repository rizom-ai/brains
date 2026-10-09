import { parse as parseYaml } from "yaml";
import { bookKindSchema } from "@brains/book";
import { z } from "@brains/utils/zod";
import { EKGWB_BASE, parseEkgwbBook } from "./adapters/ekgwb";
import { parseArchiveOcrWork } from "./adapters/archive-ocr";
import { renderBook, type BookDetails, type BookUnit } from "./render-book";
import { writeBook } from "./write-book";

interface BookFields {
  slug: z.ZodString;
  shortTitle: z.ZodOptional<z.ZodString>;
  published: z.ZodDefault<z.ZodBoolean>;
  author: z.ZodString;
  year: z.ZodNumber;
  kind: typeof bookKindSchema;
}

/** An interface as a plain object type, which zod's object shapes require. */
type Shape<T> = { [K in keyof T]: T[K] };

/** What every manifest entry says about its book, whatever its source. */
const bookFields: BookFields = {
  slug: z.string().min(1),
  /** A title short enough for a book's spine. */
  shortTitle: z.string().min(1).optional(),
  /** False for writings published only after the author's death. */
  published: z.boolean().default(true),
  author: z.string().min(1),
  year: z.number().int(),
  kind: bookKindSchema,
};

const ekgwbBookSchema: z.ZodObject<
  Shape<BookFields & { siglum: z.ZodString; title: z.ZodOptional<z.ZodString> }>
> = z.object({
  ...bookFields,
  siglum: z.string().min(1),
  /** The work's own title, where the page heads it with a series title. */
  title: z.string().min(1).optional(),
});

const archiveOcrBookSchema: z.ZodObject<
  Shape<
    BookFields & {
      item: z.ZodString;
      volume: z.ZodString;
      firstPage: z.ZodNumber;
      lastPage: z.ZodNumber;
      title: z.ZodString;
      edition: z.ZodString;
      skipPages: z.ZodDefault<z.ZodArray<z.ZodNumber>>;
    }
  >
> = z.object({
  ...bookFields,
  /** The archive.org item holding the scanned volume. */
  item: z.string().min(1),
  /** The volume's roman numeral, as citations name it. */
  volume: z.string().min(1),
  /** The work's printed pages in the volume. */
  firstPage: z.number().int().positive(),
  lastPage: z.number().int().positive(),
  title: z.string().min(1),
  /** The printed edition the scan reproduces. */
  edition: z.string().min(1),
  /** Pages in the range that are not the author's, such as an editors' note. */
  skipPages: z.array(z.number().int().positive()).default([]),
});

const manifestSchema: z.ZodDiscriminatedUnion<
  [
    z.ZodObject<{
      source: z.ZodLiteral<"ekgwb">;
      books: z.ZodArray<typeof ekgwbBookSchema>;
    }>,
    z.ZodObject<{
      source: z.ZodLiteral<"archive-ocr">;
      books: z.ZodArray<typeof archiveOcrBookSchema>;
    }>,
  ],
  "source"
> = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("ekgwb"),
    books: z.array(ekgwbBookSchema).min(1),
  }),
  z.object({
    source: z.literal("archive-ocr"),
    books: z.array(archiveOcrBookSchema).min(1),
  }),
]);

export type Manifest = z.output<typeof manifestSchema>;

export function parseManifest(yaml: string): Manifest {
  return manifestSchema.parse(parseYaml(yaml));
}

const EKGWB_EDITION =
  "Digitale Kritische Gesamtausgabe Werke und Briefe (eKGWB), nach der Kritischen Gesamtausgabe von Giorgio Colli und Mazzino Montinari";
const EKGWB_ATTRIBUTION =
  "Nietzsche Source, eKGWB, ed. Paolo D'Iorio (nietzschesource.org)";

const ARCHIVE = "https://archive.org";

const archiveMetadataSchema = z.object({
  files: z.array(z.object({ name: z.string(), format: z.string() })),
});

type FetchText = (url: string) => Promise<string>;

export interface ImportResult {
  slug: string;
  entries: number;
}

interface LoadedBook {
  book: BookDetails;
  units: BookUnit[];
}

async function loadEkgwbBook(
  entry: z.output<typeof ekgwbBookSchema>,
  fetchText: FetchText,
): Promise<LoadedBook> {
  const html = await fetchText(`${EKGWB_BASE}${entry.siglum}/print`);
  const { title, units } = parseEkgwbBook(html, entry.siglum);
  return {
    book: {
      slug: entry.slug,
      title: entry.title ?? title,
      author: entry.author,
      year: entry.year,
      kind: entry.kind,
      edition: EKGWB_EDITION,
      license: "CC-BY-NC-ND-4.0",
      attribution: EKGWB_ATTRIBUTION,
      source: `${EKGWB_BASE}${entry.siglum}`,
      published: entry.published,
      shortTitle: entry.shortTitle ?? null,
    },
    units,
  };
}

/** A work in a scanned volume; the item's metadata names its hOCR file. */
async function loadArchiveOcrBook(
  entry: z.output<typeof archiveOcrBookSchema>,
  fetchText: FetchText,
): Promise<LoadedBook> {
  const metadata = archiveMetadataSchema.parse(
    JSON.parse(await fetchText(`${ARCHIVE}/metadata/${entry.item}`)),
  );
  const hocr = metadata.files.find((file) => file.format === "hOCR");
  if (!hocr) throw new Error(`No hOCR file in ${entry.item}`);
  const units = parseArchiveOcrWork(
    await fetchText(`${ARCHIVE}/download/${entry.item}/${hocr.name}`),
    entry,
  );
  return {
    book: {
      slug: entry.slug,
      title: entry.title,
      author: entry.author,
      year: entry.year,
      kind: entry.kind,
      edition: entry.edition,
      license: "public-domain",
      attribution: `Scan: Internet Archive (archive.org/details/${entry.item})`,
      source: `${ARCHIVE}/details/${entry.item}`,
      published: entry.published,
      shortTitle: entry.shortTitle ?? null,
    },
    units,
  };
}

function loadersOf(
  manifest: Manifest,
  fetchText: FetchText,
): Array<() => Promise<LoadedBook>> {
  return manifest.source === "ekgwb"
    ? manifest.books.map((entry) => () => loadEkgwbBook(entry, fetchText))
    : manifest.books.map((entry) => () => loadArchiveOcrBook(entry, fetchText));
}

/** Import the manifest's books one after another into brain-data. */
export async function importBooks(
  manifest: Manifest,
  brainData: string,
  fetchText: FetchText,
): Promise<ImportResult[]> {
  return loadersOf(manifest, fetchText).reduce<Promise<ImportResult[]>>(
    async (done, load) => {
      const results = await done;
      const { book, units } = await load();
      if (units.length === 0) {
        throw new Error(`No sections found for ${book.slug}`);
      }
      const files = renderBook({ book, units });
      await writeBook(brainData, book.slug, files);
      return [...results, { slug: book.slug, entries: files.length }];
    },
    Promise.resolve([]),
  );
}
