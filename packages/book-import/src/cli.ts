import { readFile } from "node:fs/promises";
import { corpusReader } from "./corpus-source";
import { readCorrectionsBeside } from "./corrections-file";
import { importBooks, parseManifest } from "./import-books";
import { importerPageOcr } from "./page-ocr";
import { createImporterFetch } from "./polite-fetch";

const USAGE =
  "Usage: bun packages/book-import/src/cli.ts <manifest.yaml> <brain-data> [--from-corpus <brain-data>]";

const [manifestPath, brainData, flag, corpus] = process.argv.slice(2);
if (
  !manifestPath ||
  !brainData ||
  (flag !== undefined && (flag !== "--from-corpus" || !corpus))
) {
  console.error(USAGE);
  process.exit(1);
}

const manifest = parseManifest(await readFile(manifestPath, "utf8"));
const fetchText = createImporterFetch();
const results = await importBooks(manifest, brainData, fetchText, {
  corrections: await readCorrectionsBeside(manifestPath),
  pageOcr: importerPageOcr(fetchText),
  // A corpus the importer already rendered is a source too: restructuring
  // an eKGWB book needs no second fetch.
  ...(corpus ? { ekgwb: await corpusReader(corpus) } : {}),
});
results.forEach(({ slug, entries }) =>
  console.log(`${slug}: ${entries} entries`),
);
