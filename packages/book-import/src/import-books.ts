import { parse as parseYaml } from "yaml";
import { bookKindSchema } from "@brains/book";
import { z } from "@brains/utils/zod";
import { EKGWB_BASE, parseEkgwbBook } from "./adapters/ekgwb";
import { parseArchiveOcrWork } from "./adapters/archive-ocr";
import { parseDtaTei } from "./adapters/dta-tei";
import { parseGutenbergLetters } from "./adapters/gutenberg-letters";
import { MEGA_DOCS, parseMegaEtx } from "./adapters/mega-etx";
import {
  LANGUAGES,
  isWritersLetter,
  type MegaLetter,
  megaLetterUnits,
  parseMegaLetter,
  parseMegaListing,
} from "./adapters/mega-letters";
import { parseWikisourcePage, wikisourcePageUrl } from "./adapters/wikisource";
import {
  frakturRead,
  volumeOfPages,
  type OcrReading,
  type PageOcr,
} from "./page-ocr";
import { renderBook, type BookDetails, type BookUnit } from "./render-book";
import { writeBook } from "./write-book";

const manifestPartSchema: z.ZodObject<{
  siglum: z.ZodString;
  title: z.ZodString;
}> = z.object({
  siglum: z.string().min(1),
  /** The part's title as its title page names it: "Erster Theil". */
  title: z.string().min(1),
});

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
  Shape<
    BookFields & {
      siglum: z.ZodOptional<z.ZodString>;
      parts: z.ZodOptional<z.ZodArray<typeof manifestPartSchema>>;
      title: z.ZodOptional<z.ZodString>;
    }
  >
> = z.object({
  ...bookFields,
  /** The book's siglum, for a book printed as one. */
  siglum: z.string().min(1).optional(),
  /**
   * A title printed in numbered parts is one book: each part is read from
   * its own siglum, in this order.
   */
  parts: z.array(manifestPartSchema).min(2).optional(),
  /** The work's own title, where the page heads it with a series title. */
  title: z.string().min(1).optional(),
});

/** A printed page: its number, or its roman number in the front matter. */
const printedPageSchema: z.ZodUnion<[z.ZodNumber, z.ZodString]> = z.union([
  z.number().int().positive(),
  z.string().regex(/^[IVXL]+$/),
]);

/** A line on a printed page, by the words it opens with: a note left out, a chapter set without its numeral. */
const pageLineSchema: z.ZodObject<{
  page: typeof printedPageSchema;
  opens: z.ZodString;
}> = z.object({ page: printedPageSchema, opens: z.string().min(1) });

/** A heading by the line that opens it, or the numeral the scan lost above that line. */
const headingLineSchema: z.ZodObject<{
  page: typeof printedPageSchema;
  opens: z.ZodString;
  numeral: z.ZodOptional<z.ZodString>;
}> = z.object({
  page: printedPageSchema,
  opens: z.string().min(1),
  numeral: z
    .string()
    .regex(/^[IVXL]+$/)
    .optional(),
});

const archiveOcrBookSchema: z.ZodObject<
  Shape<
    BookFields & {
      item: z.ZodString;
      citation: z.ZodString;
      ocr: z.ZodOptional<z.ZodString>;
      binarise: z.ZodDefault<z.ZodBoolean>;
      firstPage: z.ZodUnion<[z.ZodNumber, z.ZodString]>;
      lastPage: z.ZodNumber;
      title: z.ZodString;
      edition: z.ZodString;
      skipPages: z.ZodDefault<z.ZodArray<z.ZodNumber>>;
      skipHeadings: z.ZodDefault<z.ZodArray<z.ZodString>>;
      firstChapter: z.ZodDefault<z.ZodNumber>;
      references: z.ZodOptional<z.ZodArray<z.ZodURL>>;
      printedWords: z.ZodDefault<z.ZodArray<z.ZodString>>;
      skipNotes: z.ZodDefault<z.ZodArray<typeof pageLineSchema>>;
      headings: z.ZodDefault<z.ZodArray<typeof headingLineSchema>>;
      skipNotesSigned: z.ZodDefault<z.ZodArray<z.ZodString>>;
      spacedNotes: z.ZodDefault<z.ZodBoolean>;
      datelined: z.ZodDefault<z.ZodBoolean>;
      opensWith: z.ZodOptional<z.ZodString>;
    }
  >
> = z.object({
  ...bookFields,
  /** The archive.org item holding the scanned volume. */
  item: z.string().min(1),
  /** How a citation names the volume before its page: GW XIII. */
  citation: z.string().min(1),
  /** A Tesseract model to read the scan anew with, where the archive's text read the type wrong: frk for Fraktur. */
  ocr: z.string().min(1).optional(),
  /** The scan's paper is uneven in tone and its lines askew: each page is straightened and set black on white before it is read anew. */
  binarise: z.boolean().default(false),
  /** The work's printed pages in the volume. */
  firstPage: printedPageSchema,
  lastPage: z.number().int().positive(),
  title: z.string().min(1),
  /** The printed edition the scan reproduces. */
  edition: z.string().min(1),
  /** Pages in the range that are not the author's, such as an editors' note. */
  skipPages: z.array(z.number().int().positive()).default([]),
  /** Sections to leave out by their headings, such as a piece in another language. */
  skipHeadings: z.array(z.string().min(1)).default([]),
  /** The number of the work's first chapter, where it goes on from another. */
  firstChapter: z.number().int().positive().default(1),
  /** Transcriptions of the work, of any edition, to check the OCR against: a text, or a web page per chapter. */
  references: z.array(z.url()).min(1).optional(),
  /** Words the scan shows printed so, which no dictionary knows: names and the period's spellings. The OCR check reads them as right. */
  printedWords: z.array(z.string().min(1)).default([]),
  /** Notes not the author's, such as an editor's or translator's, left out. */
  skipNotes: z.array(pageLineSchema).default([]),
  /**
   * Headings the edition sets in the text's type, which their place on the
   * page does not tell from the text, by the line that opens them: a
   * numbered or lettered one keeps its label, one without opens a chapter
   * numbered by place; a section's numeral the scan lost stands above it.
   */
  headings: z.array(headingLineSchema).default([]),
  /** An editor's signatures (K.): the notes ending in one are left out. */
  skipNotesSigned: z.array(z.string().min(1)).default([]),
  /** The edition sets its notes as large as the text, below a rule the OCR does not read. */
  spacedNotes: z.boolean().default(false),
  /** A volume of newspaper articles, each titled above its dateline: London, 9. Juni 1854. */
  datelined: z.boolean().default(false),
  /** The line the first page opens the work with, after another work's end. */
  opensWith: z.string().min(1).optional(),
});

/** What a coverage note says of the books' source, before it lists them. */
const coverageSchema: z.ZodObject<{
  author: z.ZodString;
  edition: z.ZodString;
  license: z.ZodString;
}> = z.object({
  author: z.string().min(1),
  /** The edition the texts come from, as a sentence names it. */
  edition: z.string().min(1),
  license: z.string().min(1),
});

/** A work of the oeuvre the brain does not hold, and why. */
const gapSchema: z.ZodObject<{
  citation: z.ZodOptional<z.ZodString>;
  pages: z.ZodOptional<z.ZodString>;
  title: z.ZodString;
  year: z.ZodOptional<z.ZodNumber>;
  reason: z.ZodString;
}> = z.object({
  /** The volume the edition prints it in, as cited: GW I; a work it leaves out has none. */
  citation: z.string().min(1).optional(),
  pages: z.string().min(1).optional(),
  title: z.string().min(1),
  year: z.number().int().optional(),
  reason: z.string().min(1),
});

const dtaTeiBookSchema: z.ZodObject<
  Shape<
    BookFields & {
      id: z.ZodString;
      citation: z.ZodString;
      title: z.ZodString;
      edition: z.ZodString;
      skipHeadings: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }
  >
> = z.object({
  ...bookFields,
  /** The Deutsches Textarchiv's id for the text, e.g. marx_manifestws_1848. */
  id: z.string().min(1),
  /** How a citation names the work before its page: Kapital I, 23. */
  citation: z.string().min(1),
  title: z.string().min(1),
  /** The printed edition the transcription follows. */
  edition: z.string().min(1),
  /** Headings of divisions left out, e.g. an editor's preface. */
  skipHeadings: z.array(z.string().min(1)).default([]),
});

const wikisourceBookSchema: z.ZodObject<
  Shape<
    BookFields & {
      page: z.ZodString;
      citation: z.ZodString;
      title: z.ZodString;
      edition: z.ZodString;
      skipHeadings: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }
  >
> = z.object({
  ...bookFields,
  /** The work's page title on de.wikisource.org: Zur Judenfrage. */
  page: z.string().min(1),
  /** How a citation names the work before its page: Judenfrage, 182. */
  citation: z.string().min(1),
  title: z.string().min(1),
  /** The printed edition the transcription follows. */
  edition: z.string().min(1),
  /** Headings of sections left out, e.g. letters written by others. */
  skipHeadings: z.array(z.string().min(1)).default([]),
});

const gutenbergLettersBookSchema: z.ZodObject<
  Shape<
    BookFields & {
      ebook: z.ZodNumber;
      citation: z.ZodString;
      writer: z.ZodObject<{
        signatures: z.ZodArray<z.ZodString>;
        salutations: z.ZodArray<z.ZodString>;
      }>;
      title: z.ZodString;
      edition: z.ZodString;
    }
  >
> = z.object({
  ...bookFields,
  /** The Project Gutenberg ebook's number: 64327. */
  ebook: z.number().int().positive(),
  /** How a citation names the edition before its page: Briefwechsel I, 23. */
  citation: z.string().min(1),
  /** How the author's letters are known among the others. */
  writer: z.object({
    /** Signatures without their closing: K. M. for Dein K. M. */
    signatures: z.array(z.string().min(1)).min(1),
    /** Salutations of the author's letters, for a letter left unsigned. */
    salutations: z.array(z.string().min(1)),
  }),
  title: z.string().min(1),
  /** The printed edition the ebook follows. */
  edition: z.string().min(1),
});

const megaLettersBookSchema: z.ZodObject<
  Shape<
    BookFields & {
      writer: z.ZodString;
      language: z.ZodEnum<{ [K in (typeof LANGUAGES)[number]]: K }>;
      title: z.ZodString;
      edition: z.ZodString;
    }
  >
> = z.object({
  ...bookFields,
  /** The writer as MEGAdigital's headings name them: Karl Marx. */
  writer: z.string().min(1),
  /** The language of the letters the book holds. */
  language: z.enum(LANGUAGES),
  title: z.string().min(1),
  edition: z.string().min(1),
});

const megaEtxBookSchema: z.ZodObject<
  Shape<
    BookFields & {
      citation: z.ZodString;
      parts: z.ZodArray<z.ZodObject<{ file: z.ZodString; text: z.ZodString }>>;
      title: z.ZodString;
      edition: z.ZodString;
      skipHeadings: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }
  >
> = z.object({
  ...bookFields,
  /** How a citation names the volume before its page: MEGA² II/1. */
  citation: z.string().min(1),
  /** The volumes the work runs over, each with the editors' title of it there. */
  parts: z
    .array(z.object({ file: z.string().min(1), text: z.string().min(1) }))
    .min(1),
  title: z.string().min(1),
  /** The printed MEGA volumes the transcription follows. */
  edition: z.string().min(1),
  /** Headings of divisions left out. */
  skipHeadings: z.array(z.string().min(1)).default([]),
});

const SOURCES = [
  "ekgwb",
  "archive-ocr",
  "dta-tei",
  "wikisource",
  "gutenberg-letters",
  "mega-letters",
  "mega-etx",
] as const;

/** A book of the manifest, read from its source. */
const bookSchema: z.ZodDiscriminatedUnion<
  [
    ReturnType<
      typeof ekgwbBookSchema.extend<{ source: z.ZodLiteral<"ekgwb"> }>
    >,
    ReturnType<
      typeof archiveOcrBookSchema.extend<{
        source: z.ZodLiteral<"archive-ocr">;
      }>
    >,
    ReturnType<
      typeof dtaTeiBookSchema.extend<{ source: z.ZodLiteral<"dta-tei"> }>
    >,
    ReturnType<
      typeof wikisourceBookSchema.extend<{
        source: z.ZodLiteral<"wikisource">;
      }>
    >,
    ReturnType<
      typeof gutenbergLettersBookSchema.extend<{
        source: z.ZodLiteral<"gutenberg-letters">;
      }>
    >,
    ReturnType<
      typeof megaLettersBookSchema.extend<{
        source: z.ZodLiteral<"mega-letters">;
      }>
    >,
    ReturnType<
      typeof megaEtxBookSchema.extend<{
        source: z.ZodLiteral<"mega-etx">;
      }>
    >,
  ],
  "source"
> = z.discriminatedUnion("source", [
  ekgwbBookSchema
    .extend({ source: z.literal("ekgwb") })
    .refine(
      (book) => (book.siglum === undefined) !== (book.parts === undefined),
      { message: "A book names either its siglum or its parts" },
    )
    .refine((book) => book.parts === undefined || book.title !== undefined, {
      message: "A book of parts names its title",
    }),
  archiveOcrBookSchema.extend({ source: z.literal("archive-ocr") }),
  dtaTeiBookSchema.extend({ source: z.literal("dta-tei") }),
  wikisourceBookSchema.extend({ source: z.literal("wikisource") }),
  gutenbergLettersBookSchema.extend({ source: z.literal("gutenberg-letters") }),
  megaLettersBookSchema.extend({ source: z.literal("mega-letters") }),
  megaEtxBookSchema.extend({ source: z.literal("mega-etx") }),
]);

export type ManifestBook = z.output<typeof bookSchema>;

const manifestSchema: z.ZodObject<{
  source: z.ZodOptional<z.ZodEnum<{ [K in (typeof SOURCES)[number]]: K }>>;
  coverage: z.ZodOptional<typeof coverageSchema>;
  gaps: z.ZodDefault<z.ZodArray<typeof gapSchema>>;
  books: z.ZodArray<typeof bookSchema>;
}> = z.object({
  /** The source of every book that names none of its own. */
  source: z.enum(SOURCES).optional(),
  coverage: coverageSchema.optional(),
  gaps: z.array(gapSchema).default([]),
  books: z.array(bookSchema).min(1),
});

export type Manifest = z.output<typeof manifestSchema>;

export type ScannedBook = Extract<ManifestBook, { source: "archive-ocr" }>;

/** One book of each scanned volume, in the manifest's order. */
export function firstOfEachVolume(books: ScannedBook[]): ScannedBook[] {
  return books.filter(
    (book, index) =>
      books.findIndex((other) => other.item === book.item) === index,
  );
}

/** The manifest's books read from scanned volumes. */
export function scannedBooks(manifest: Manifest): ScannedBook[] {
  return manifest.books.filter(
    (book): book is ScannedBook => book.source === "archive-ocr",
  );
}

/** A misread line fixed, and what told the right reading. */
const correctionSchema: z.ZodObject<{
  page: z.ZodUnion<[z.ZodNumber, z.ZodString]>;
  from: z.ZodString;
  to: z.ZodString;
  by: z.ZodEnum<{ reference: "reference"; scan: "scan" }>;
}> = z.object({
  page: z.union([z.number().int(), z.string().min(1)]),
  from: z.string().min(1),
  to: z.string(),
  /** A transcription of the work, or the scan read again. */
  by: z.enum(["reference", "scan"]),
});

/** Corrections by scanned volume, kept beside a manifest. */
const correctionsSchema: z.ZodRecord<
  z.ZodString,
  z.ZodArray<typeof correctionSchema>
> = z.record(z.string(), z.array(correctionSchema));

export type Corrections = z.output<typeof correctionsSchema>;

export function parseCorrections(yaml: string): Corrections {
  return correctionsSchema.parse(parseYaml(yaml) ?? {});
}

/** A book names its source, or takes the manifest's. */
const withSources = z.looseObject({
  source: z.string().optional(),
  books: z.array(z.record(z.string(), z.unknown())).default([]),
});

export function parseManifest(yaml: string): Manifest {
  const raw = withSources.parse(parseYaml(yaml));
  return manifestSchema.parse({
    ...raw,
    books: raw.books.map((book) => ({ source: raw.source, ...book })),
  });
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
export function ekgwbReader(fetchText: FetchText): BookReader {
  return {
    read: async (siglum): Promise<BookRead> =>
      parseEkgwbBook(await fetchText(`${EKGWB_BASE}${siglum}/print`), siglum),
  };
}

const ARCHIVE = "https://archive.org";

const archiveMetadataSchema = z.object({
  /** The item's own server and folder, which a mirror may serve broken. */
  server: z.string().optional(),
  dir: z.string().optional(),
  metadata: z
    .object({ imagecount: z.coerce.number().int().positive().optional() })
    .optional(),
  files: z.array(z.object({ name: z.string(), format: z.string() })),
});

type FetchText = (url: string) => Promise<string>;

/** What an import may be given beside the sources. */
export interface ImportOptions {
  /** Corrections to scanned volumes' text, by archive item. */
  corrections?: Corrections;
  /** Reads a scan's page images anew with a model, for works that name one. */
  pageOcr?: (reading: OcrReading) => PageOcr;
  /**
   * Where eKGWB books are read from: eKGWB itself, or a corpus the importer
   * already rendered, so a book's structure can change without a fetch.
   */
  ekgwb?: BookReader;
}

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
  reader: BookReader,
): Promise<LoadedBook> {
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
      source: `${EKGWB_BASE}${parts[0]?.siglum ?? ""}`,
      published: entry.published,
      shortTitle: entry.shortTitle ?? null,
    },
    units,
  };
}

/** A scanned volume's hOCR, the file its item's metadata names. */
export async function fetchVolumeHocr(
  item: string,
  fetchText: FetchText,
): Promise<string> {
  const metadata = archiveMetadataSchema.parse(
    JSON.parse(await fetchText(`${ARCHIVE}/metadata/${item}`)),
  );
  const hocr = metadata.files.find((file) => file.format === "hOCR");
  if (!hocr) throw new Error(`No hOCR file in ${item}`);
  const text = await fetchText(`${ARCHIVE}/download/${item}/${hocr.name}`);
  // An OCR that read Fraktur prints its long s; it reads as roman type then.
  return /ſ/u.test(text) ? frakturRead(text) : text;
}

const DTA = "https://www.deutschestextarchiv.de/book/";

/** A work transcribed by the Deutsches Textarchiv, from its TEI. */
async function loadDtaTeiBook(
  entry: z.output<typeof dtaTeiBookSchema>,
  fetchText: FetchText,
): Promise<LoadedBook> {
  const { units, licence } = parseDtaTei(
    await fetchText(`${DTA}download_xml/${entry.id}`),
    entry,
  );
  // CC BY-SA 2.0 lets an adaptation take a later version of the licence.
  if (!licence?.includes("/by-sa/")) {
    throw new Error(`${entry.id} is not under CC BY-SA: ${licence}`);
  }
  return {
    book: {
      slug: entry.slug,
      title: entry.title,
      author: entry.author,
      year: entry.year,
      kind: entry.kind,
      edition: entry.edition,
      license: "CC-BY-SA-4.0",
      attribution: `Deutsches Textarchiv (deutschestextarchiv.de), ${licence}`,
      source: `${DTA}show/${entry.id}`,
      published: entry.published,
      shortTitle: entry.shortTitle ?? null,
    },
    units,
  };
}

const pageNumbersSchema = z.object({ pages: z.array(z.unknown()) });

/**
 * The leaves a scan serves as page images: as many as its page numbers list,
 * or its scandata puts in the access formats; the image count also counts
 * colour cards and covers that are not served. Null where it has neither.
 */
async function servedLeaves(
  item: string,
  metadata: z.output<typeof archiveMetadataSchema>,
  fetchText: FetchText,
): Promise<number | null> {
  // Read from the item's own server: the mirror a download is sent to may
  // fail on a file it holds.
  const folder =
    metadata.server && metadata.dir
      ? `https://${metadata.server}${metadata.dir}`
      : `${ARCHIVE}/download/${item}`;
  const fileOf = (format: string): Promise<string> | null => {
    const file = metadata.files.find((each) => each.format === format);
    return file
      ? fetchText(`${folder}/${encodeURIComponent(file.name)}`)
      : null;
  };
  const pageNumbers = fileOf("Page Numbers JSON");
  if (pageNumbers) {
    return pageNumbersSchema.parse(JSON.parse(await pageNumbers)).pages.length;
  }
  const scandata = fileOf("Scandata");
  if (!scandata) return null;
  return (
    (await scandata).match(/<addToAccessFormats>true<\/addToAccessFormats>/g)
      ?.length ?? null
  );
}

/**
 * A scanned volume read anew, page image by page image in the scan's order,
 * with the model the work names.
 */
export async function ocrVolumeHocr(
  item: string,
  fetchText: FetchText,
  pageOcr: PageOcr,
): Promise<string> {
  const metadata = archiveMetadataSchema.parse(
    JSON.parse(await fetchText(`${ARCHIVE}/metadata/${item}`)),
  );
  const count =
    (await servedLeaves(item, metadata, fetchText)) ??
    metadata.metadata?.imagecount;
  if (!count) throw new Error(`No image count for ${item}`);
  const pages = await Array.from({ length: count }, (_, leaf) => leaf).reduce<
    Promise<string[]>
  >(
    async (done, leaf) => [
      ...(await done),
      await pageOcr(`${ARCHIVE}/download/${item}/page/n${leaf}_w1600.jpg`),
    ],
    Promise.resolve([]),
  );
  return volumeOfPages(pages);
}

/** A scanned book's volume: the archive's hOCR, or the scan read anew. */
export async function volumeHocr(
  book: ScannedBook,
  fetchText: FetchText,
  pageOcr?: (reading: OcrReading) => PageOcr,
): Promise<string> {
  if (!book.ocr) return fetchVolumeHocr(book.item, fetchText);
  if (!pageOcr) {
    throw new Error(
      `${book.slug} is read with ${book.ocr}, but no OCR is given`,
    );
  }
  return ocrVolumeHocr(
    book.item,
    fetchText,
    pageOcr({ model: book.ocr, binarise: book.binarise }),
  );
}

async function loadArchiveOcrBook(
  entry: ScannedBook,
  fetchText: FetchText,
  options: ImportOptions,
): Promise<LoadedBook> {
  const hocr = await volumeHocr(entry, fetchText, options.pageOcr);
  const units = parseArchiveOcrWork(hocr, {
    ...entry,
    corrections: options.corrections?.[entry.item] ?? [],
  });
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

const WIKISOURCE_API = "https://de.wikisource.org/w/api.php";

const parsedPageSchema = z.object({ parse: z.object({ text: z.string() }) });

async function loadWikisourceBook(
  entry: z.output<typeof wikisourceBookSchema>,
  fetchText: FetchText,
): Promise<LoadedBook> {
  const query = new URLSearchParams({
    action: "parse",
    page: entry.page,
    prop: "text",
    format: "json",
    formatversion: "2",
  });
  const { parse } = parsedPageSchema.parse(
    JSON.parse(await fetchText(`${WIKISOURCE_API}?${query.toString()}`)),
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
      attribution: "Transcription: Wikisource (de.wikisource.org)",
      source: wikisourcePageUrl(entry.page),
      published: entry.published,
      shortTitle: entry.shortTitle ?? null,
    },
    units: parseWikisourcePage(parse.text, entry),
  };
}

const GUTENBERG = "https://www.gutenberg.org/";

async function loadGutenbergLettersBook(
  entry: z.output<typeof gutenbergLettersBookSchema>,
  fetchText: FetchText,
): Promise<LoadedBook> {
  const html = await fetchText(
    `${GUTENBERG}cache/epub/${entry.ebook}/pg${entry.ebook}-images.html`,
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
      // The text is used without Project Gutenberg's license and trademark,
      // as its terms allow for a public-domain work; the ebook is its source.
      attribution: null,
      source: `${GUTENBERG}ebooks/${entry.ebook}`,
      published: entry.published,
      shortTitle: entry.shortTitle ?? null,
    },
    units: parseGutenbergLetters(html, entry),
  };
}

const MEGA = "https://megadigital.bbaw.de/";

async function loadMegaLettersBook(
  entry: z.output<typeof megaLettersBookSchema>,
  fetchText: FetchText,
): Promise<LoadedBook> {
  const listed = parseMegaListing(
    await fetchText(`${MEGA}api/v2/tei-xml.xql`),
  ).filter(({ heading }) => isWritersLetter(heading, entry.writer));
  // One letter after another, as the source asks to be fetched.
  const letters = await listed.reduce<Promise<MegaLetter[]>>(
    async (done, listing) => {
      const read = await done;
      const letter = parseMegaLetter(
        await fetchText(`${MEGA}${listing.id}.xml`),
      );
      if (!letter.licence?.includes("/by-sa/")) {
        throw new Error(
          `${listing.id} is not under CC BY-SA: ${letter.licence}`,
        );
      }
      return [...read, { ...listing, letter }];
    },
    Promise.resolve([]),
  );
  return {
    book: {
      slug: entry.slug,
      title: entry.title,
      author: entry.author,
      year: entry.year,
      kind: entry.kind,
      edition: entry.edition,
      license: "CC-BY-SA-4.0",
      attribution:
        "MEGAdigital, Berlin-Brandenburgische Akademie der Wissenschaften (megadigital.bbaw.de), CC BY-SA 4.0",
      source: `${MEGA}briefe/index.xql`,
      published: entry.published,
      shortTitle: entry.shortTitle ?? null,
    },
    units: megaLetterUnits(
      letters.filter(({ letter }) => letter.language === entry.language),
      entry.writer,
    ),
  };
}

async function loadMegaEtxBook(
  entry: z.output<typeof megaEtxBookSchema>,
  fetchText: FetchText,
): Promise<LoadedBook> {
  // One volume after another, as the source asks to be fetched.
  const parts = await entry.parts.reduce<
    Promise<Array<{ file: string; text: string; xml: string }>>
  >(
    async (done, part) => [
      ...(await done),
      { ...part, xml: await fetchText(`${MEGA_DOCS}${part.file}`) },
    ],
    Promise.resolve([]),
  );
  return {
    book: {
      slug: entry.slug,
      title: entry.title,
      author: entry.author,
      year: entry.year,
      kind: entry.kind,
      edition: entry.edition,
      // Marx's text is in the public domain, and the edition's right in it
      // (§ 70 UrhG) ran out 25 years after the volume appeared.
      license: "public-domain",
      attribution:
        "Transcription: MEGAdigital, Berlin-Brandenburgische Akademie der Wissenschaften (telota.bbaw.de/mega)",
      source: `${MEGA_DOCS}${entry.parts[0]?.file ?? ""}`,
      published: entry.published,
      shortTitle: entry.shortTitle ?? null,
    },
    units: parseMegaEtx(parts, entry),
  };
}

function loadersOf(
  manifest: Manifest,
  fetchText: FetchText,
  options: ImportOptions,
): Array<() => Promise<LoadedBook>> {
  return manifest.books.map((entry) => () => {
    switch (entry.source) {
      case "ekgwb":
        return loadEkgwbBook(entry, options.ekgwb ?? ekgwbReader(fetchText));
      case "archive-ocr":
        return loadArchiveOcrBook(entry, fetchText, options);
      case "dta-tei":
        return loadDtaTeiBook(entry, fetchText);
      case "wikisource":
        return loadWikisourceBook(entry, fetchText);
      case "gutenberg-letters":
        return loadGutenbergLettersBook(entry, fetchText);
      case "mega-letters":
        return loadMegaLettersBook(entry, fetchText);
      case "mega-etx":
        return loadMegaEtxBook(entry, fetchText);
    }
  });
}

/** Import the manifest's books one after another into brain-data. */
export async function importBooks(
  manifest: Manifest,
  brainData: string,
  fetchText: FetchText,
  options: ImportOptions = {},
): Promise<ImportResult[]> {
  return loadersOf(manifest, fetchText, options).reduce<
    Promise<ImportResult[]>
  >(async (done, load) => {
    const results = await done;
    const { book, units } = await load();
    if (units.length === 0) {
      throw new Error(`No sections found for ${book.slug}`);
    }
    const files = renderBook({ book, units });
    await writeBook(brainData, book.slug, files);
    return [...results, { slug: book.slug, entries: files.length }];
  }, Promise.resolve([]));
}
