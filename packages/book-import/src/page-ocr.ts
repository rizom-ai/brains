import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importerCacheDir, type PoliteFetch } from "./polite-fetch";

/** A scanned page read anew: its hOCR. */
export type PageOcr = (imageUrl: string) => Promise<string>;

export interface PageOcrOptions {
  /** Each page's recognised text is kept here and never recognised again. */
  cacheDir: string;
  /** The recognition model: Tesseract's frk for Fraktur. */
  model: string;
  /** How the image is prepared before recognition, as named in the cache. */
  prepare?: string;
  /** How a page's named parts are cut, as named in the cache: a page cut to its parts is read anew when they are cut otherwise. */
  cut?: string;
  fetchImage: (url: string) => Promise<Uint8Array>;
  recognise: (image: Uint8Array, model: string) => Promise<string>;
}

async function readCached(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    // A missing cache entry means the page has not been recognised yet.
    return null;
  }
}

/** A page address that names the parts of its image to read. */
const REGION_NAMED = /[#&]region=/u;

/**
 * Read scanned pages with a recognition model of our choosing, where the
 * archive's own text read the type with the wrong one; each page is fetched
 * and recognised once per model.
 */
export function createPageOcr(options: PageOcrOptions): PageOcr {
  return async (imageUrl) => {
    const cut = REGION_NAMED.test(imageUrl) ? `\n${options.cut ?? ""}` : "";
    const key = createHash("sha256")
      .update(`${options.model}\n${options.prepare ?? ""}\n${imageUrl}${cut}`)
      .digest("hex");
    const path = join(options.cacheDir, `ocr-${key}.html`);
    const cached = await readCached(path);
    if (cached !== null) return cached;
    const hocr = await options.recognise(
      await options.fetchImage(imageUrl),
      options.model,
    );
    await mkdir(options.cacheDir, { recursive: true });
    await writeFile(path, hocr);
    return hocr;
  };
}

/**
 * Models Tesseract does not bring, by where they are published: frak2021,
 * UB Mannheim's Fraktur model trained on historical prints (Apache-2.0),
 * and grc_agocr, Nick White's Ancient Greek model trained on the
 * nineteenth century's Greek types (ancientgreekocr.org, Apache-2.0), which
 * reads their curled kappa and theta that Tesseract's own grc reads as chi
 * and upsilon.
 */
const MODELS: Record<string, string> = {
  frak2021:
    "https://ub-backup.bib.uni-mannheim.de/~stweil/tesstrain/frak2021/tessdata_best/frak2021-0.905.traineddata",
  grc_agocr: "https://ancientgreekocr.org/2.0/grc.traineddata",
};

/** The model a print's Greek is read with. */
export const GREEK_MODEL = "grc_agocr";

async function exists(path: string): Promise<boolean> {
  return Bun.file(path).exists();
}

/**
 * The folder holding a model Tesseract does not bring, fetched into the
 * cache once; null for a model of Tesseract's own.
 */
export async function tessdataFor(
  model: string,
  cacheDir: string,
  fetchModel: (url: string) => Promise<Uint8Array>,
): Promise<string | null> {
  const url = MODELS[model];
  if (!url) return null;
  const dir = join(cacheDir, "tessdata");
  const path = join(dir, `${model}.traineddata`);
  if (!(await exists(path))) {
    await mkdir(dir, { recursive: true });
    await writeFile(path, await fetchModel(url));
  }
  return dir;
}

/** How a volume's pages are read: the model, and whether its paper is uneven. */
export interface OcrReading {
  model: string;
  /** The paper is uneven in tone and the lines askew, as on a yellowed scan. */
  binarise: boolean;
}

/**
 * How a page image is prepared for recognition: in grey, at twice its size,
 * which keeps the scan's small Fraktur letters apart. A page of uneven paper
 * is straightened first, and each part set black or white against its own
 * surroundings.
 */
export function preparationFor({
  binarise,
}: Pick<OcrReading, "binarise">): string[] {
  return binarise
    ? [
        "-colorspace",
        "Gray",
        "-deskew",
        "40%",
        "-resize",
        "200%",
        "-lat",
        "60x60-6%",
      ]
    : ["-colorspace", "Gray", "-resize", "200%"];
}

/** A page image prepared for recognition with ImageMagick, which must be on the path. */
export async function preparedImage(
  image: Uint8Array,
  preparation: string[],
): Promise<Uint8Array> {
  const child = Bun.spawn(["magick", "-", ...preparation, "png:-"], {
    stdin: image,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [prepared, errors, code] = await Promise.all([
    new Response(child.stdout).arrayBuffer(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(`magick failed (${code}): ${errors}`);
  return new Uint8Array(prepared);
}

/** The part of a page a scan reads: left, top, width and height, as shares of the page. */
export type Region = [number, number, number, number];

/** A PDF's page as an image. */
export type RenderPdfPage = (
  pdf: Uint8Array,
  page: number,
) => Promise<Uint8Array>;

/** The parts of an image a scan reads, one below the other. */
export type CropImage = (
  image: Uint8Array,
  regions: Region[],
) => Promise<Uint8Array>;

/**
 * A scan's page as addressed: an image, or a PDF's page named as PDF viewers
 * open one, either with the parts of it to read after it, one below the
 * other: file.pdf#page=5&region=0.37,0.1,0.27,0.3,
 * page.jpg#region=0.5,0,0.5,1, page.jpg#region=0,0.6,0.5,0.4&region=0.5,0.6,0.5,0.4.
 */
const SCAN_PAGE =
  /^(.*?)(?:#page=(\d+))?((?:[#&]region=[\d.]+,[\d.]+,[\d.]+,[\d.]+)*)$/u;
const REGION = /region=([\d.]+),([\d.]+),([\d.]+),([\d.]+)/gu;

/**
 * A scan's page images: an image as fetched, or a PDF's page rendered, each
 * cut to the parts the scan reads, such as one of a newspaper's columns, or
 * an article's two columns set one below the other as its printed page;
 * each PDF is fetched once.
 */
export function scanImages(
  fetchBytes: (url: string) => Promise<Uint8Array>,
  renderPdfPage: RenderPdfPage,
  cropImage: CropImage,
): (url: string) => Promise<Uint8Array> {
  const pdfs = new Map<string, Promise<Uint8Array>>();
  return async (url) => {
    const [, address = url, page, parts = ""] = SCAN_PAGE.exec(url) ?? [];
    const regions = [...parts.matchAll(REGION)].map(
      ([, left, top, across, down]): Region => [
        Number(left),
        Number(top),
        Number(across),
        Number(down),
      ],
    );
    const pdf =
      page === undefined ? null : (pdfs.get(address) ?? fetchBytes(address));
    if (pdf !== null) pdfs.set(address, pdf);
    const image =
      pdf === null
        ? await fetchBytes(address)
        : await renderPdfPage(await pdf, Number(page));
    return regions.length > 0 ? cropImage(image, regions) : image;
  };
}

async function run(command: string[], stdin?: Uint8Array): Promise<Uint8Array> {
  const child = Bun.spawn(command, {
    ...(stdin ? { stdin } : {}),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, errors, code] = await Promise.all([
    new Response(child.stdout).arrayBuffer(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(`${command[0]} failed (${code}): ${errors}`);
  return new Uint8Array(out);
}

/** A PDF's page at 300 dpi with poppler's pdftoppm, which must be on the path. */
export const renderPdfPage: RenderPdfPage = async (pdf, page) => {
  const dir = await mkdtemp(join(tmpdir(), "book-import-pdf-"));
  try {
    const file = join(dir, "scan.pdf");
    await writeFile(file, pdf);
    return await run([
      "pdftoppm",
      "-f",
      String(page),
      "-l",
      String(page),
      "-r",
      "300",
      "-png",
      file,
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

/**
 * White margin set around each part of an image, in pixels: no letter cut
 * close touches the image's edge, where the reader takes a lone glyph for the
 * scan's shadow, and parts read one below the other stand apart.
 */
const PART_MARGIN = 40;

/**
 * Parts of an image, cut with ImageMagick, which must be on the path, each
 * on a white margin and set one below the other, flush left.
 */
export const cropImage: CropImage = async (image, regions) => {
  const size = new TextDecoder().decode(
    await run(["magick", "identify", "-format", "%w %h", "-"], image),
  );
  const [width = 0, height = 0] = size.split(" ").map(Number);
  const parts = regions.flatMap(([left, top, across, down]) => [
    "(",
    "-clone",
    "0",
    "-crop",
    `${Math.round(across * width)}x${Math.round(down * height)}+${Math.round(left * width)}+${Math.round(top * height)}`,
    "+repage",
    "-bordercolor",
    "white",
    "-border",
    String(PART_MARGIN),
    ")",
  ]);
  return run(
    [
      "magick",
      "-",
      ...parts,
      "-delete",
      "0",
      "-background",
      "white",
      "-gravity",
      "west",
      "-append",
      "png:-",
    ],
    image,
  );
};

/** The importer's page OCR: Tesseract, images fetched in the importer's queue. */
export function importerPageOcr(
  fetch: PoliteFetch,
): (reading: OcrReading) => PageOcr {
  const cacheDir = importerCacheDir();
  return (reading) => {
    const preparation = preparationFor(reading);
    return createPageOcr({
      cacheDir,
      model: reading.model,
      prepare: preparation.join(" "),
      cut: `margin ${PART_MARGIN}`,
      fetchImage: scanImages(fetch.bytes, renderPdfPage, cropImage),
      recognise: async (image, used) =>
        tesseractHocr(
          await preparedImage(image, preparation),
          used,
          await tessdataFor(used, cacheDir, fetch.bytes),
        ),
    });
  };
}

/** Recognise a page image with Tesseract, which must be on the path. */
export async function tesseractHocr(
  image: Uint8Array,
  model: string,
  tessdata: string | null = null,
): Promise<string> {
  const child = Bun.spawn(
    [
      "tesseract",
      "stdin",
      "stdout",
      ...(tessdata ? ["--tessdata-dir", tessdata] : []),
      "-l",
      model,
      // Asked for by setting, not by config file, which a model's own
      // folder lacks.
      "-c",
      "tessedit_create_hocr=1",
    ],
    {
      stdin: image,
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [hocr, errors, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(`tesseract failed (${code}): ${errors}`);
  if (!hocr.includes("ocr_page")) {
    throw new Error(`tesseract gave no hOCR with ${model}: ${errors}`);
  }
  return hocr;
}

/**
 * The words frak2021 reads with a capital umlaut's dots lost, by their
 * opening, as Marx's volumes print them: Ökonomie, Äquivalent, Über-. A word
 * spelled without the umlaut (Arzt, Außer, Andern, Apfel) is not among them.
 */
const DOTLESS =
  /(?<![\p{L}])(?:Okonom|Aquivalen|Anderung|Andert|Arzten?(?!\p{L})|Außerung|Außerst|Außerlich|Amter|Uber(?=\p{Ll}|(?!\p{L}))|Ubel|Osterreich|Angstlich|Ahnlich|Offent|Offnung|Agypt|Ortlich|Armste|Apfeln(?!\p{L}))/gu;
const UMLAUT: Record<string, string> = { A: "Ä", O: "Ö", U: "Ü" };
/** A capital Ö the model reads as S, where no German word opens so. */
const O_AS_S = /(?<![\p{L}])S(?=sterreich|konom)/gu;
/**
 * A noun the model opens with a small umlaut, read by the ending only a noun
 * has: überproduktion, äußerungen.
 */
const SMALL_NOUN =
  /(?<![\p{L}-])[äöü](?=\p{Ll}*(?:ung|heit|keit|schaft|tion)(?:en|s)?(?![\p{L}]))/gu;

/**
 * A volume's pages as one hOCR document, each page numbered by its leaf, the
 * order the scan holds them in, and by its printed number where the scan
 * states it; Fraktur's long s read as s, its hyphen as one, and its capital
 * umlauts with their dots.
 */
export function volumeOfPages(
  pages: string[],
  numbers: Array<number | undefined> = [],
  read: (hocr: string) => string = frakturRead,
): string {
  const bodies = pages.map((page, leaf) => {
    const number = numbers[leaf];
    return read(
      (/<body>([\s\S]*)<\/body>/.exec(page)?.[1] ?? "").replace(
        /<div class='ocr_page' id='page_\d+'([^>]*)>/,
        number === undefined
          ? `<div class='ocr_page' id='page_${leaf}'$1>`
          : `<div class='ocr_page' id='page_${leaf}'$1><span class='ocr_pageno'>${number}</span>`,
      ),
    );
  });
  return `<html><body>\n${bodies.join("\n")}\n</body></html>\n`;
}

/**
 * A Fraktur OCR's hOCR as roman type sets it: its long s as s, its etc.
 * and hyphens as such, and its capital umlauts with their dots.
 */
export function frakturRead(hocr: string): string {
  return hyphenRead(
    hocr
      .replace(/ſ/g, "s")
      // Fraktur's etc., ꝛc., the model reads now and then as ꝛe. or ꝛ2c.
      .replace(/ꝛ[ce2]+\./g, "etc.")
      .replace(O_AS_S, "Ö")
      .replace(SMALL_NOUN, (letter) => letter.toUpperCase())
      .replace(
        DOTLESS,
        (word) => `${UMLAUT[word.charAt(0)] ?? word.charAt(0)}${word.slice(1)}`,
      ),
  );
}

/**
 * A German reading's hyphens as such: the models print a word's hyphen as a
 * dash, a double hyphen or an equals sign, at times two of them, where a
 * German print sets its dashes apart from the words.
 */
export function hyphenRead(hocr: string): string {
  return (
    hocr
      .replace(/(\p{L})[—⸗=-]+(?=<\/span>)/gu, "$1-")
      // A double hyphen is a hyphen wherever it stands: inside a word, and
      // ending one before a comma (Wechsel⸗, Aktien⸗ und Schiffshändler).
      .replace(/(\p{L})(?:⸗-?|-⸗)(?=\p{L}|[,;])/gu, "$1-")
  );
}

/** A word of a Tesseract hOCR page: where it stands, how sure, what it reads. */
interface ReadWord {
  box: [number, number, number, number];
  confidence: number;
  text: string;
}

const HOCR_WORD =
  /(<span class='ocrx_word'[^>]*title='bbox (\d+) (\d+) (\d+) (\d+); x_wconf (\d+)'[^>]*>)(.*?)(<\/span>)/gsu;

function readWords(hocr: string): ReadWord[] {
  return [...hocr.matchAll(HOCR_WORD)].map((match) => ({
    box: [
      Number(match[2]),
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
    ],
    confidence: Number(match[6]),
    text: match[7] ?? "",
  }));
}

function boxArea([left, top, right, bottom]: ReadWord["box"]): number {
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

/** Two words read as one where their boxes share a good part of the smaller. */
function sameWord(a: ReadWord["box"], b: ReadWord["box"]): boolean {
  const shared = boxArea([
    Math.max(a[0], b[0]),
    Math.max(a[1], b[1]),
    Math.min(a[2], b[2]),
    Math.min(a[3], b[3]),
  ]);
  return shared > 0.4 * Math.min(boxArea(a), boxArea(b));
}

/** Of a reading's letters, the share in Greek script. */
function greekShare(text: string): number {
  const letters = [...text].filter((char) => /\p{L}/u.test(char));
  const greek = letters.filter((char) => /\p{Script=Greek}/u.test(char));
  return greek.length / Math.max(1, letters.length);
}

/**
 * Greek letters a roman print sets alike: a reading made of these alone,
 * such as a heading's numeral read as Ι. or ΧΧΙΙΙ, is no sign of Greek.
 */
const LOOKALIKE = new Set([..."ΑΒΕΖΗΙΚΜΝΟΡΤΥΧο"]);

/** A reading holding a letter only Greek prints. */
function readsGreek(text: string): boolean {
  return [...text].some(
    (char) => /\p{Script=Greek}/u.test(char) && !LOOKALIKE.has(char),
  );
}

/** How sure the Greek model must be of a word before its reading is taken. */
const GREEK_CONFIDENCE = 40;

/**
 * A page read with its language's model, each word the Greek model reads as
 * Greek, and surer, taking the Greek reading: a print that quotes Greek in
 * German or Latin text is read by neither model alone, and each misreads the
 * other's script. Both readings are of the same prepared image, so a word
 * stands in the same place in both.
 */
export function withGreekReadings(hocr: string, greekHocr: string): string {
  const greek = readWords(greekHocr);
  // A Greek word the page's model read as two takes the place of the first;
  // the second, read already, is left empty.
  const taken = new Set<ReadWord>();
  return hocr.replace(
    HOCR_WORD,
    (
      whole,
      open: string,
      left,
      top,
      right,
      bottom,
      confidence,
      text: string,
      close,
    ) => {
      const box: ReadWord["box"] = [
        Number(left),
        Number(top),
        Number(right),
        Number(bottom),
      ];
      const read = greek.filter((word) => sameWord(word.box, box));
      // A section sign is the page's own: no Greek word holds one.
      if (read.length === 0 || text.includes("§")) return whole;
      const surest = Math.min(...read.map((word) => word.confidence));
      const reading = read.map((word) => word.text).join(" ");
      // A reading with figures in it is no Greek word: the model's guess at
      // letters of another script.
      const isGreek =
        greekShare(reading) >= 0.8 &&
        !/\d/u.test(reading) &&
        readsGreek(reading) &&
        surest >= GREEK_CONFIDENCE &&
        surest > Number(confidence);
      if (!isGreek) return whole;
      const fresh = read.filter((word) => !taken.has(word));
      read.forEach((word) => taken.add(word));
      return `${open}${fresh.map((word) => word.text).join(" ")}${close}`;
    },
  );
}
