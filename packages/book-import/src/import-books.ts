import { parse as parseYaml } from "yaml";
import { bookKindSchema } from "@brains/book";
import { z } from "@brains/utils/zod";
import { EKGWB_BASE, parseEkgwbBook } from "./adapters/ekgwb";
import { renderBook, type BookUnit } from "./render-book";
import { writeBook } from "./write-book";

const manifestPartSchema: z.ZodObject<{
  siglum: z.ZodString;
  title: z.ZodString;
}> = z.object({
  siglum: z.string().min(1),
  /** The part's title as its title page names it: "Erster Theil". */
  title: z.string().min(1),
});

const manifestBookSchema: z.ZodObject<{
  siglum: z.ZodOptional<z.ZodString>;
  parts: z.ZodOptional<z.ZodArray<typeof manifestPartSchema>>;
  slug: z.ZodString;
  title: z.ZodOptional<z.ZodString>;
  shortTitle: z.ZodOptional<z.ZodString>;
  published: z.ZodDefault<z.ZodBoolean>;
  author: z.ZodString;
  year: z.ZodNumber;
  kind: typeof bookKindSchema;
}> = z
  .object({
    /** The book's siglum, for a book printed as one. */
    siglum: z.string().min(1).optional(),
    /**
     * A title printed in numbered parts is one book: each part is read from
     * its own siglum, in this order.
     */
    parts: z.array(manifestPartSchema).min(2).optional(),
    slug: z.string().min(1),
    /** The work's own title, where the page heads it with a series title. */
    title: z.string().min(1).optional(),
    /** A title short enough for a book's spine. */
    shortTitle: z.string().min(1).optional(),
    /** False for writings published only after the author's death. */
    published: z.boolean().default(true),
    author: z.string().min(1),
    year: z.number().int(),
    kind: bookKindSchema,
  })
  .refine(
    (book) => (book.siglum === undefined) !== (book.parts === undefined),
    {
      message: "A book names either its siglum or its parts",
    },
  )
  .refine((book) => book.parts === undefined || book.title !== undefined, {
    message: "A book of parts names its title",
  });

export const manifestSchema: z.ZodObject<{
  source: z.ZodLiteral<"ekgwb">;
  books: z.ZodArray<typeof manifestBookSchema>;
}> = z.object({
  source: z.literal("ekgwb"),
  books: z.array(manifestBookSchema).min(1),
});

export type Manifest = z.output<typeof manifestSchema>;

export function parseManifest(yaml: string): Manifest {
  return manifestSchema.parse(parseYaml(yaml));
}

const EKGWB_EDITION =
  "Digitale Kritische Gesamtausgabe Werke und Briefe (eKGWB), nach der Kritischen Gesamtausgabe von Giorgio Colli und Mazzino Montinari";
const EKGWB_ATTRIBUTION =
  "Nietzsche Source, eKGWB, ed. Paolo D'Iorio (nietzschesource.org)";

/** A book's title and units, read from a source by its siglum. */
export interface BookRead {
  title: string;
  units: BookUnit[];
}

/** Where the importer reads a siglum's book from. */
export interface BookReader {
  read(siglum: string): Promise<BookRead>;
}

/** Read each siglum's print page from eKGWB. */
export function ekgwbReader(
  fetchText: (url: string) => Promise<string>,
): BookReader {
  return {
    read: async (siglum): Promise<BookRead> =>
      parseEkgwbBook(await fetchText(`${EKGWB_BASE}${siglum}/print`), siglum),
  };
}

export interface ImportResult {
  slug: string;
  entries: number;
}

/** Import the manifest's books one after another into brain-data. */
export async function importBooks(
  manifest: Manifest,
  brainData: string,
  reader: BookReader,
): Promise<ImportResult[]> {
  return manifest.books.reduce<Promise<ImportResult[]>>(async (done, entry) => {
    const results = await done;
    const parts = entry.parts ?? [{ siglum: entry.siglum ?? "", title: null }];
    const read = await parts.reduce<Promise<BookRead[]>>(
      async (previous, part) => {
        const book = await reader.read(part.siglum);
        if (book.units.length === 0) {
          throw new Error(`No sections found for ${part.siglum}`);
        }
        // A part's title encloses everything read from its siglum.
        const units = book.units.map((unit) => ({
          ...unit,
          parents:
            part.title === null ? unit.parents : [part.title, ...unit.parents],
        }));
        return [...(await previous), { title: book.title, units }];
      },
      Promise.resolve([]),
    );
    const title = read[0]?.title ?? "";
    const units = read.flatMap((part) => part.units);
    const files = renderBook({
      book: {
        slug: entry.slug,
        title: entry.title ?? title,
        author: entry.author,
        year: entry.year,
        kind: entry.kind,
        edition: EKGWB_EDITION,
        license: "CC-BY-NC-ND-4.0",
        attribution: EKGWB_ATTRIBUTION,
        source: `${EKGWB_BASE}${parts[0]?.siglum ?? ""}`,
        published: entry.published,
        shortTitle: entry.shortTitle ?? null,
      },
      units,
    });
    await writeBook(brainData, entry.slug, files);
    return [...results, { slug: entry.slug, entries: files.length }];
  }, Promise.resolve([]));
}
