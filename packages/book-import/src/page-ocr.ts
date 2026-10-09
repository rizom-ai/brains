import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { importerCacheDir, type PoliteFetch } from "./polite-fetch";

/** A scanned page read anew: its hOCR. */
export type PageOcr = (imageUrl: string) => Promise<string>;

export interface PageOcrOptions {
  /** Each page's recognised text is kept here and never recognised again. */
  cacheDir: string;
  /** The recognition model: Tesseract's frk for Fraktur. */
  model: string;
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
      .update(`${options.model}\n${imageUrl}`)
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

/** The importer's page OCR: Tesseract, images fetched in the importer's queue. */
export function importerPageOcr(
  fetch: PoliteFetch,
): (model: string) => PageOcr {
  return (model) =>
    createPageOcr({
      cacheDir: importerCacheDir(),
      model,
      fetchImage: fetch.bytes,
      recognise: tesseractHocr,
    });
}

/** Recognise a page image with Tesseract, which must be on the path. */
export async function tesseractHocr(
  image: Uint8Array,
  model: string,
): Promise<string> {
  const child = Bun.spawn(
    ["tesseract", "stdin", "stdout", "-l", model, "hocr"],
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
  return hocr;
}

/**
 * A volume's pages as one hOCR document, each page numbered by its leaf, the
 * order the scan holds them in; Fraktur's long s read as s.
 */
export function volumeOfPages(pages: string[]): string {
  const bodies = pages.map((page, leaf) =>
    (/<body>([\s\S]*)<\/body>/.exec(page)?.[1] ?? "")
      .replace(
        /<div class='ocr_page' id='page_\d+'/,
        `<div class='ocr_page' id='page_${leaf}'`,
      )
      .replace(/ſ/g, "s"),
  );
  return `<html><body>\n${bodies.join("\n")}\n</body></html>\n`;
}
