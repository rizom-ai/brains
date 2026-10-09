import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pageLeaf, pageText } from "./adapters/archive-ocr";
import { fetchVolumeHocr, parseManifest } from "./import-books";
import { createPoliteFetch } from "./polite-fetch";

/** The printed pages of one work in a volume. */
export interface PageRange {
  firstPage: number | string;
  lastPage: number;
  skipPages: number[];
}

/** A seed from the volume's name, so a volume is always sampled alike. */
function seedOf(item: string): number {
  return [...item].reduce(
    (hash, character) => Math.imul(hash ^ character.charCodeAt(0), 16777619),
    2166136261,
  );
}

/** Mulberry32: a small, fixed sequence of numbers between 0 and 1. */
function random(seed: number): () => number {
  const state = { value: seed };
  return () => {
    state.value = (state.value + 0x6d2b79f5) | 0;
    const mixed = Math.imul(
      state.value ^ (state.value >>> 15),
      1 | state.value,
    );
    const more = mixed ^ (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed));
    return ((more ^ (more >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A volume's pages to check against the scan: the same draw every time,
 * from the pages its works span, in page order. Front matter cited in roman
 * is left to the works' arabic pages.
 */
export function samplePages(
  item: string,
  ranges: PageRange[],
  count: number,
): number[] {
  const pages = [
    ...new Set(
      ranges.flatMap((range) => {
        const first = typeof range.firstPage === "number" ? range.firstPage : 1;
        return Array.from(
          { length: Math.max(0, range.lastPage - first + 1) },
          (_, index) => first + index,
        ).filter((page) => !range.skipPages.includes(page));
      }),
    ),
  ].sort((a, b) => a - b);
  if (pages.length <= count) return pages;
  const next = random(seedOf(item));
  return pages
    .map((page) => ({ page, key: next() }))
    .sort((a, b) => a.key - b.key)
    .slice(0, count)
    .map(({ page }) => page)
    .sort((a, b) => a - b);
}

/** One request at a time to archive.org for the scans, as for the text. */
const SCAN_INTERVAL_MS = 1000;

async function downloadScan(url: string, path: string): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, SCAN_INTERVAL_MS));
  const response = await fetch(url, {
    headers: { "user-agent": "rizom-brains-book-import (yeehaa@rizom.ai)" },
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  await writeFile(path, new Uint8Array(await response.arrayBuffer()));
}

/** Pages checked per volume, as the books plan sets the OCR gate. */
const PAGES_PER_VOLUME = 20;

function words(text: string): number {
  return text.split(/\s+/u).filter((token) => /\p{L}/u.test(token)).length;
}

const USAGE =
  "Usage: bun packages/book-import/src/ocr-gate.ts <manifest.yaml> <out-dir>";

/**
 * Write each scanned volume's gate sheet: its sampled pages' scans beside
 * the text the importer reads from them, and a table for the wrong words a
 * reviewer counts.
 */
async function main(): Promise<void> {
  const [manifestPath, outDir] = process.argv.slice(2);
  if (!manifestPath || !outDir) {
    console.error(USAGE);
    process.exit(1);
  }
  const manifest = parseManifest(await readFile(manifestPath, "utf8"));
  if (manifest.source !== "archive-ocr") {
    console.error("The OCR gate reads archive-ocr manifests.");
    process.exit(1);
  }
  const fetchText = createPoliteFetch({
    cacheDir:
      process.env["BOOK_IMPORT_CACHE"] ??
      join(homedir(), ".cache", "book-import"),
    userAgent: "rizom-brains-book-import (yeehaa@rizom.ai)",
    minIntervalMs: 1000,
  });
  const items = [...new Set(manifest.books.map((book) => book.item))];
  await items.reduce(async (done, item) => {
    await done;
    const hocr = await fetchVolumeHocr(item, fetchText);
    const pages = samplePages(
      item,
      manifest.books.filter((book) => book.item === item),
      PAGES_PER_VOLUME,
    );
    const dir = join(outDir, item);
    await mkdir(dir, { recursive: true });
    const rows = await pages.reduce<Promise<string[]>>(async (sheet, page) => {
      const rows = await sheet;
      const text = pageText(hocr, page);
      const leaf = pageLeaf(hocr, page);
      await writeFile(join(dir, `${page}.txt`), `${text}\n`);
      await downloadScan(
        `https://archive.org/download/${item}/page/n${leaf}_w1200.jpg`,
        join(dir, `${page}.jpg`),
      );
      return [...rows, `| ${page} | ${leaf} | ${words(text)} | |`];
    }, Promise.resolve([]));
    await writeFile(
      join(dir, "gate.md"),
      [
        `# OCR gate: ${item}`,
        "",
        "Each page's scan is <page>.jpg (archive.org/details/" +
          `${item}/page/n<leaf>) and its text as imported <page>.txt.`,
        "Count the words the text gets wrong against the scan.",
        "",
        "| page | leaf | words | wrong |",
        "| ---- | ---- | ----- | ----- |",
        ...rows,
        "",
      ].join("\n"),
    );
    console.log(`${item}: ${pages.join(", ")}`);
  }, Promise.resolve());
}

if (import.meta.main) await main();
