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

/**
 * Read scanned pages with a recognition model of our choosing, where the
 * archive's own text read the type with the wrong one; each page is fetched
 * and recognised once per model.
 */
export function createPageOcr(options: PageOcrOptions): PageOcr {
  return async (imageUrl) => {
    const key = createHash("sha256")
      .update(`${options.model}\n${options.prepare ?? ""}\n${imageUrl}`)
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
 * UB Mannheim's Fraktur model trained on historical prints (Apache-2.0).
 */
const MODELS: Record<string, string> = {
  frak2021:
    "https://ub-backup.bib.uni-mannheim.de/~stweil/tesstrain/frak2021/tessdata_best/frak2021-0.905.traineddata",
};

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

/** A PDF's page as an image, and the part of it the scan reads. */
export type RenderPdfPage = (
  pdf: Uint8Array,
  page: number,
  region?: Region,
) => Promise<Uint8Array>;

/** A PDF page named as PDF viewers open one, its part after it: file.pdf#page=5&region=0.37,0.1,0.27,0.3. */
const PDF_PAGE =
  /^(.*\.pdf)#page=(\d+)(?:&region=([\d.]+),([\d.]+),([\d.]+),([\d.]+))?$/iu;

/**
 * A scan's page images: an image as fetched, or a PDF's page rendered and
 * cut to the part the scan reads, each PDF fetched once.
 */
export function scanImages(
  fetchBytes: (url: string) => Promise<Uint8Array>,
  renderPdfPage: RenderPdfPage,
): (url: string) => Promise<Uint8Array> {
  const pdfs = new Map<string, Promise<Uint8Array>>();
  return async (url) => {
    const match = PDF_PAGE.exec(url);
    if (!match?.[1]) return fetchBytes(url);
    const pdf = pdfs.get(match[1]) ?? fetchBytes(match[1]);
    pdfs.set(match[1], pdf);
    const [, , , left, top, across, down] = match;
    const region: Region | undefined =
      left && top && across && down
        ? [Number(left), Number(top), Number(across), Number(down)]
        : undefined;
    return renderPdfPage(await pdf, Number(match[2]), region);
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

/** A PDF's page at 300 dpi with poppler's pdftoppm, cut with ImageMagick; both must be on the path. */
export const renderPdfPage: RenderPdfPage = async (pdf, page, region) => {
  const dir = await mkdtemp(join(tmpdir(), "book-import-pdf-"));
  try {
    const file = join(dir, "scan.pdf");
    await writeFile(file, pdf);
    const png = await run([
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
    if (!region) return png;
    // A PNG gives its width and height in its header.
    const header = new DataView(png.buffer, png.byteOffset, 24);
    const [width, height] = [header.getUint32(16), header.getUint32(20)];
    const [left, top, across, down] = region;
    const crop = `${Math.round(across * width)}x${Math.round(down * height)}+${Math.round(left * width)}+${Math.round(top * height)}`;
    return await run(["magick", "-", "-crop", crop, "+repage", "png:-"], png);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
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
      fetchImage: scanImages(fetch.bytes, renderPdfPage),
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
 * states the first page's; Fraktur's long s read as s, its hyphen as one,
 * and its capital umlauts with their dots.
 */
export function volumeOfPages(pages: string[], firstPage?: number): string {
  const bodies = pages.map((page, leaf) =>
    frakturRead(
      (/<body>([\s\S]*)<\/body>/.exec(page)?.[1] ?? "").replace(
        /<div class='ocr_page' id='page_\d+'([^>]*)>/,
        firstPage === undefined
          ? `<div class='ocr_page' id='page_${leaf}'$1>`
          : `<div class='ocr_page' id='page_${leaf}'$1><span class='ocr_pageno'>${firstPage + leaf}</span>`,
      ),
    ),
  );
  return `<html><body>\n${bodies.join("\n")}\n</body></html>\n`;
}

/**
 * A Fraktur OCR's hOCR as roman type sets it: its long s as s, its etc.
 * and hyphens as such, and its capital umlauts with their dots.
 */
export function frakturRead(hocr: string): string {
  return (
    hocr
      .replace(/ſ/g, "s")
      // Fraktur's etc., ꝛc., the model reads now and then as ꝛe. or ꝛ2c.
      .replace(/ꝛ[ce2]+\./g, "etc.")
      .replace(O_AS_S, "Ö")
      .replace(SMALL_NOUN, (letter) => letter.toUpperCase())
      .replace(
        DOTLESS,
        (word) => `${UMLAUT[word.charAt(0)] ?? word.charAt(0)}${word.slice(1)}`,
      )
      // Fraktur models print a word's hyphen as a dash, a double hyphen or
      // an equals sign, at times two of them.
      .replace(/(\p{L})[—⸗=-]+(?=<\/span>)/gu, "$1-")
      // A double hyphen is a hyphen wherever it stands: inside a word, and
      // ending one before a comma (Wechsel⸗, Aktien⸗ und Schiffshändler).
      .replace(/(\p{L})(?:⸗-?|-⸗)(?=\p{L}|[,;])/gu, "$1-")
  );
}
