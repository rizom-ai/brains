import { parse as parseYaml } from "yaml";
import { bookKindSchema } from "@brains/book";
import { z } from "@brains/utils/zod";
import { EKGWB_BASE, parseEkgwbBook } from "./adapters/ekgwb";
import { renderBook } from "./render-book";
import { writeBook } from "./write-book";

const manifestBookSchema: z.ZodObject<{
  siglum: z.ZodString;
  slug: z.ZodString;
  title: z.ZodOptional<z.ZodString>;
  author: z.ZodString;
  year: z.ZodNumber;
  kind: typeof bookKindSchema;
}> = z.object({
  siglum: z.string().min(1),
  slug: z.string().min(1),
  /** The work's own title, where the page heads it with a series title. */
  title: z.string().min(1).optional(),
  author: z.string().min(1),
  year: z.number().int(),
  kind: bookKindSchema,
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

export interface ImportResult {
  slug: string;
  entries: number;
}

/** Import the manifest's books one after another into brain-data. */
export async function importBooks(
  manifest: Manifest,
  brainData: string,
  fetchText: (url: string) => Promise<string>,
): Promise<ImportResult[]> {
  return manifest.books.reduce<Promise<ImportResult[]>>(async (done, entry) => {
    const results = await done;
    const html = await fetchText(`${EKGWB_BASE}${entry.siglum}/print`);
    const { title, units } = parseEkgwbBook(html);
    if (units.length === 0) {
      throw new Error(`No sections found for ${entry.siglum}`);
    }
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
        source: `${EKGWB_BASE}${entry.siglum}`,
      },
      units,
    });
    await writeBook(brainData, entry.slug, files);
    return [...results, { slug: entry.slug, entries: files.length }];
  }, Promise.resolve([]));
}
