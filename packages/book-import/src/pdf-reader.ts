import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "@brains/utils/zod";
import { importerCacheDir, type PoliteFetch } from "./polite-fetch";

/** A PDF's pages as read: their text layer, with positions and type sizes, and each page's running head. */
export interface PdfPages {
  /** The text layer as pdftohtml gives it: pdf2xml, the hidden OCR text included. */
  xml: string;
  /** The first line of each page's head, read from its image, by PDF page. */
  heads: Map<number, string>;
}

/** Read a PDF's pages from first to last. */
export type PdfReader = (
  url: string,
  first: number,
  last: number,
) => Promise<PdfPages>;

/** Run a command, its input piped in, and give its output; it fails where the command does. */
export type RunCommand = (
  command: string[],
  input?: Uint8Array,
) => Promise<Uint8Array>;

export interface PdfReaderOptions {
  /** The PDF, its text layer and the heads read are kept here and never fetched or read again. */
  cacheDir: string;
  fetchBytes: (url: string) => Promise<Uint8Array>;
  run: RunCommand;
}

/** A page's head stands within this band at its top, read at 300 dpi. */
const HEAD_BAND = [
  "-r",
  "300",
  "-x",
  "0",
  "-y",
  "0",
  "-W",
  "1700",
  "-H",
  "340",
];

/** The heads read so far, by PDF page. */
const headsSchema: z.ZodRecord<z.ZodString, z.ZodString> = z.record(
  z.string(),
  z.string(),
);

async function readCached(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    // A missing cache entry means it has not been read yet.
    return null;
  }
}

/**
 * Read PDFs with a text layer: the file is fetched once, its text layer
 * given by pdftohtml, and each page's running head, which such a layer may
 * lack, read from the page's image by Tesseract.
 */
export function createPdfReader(options: PdfReaderOptions): PdfReader {
  const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);
  return async (url, first, last) => {
    const key = createHash("sha256").update(url).digest("hex");
    await mkdir(options.cacheDir, { recursive: true });
    const pdf = join(options.cacheDir, `pdf-${key}.pdf`);
    // A file not there yet is fetched; one there is the volume as fetched.
    await access(pdf).catch(async () => {
      await writeFile(pdf, await options.fetchBytes(url));
    });
    const xmlPath = join(options.cacheDir, `pdf-${key}-${first}-${last}.xml`);
    const xml =
      (await readCached(xmlPath)) ??
      decode(
        await options.run([
          "pdftohtml",
          "-xml",
          "-i",
          "-hidden",
          "-q",
          "-stdout",
          "-f",
          String(first),
          "-l",
          String(last),
          pdf,
        ]),
      );
    await writeFile(xmlPath, xml);
    const headsPath = join(options.cacheDir, `pdf-${key}-heads.json`);
    const known = headsSchema.parse(
      JSON.parse((await readCached(headsPath)) ?? "{}"),
    );
    const pages = Array.from(
      { length: last - first + 1 },
      (_, index) => first + index,
    );
    const heads = await pages.reduce<Promise<Record<string, string>>>(
      async (done, page) => {
        const read = await done;
        if (read[page] !== undefined) return read;
        const image = await options.run([
          "pdftoppm",
          "-f",
          String(page),
          "-l",
          String(page),
          ...HEAD_BAND,
          "-png",
          pdf,
        ]);
        const text = decode(
          await options.run(
            ["tesseract", "stdin", "stdout", "--psm", "6"],
            image,
          ),
        );
        const head = {
          ...read,
          [page]: (text.split("\n").find((line) => line.trim()) ?? "").trim(),
        };
        await writeFile(headsPath, JSON.stringify(head));
        return head;
      },
      Promise.resolve(known),
    );
    return {
      xml,
      heads: new Map(pages.map((page) => [page, heads[page] ?? ""])),
    };
  };
}

/** Run a command on the path, its input piped in. */
export const runCommand: RunCommand = async (command, input) => {
  const child = Bun.spawn(command, {
    stdin: input ?? "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [output, errors, code] = await Promise.all([
    new Response(child.stdout).arrayBuffer(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    throw new Error(`${command[0] ?? ""} failed (${code}): ${errors}`);
  }
  return new Uint8Array(output);
};

/** The importer's PDF reader: its cache, its polite fetch, the tools on the path. */
export function importerPdfReader(fetch: PoliteFetch): PdfReader {
  return createPdfReader({
    cacheDir: importerCacheDir(),
    fetchBytes: fetch.bytes,
    run: runCommand,
  });
}
