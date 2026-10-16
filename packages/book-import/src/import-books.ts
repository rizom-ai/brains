import { parse as parseYaml } from "yaml";
import { bookKindSchema } from "@brains/book";
import { z } from "@brains/utils/zod";
import { EKGWB_BASE, parseEkgwbBook } from "./adapters/ekgwb";
import { parseArchiveOcrWork } from "./adapters/archive-ocr";
import { parseDtaTei } from "./adapters/dta-tei";
import { MEGA_DOCS, parseMegaEtx } from "./adapters/mega-etx";
import {
  DEFAULT_SITE,
  parseWikisourcePages,
  wikisourcePageUrl,
  type WikisourcePage,
} from "./adapters/wikisource";
import { parseMlwerkePages } from "./adapters/mlwerke";
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
  title: z.ZodOptional<z.ZodString>;
}> = z.object({
  siglum: z.string().min(1),
  /**
   * The part's title as its title page names it: "Erster Theil". A part the
   * manifest leaves untitled takes its page's title, as a notebook does.
   */
  title: z.string().min(1).optional(),
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

/** A note's line by the words it opens with: one that opens a note, or runs on the note of the page before. */
const noteLineSchema: z.ZodObject<{
  page: typeof printedPageSchema;
  opens: z.ZodString;
  runsOn: z.ZodOptional<z.ZodBoolean>;
}> = z.object({
  page: printedPageSchema,
  opens: z.string().min(1),
  runsOn: z.boolean().optional(),
});

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
      lastPage: z.ZodUnion<[z.ZodNumber, z.ZodString]>;
      title: z.ZodString;
      edition: z.ZodString;
      skipPages: z.ZodDefault<z.ZodArray<z.ZodNumber>>;
      skipHeadings: z.ZodDefault<z.ZodArray<z.ZodString>>;
      firstChapter: z.ZodDefault<z.ZodNumber>;
      references: z.ZodOptional<z.ZodArray<z.ZodURL>>;
      printedWords: z.ZodDefault<z.ZodArray<z.ZodString>>;
      skipNotes: z.ZodDefault<z.ZodArray<typeof pageLineSchema>>;
      headings: z.ZodDefault<z.ZodArray<typeof headingLineSchema>>;
      paragraphs: z.ZodDefault<z.ZodArray<typeof pageLineSchema>>;
      notes: z.ZodDefault<z.ZodArray<typeof noteLineSchema>>;
      skipNotesSigned: z.ZodDefault<z.ZodArray<z.ZodString>>;
      spacedNotes: z.ZodDefault<z.ZodBoolean>;
      curved: z.ZodDefault<z.ZodBoolean>;
      marginalia: z.ZodDefault<z.ZodBoolean>;
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
  lastPage: printedPageSchema,
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
  /** Pages the OCR read too askew to tell paragraphs by their indent: on each, the lines that open one, by their opening words; no other line there opens one. */
  paragraphs: z.array(pageLineSchema).default([]),
  /** Pages whose notes the OCR set as the text, too close below it to tell: on each, the lines that open a note, by their opening words; no other line there opens one, but one named as running on the note of the page before. */
  notes: z.array(noteLineSchema).default([]),
  /** An editor's signatures (K.): the notes ending in one are left out. */
  skipNotesSigned: z.array(z.string().min(1)).default([]),
  /** The edition sets its notes as large as the text, below a rule the OCR does not read. */
  spacedNotes: z.boolean().default(false),
  /** The scan's lines curve, so their starts tell no indent: a paragraph opens only below a sentence's end. */
  curved: z.boolean().default(false),
  /** The edition glosses its paragraphs in the margin: the glosses are left out of the text. */
  marginalia: z.boolean().default(false),
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
      site: z.ZodDefault<z.ZodString>;
      pages: z.ZodOptional<z.ZodArray<z.ZodString>>;
      from: z.ZodOptional<z.ZodString>;
      until: z.ZodOptional<z.ZodString>;
      textHeadings: z.ZodDefault<z.ZodArray<z.ZodString>>;
      omitHeadings: z.ZodDefault<z.ZodArray<z.ZodString>>;
      nested: z.ZodDefault<z.ZodBoolean>;
      printedNotes: z.ZodDefault<z.ZodBoolean>;
      skipNotes: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }
  >
> = z.object({
  ...bookFields,
  /** The work's page title on its Wikisource: Zur Judenfrage. */
  page: z.string().min(1),
  /** The Wikisource the work is on. */
  site: z.string().min(1).default(DEFAULT_SITE),
  /** The pages the work is set out over, in order, where it is not on its own page. */
  pages: z.array(z.string().min(1)).min(1).optional(),
  /** The heading the work opens with, where the page holds an edition's front matter before it. */
  from: z.string().min(1).optional(),
  /** The heading after the work, where the page goes on with others. */
  until: z.string().min(1).optional(),
  /** Centred lines that are the text's own, such as a motto, not headings. */
  textHeadings: z.array(z.string().min(1)).default([]),
  /** Centred lines an editor set, neither heading nor text: left out. */
  omitHeadings: z.array(z.string().min(1)).default([]),
  /** The page's heading tags, h2 to h6, nest as the work's parts do. */
  nested: z.boolean().default(false),
  /** The page's references are the printed book's notes, not Wikisource's own. */
  printedNotes: z.boolean().default(false),
  /** Openings of printed notes left out: an editor's, not the author's. */
  skipNotes: z.array(z.string().min(1)).default([]),
  /** How a citation names the work before its page: Judenfrage, 182. */
  citation: z.string().min(1),
  title: z.string().min(1),
  /** The printed edition the transcription follows. */
  edition: z.string().min(1),
  /** Headings of sections left out, e.g. letters written by others. */
  skipHeadings: z.array(z.string().min(1)).default([]),
});

const mlwerkeBookSchema: z.ZodObject<
  Shape<
    BookFields & {
      pages: z.ZodArray<z.ZodURL>;
      citation: z.ZodString;
      title: z.ZodString;
      edition: z.ZodString;
      fixes: z.ZodDefault<
        z.ZodArray<
          z.ZodObject<{ page: z.ZodString; from: z.ZodString; to: z.ZodString }>
        >
      >;
      headings: z.ZodDefault<
        z.ZodArray<
          z.ZodObject<{
            level: z.ZodNumber;
            title: z.ZodString;
            match: z.ZodOptional<z.ZodArray<z.ZodString>>;
          }>
        >
      >;
      articles: z.ZodDefault<z.ZodBoolean>;
      skipHeadings: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }
  >
> = z.object({
  ...bookFields,
  /** Each page is an article of a volume, titled by the page's first-level heading. */
  articles: z.boolean().default(false),
  /** The work's pages on mlwerke.de, in reading order, as the Internet Archive keeps them. */
  pages: z.array(z.url()).min(1),
  /** How a citation names the work before its MEW page: Manuskripte 1844, 471. */
  citation: z.string().min(1),
  title: z.string().min(1),
  /** The MEW volume the transcription follows. */
  edition: z.string().min(1),
  /** The transcription's slips, each fixed on its MEW page. */
  fixes: z
    .array(
      z.object({
        page: z.string().min(1),
        from: z.string().min(1),
        to: z.string(),
      }),
    )
    .default([]),
  /** The work's headings in order, where its pages set them as centred lines among others. */
  headings: z
    .array(
      z.object({
        level: z.number().int().min(1),
        title: z.string().min(1),
        match: z.array(z.string().min(1)).optional(),
      }),
    )
    .default([]),
  /** Sections to leave out by their headings, with what stands under them: another author's article. */
  skipHeadings: z.array(z.string().min(1)).default([]),
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

/** A work transcribed by Project Gutenberg, read from the ebook's HTML as a Wikisource page is. */
const gutenbergBookSchema: z.ZodObject<
  Shape<
    BookFields & {
      ebook: z.ZodNumber;
      citation: z.ZodString;
      title: z.ZodString;
      edition: z.ZodString;
      skipHeadings: z.ZodDefault<z.ZodArray<z.ZodString>>;
      from: z.ZodOptional<z.ZodString>;
      until: z.ZodOptional<z.ZodString>;
      textHeadings: z.ZodDefault<z.ZodArray<z.ZodString>>;
      omitHeadings: z.ZodDefault<z.ZodArray<z.ZodString>>;
      printedNotes: z.ZodDefault<z.ZodBoolean>;
      skipNotes: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }
  >
> = z.object({
  ...bookFields,
  /** The ebook's number at Project Gutenberg: 32370. */
  ebook: z.number().int().positive(),
  /** How a citation names the work before its page: Diplomatic History, 7. */
  citation: z.string().min(1),
  title: z.string().min(1),
  /** The printed edition the transcription follows. */
  edition: z.string().min(1),
  /** Headings of sections left out. */
  skipHeadings: z.array(z.string().min(1)).default([]),
  /** The heading the work opens with, after the edition's front matter. */
  from: z.string().min(1).optional(),
  /** The heading after the work. */
  until: z.string().min(1).optional(),
  /** Centred lines that are the text's own, not headings. */
  textHeadings: z.array(z.string().min(1)).default([]),
  /** Centred lines an editor set, neither heading nor text: left out. */
  omitHeadings: z.array(z.string().min(1)).default([]),
  /** The ebook's footnotes are the printed book's. */
  printedNotes: z.boolean().default(false),
  /** Openings of notes left out: an editor's, not the author's. */
  skipNotes: z.array(z.string().min(1)).default([]),
});

const SOURCES = [
  "ekgwb",
  "archive-ocr",
  "dta-tei",
  "wikisource",
  "gutenberg",
  "mega-etx",
  "mlwerke",
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
      typeof gutenbergBookSchema.extend<{
        source: z.ZodLiteral<"gutenberg">;
      }>
    >,
    ReturnType<
      typeof megaEtxBookSchema.extend<{
        source: z.ZodLiteral<"mega-etx">;
      }>
    >,
    ReturnType<
      typeof mlwerkeBookSchema.extend<{
        source: z.ZodLiteral<"mlwerke">;
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
  gutenbergBookSchema.extend({ source: z.literal("gutenberg") }),
  megaEtxBookSchema.extend({ source: z.literal("mega-etx") }),
  mlwerkeBookSchema.extend({ source: z.literal("mlwerke") }),
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
      books.findIndex((other) => volumeKey(other) === volumeKey(book)) ===
      index,
  );
}

/** A volume as read: its scan, and the model it is read anew with, if any. */
export function volumeKey(book: ScannedBook): string {
  return [book.item, book.ocr ?? "", book.binarise ? "binarised" : ""].join(
    "|",
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
  const parts = entry.parts ?? [{ siglum: entry.siglum ?? "" }];
  const read = await parts.reduce<Promise<BookRead[]>>(
    async (previous, part) => {
      const book = await reader.read(part.siglum);
      if (book.units.length === 0) {
        throw new Error(`No sections found for ${part.siglum}`);
      }
      const partTitle =
        entry.parts === undefined ? null : (part.title ?? book.title);
      if (partTitle === "") {
        throw new Error(`No title found for ${part.siglum}`);
      }
      // A part's title encloses everything read from its siglum.
      const units = book.units.map((unit) => ({
        ...unit,
        parents:
          partTitle === null ? unit.parents : [partTitle, ...unit.parents],
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

const parsedPageSchema = z.object({ parse: z.object({ text: z.string() }) });

async function loadWikisourceBook(
  entry: z.output<typeof wikisourceBookSchema>,
  fetchText: FetchText,
): Promise<LoadedBook> {
  // One page after another, as the source asks to be read.
  const pages = await (entry.pages ?? [entry.page]).reduce<
    Promise<WikisourcePage[]>
  >(async (done, page) => {
    const read = await done;
    const query = new URLSearchParams({
      action: "parse",
      page,
      prop: "text",
      format: "json",
      formatversion: "2",
    });
    const { parse } = parsedPageSchema.parse(
      JSON.parse(
        await fetchText(`https://${entry.site}/w/api.php?${query.toString()}`),
      ),
    );
    return [...read, { page, html: parse.text }];
  }, Promise.resolve([]));
  return {
    book: {
      slug: entry.slug,
      title: entry.title,
      author: entry.author,
      year: entry.year,
      kind: entry.kind,
      edition: entry.edition,
      license: "public-domain",
      attribution: `Transcription: Wikisource (${entry.site})`,
      source: wikisourcePageUrl(entry.page, entry.site),
      published: entry.published,
      shortTitle: entry.shortTitle ?? null,
    },
    units: parseWikisourcePages(pages, entry),
  };
}

/** A Project Gutenberg ebook, its HTML read as a transcription with its printed pages. */
async function loadGutenbergBook(
  entry: z.output<typeof gutenbergBookSchema>,
  fetchText: FetchText,
): Promise<LoadedBook> {
  const id = String(entry.ebook);
  const source = `https://www.gutenberg.org/ebooks/${id}`;
  const html = await fetchText(
    `https://www.gutenberg.org/cache/epub/${id}/pg${id}-images.html`,
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
      attribution: `Transcription: Project Gutenberg (ebook ${id})`,
      source,
      published: entry.published,
      shortTitle: entry.shortTitle ?? null,
    },
    units: parseWikisourcePages([{ page: id, html, url: source }], {
      ...entry,
      page: id,
      site: "www.gutenberg.org",
    }),
  };
}

async function loadMlwerkeBook(
  entry: z.output<typeof mlwerkeBookSchema>,
  fetchText: FetchText,
): Promise<LoadedBook> {
  // One page after another, as the source asks to be read.
  const pages = await entry.pages.reduce<
    Promise<Array<{ url: string; html: string }>>
  >(
    async (read, url) => [...(await read), { url, html: await fetchText(url) }],
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
      license: "public-domain",
      attribution:
        "Transcription: Marxists Internet Archive, as published on mlwerke.de; read from the Internet Archive's Wayback Machine",
      source: entry.pages[0] ?? "",
      published: entry.published,
      shortTitle: entry.shortTitle ?? null,
    },
    units: parseMlwerkePages(pages, entry),
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
      case "gutenberg":
        return loadGutenbergBook(entry, fetchText);
      case "mega-etx":
        return loadMegaEtxBook(entry, fetchText);
      case "mlwerke":
        return loadMlwerkeBook(entry, fetchText);
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
