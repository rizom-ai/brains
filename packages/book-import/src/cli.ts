import { readFile } from "node:fs/promises";
import { readCorrectionsBeside } from "./corrections-file";
import { importBooks, parseManifest } from "./import-books";
import { importerPageOcr } from "./page-ocr";
import { createImporterFetch } from "./polite-fetch";

const USAGE =
  "Usage: bun packages/book-import/src/cli.ts <manifest.yaml> <brain-data>";

const [manifestPath, brainData] = process.argv.slice(2);
if (!manifestPath || !brainData) {
  console.error(USAGE);
  process.exit(1);
}

const manifest = parseManifest(await readFile(manifestPath, "utf8"));
const fetchText = createImporterFetch();
const results = await importBooks(manifest, brainData, fetchText, {
  corrections: await readCorrectionsBeside(manifestPath),
  pageOcr: importerPageOcr(fetchText),
});
results.forEach(({ slug, entries }) =>
  console.log(`${slug}: ${entries} entries`),
);
