import { readFile } from "node:fs/promises";
import { readCorrectionsBeside } from "./corrections-file";
import { importBooks, parseManifest } from "./import-books";
import { createImporterFetch } from "./polite-fetch";

const USAGE =
  "Usage: bun packages/book-import/src/cli.ts <manifest.yaml> <brain-data>";

const [manifestPath, brainData] = process.argv.slice(2);
if (!manifestPath || !brainData) {
  console.error(USAGE);
  process.exit(1);
}

const manifest = parseManifest(await readFile(manifestPath, "utf8"));
const results = await importBooks(
  manifest,
  brainData,
  createImporterFetch(),
  await readCorrectionsBeside(manifestPath),
);
results.forEach(({ slug, entries }) =>
  console.log(`${slug}: ${entries} entries`),
);
