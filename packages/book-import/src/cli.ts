import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { importBooks, parseManifest } from "./import-books";
import { createPoliteFetch } from "./polite-fetch";

const USAGE =
  "Usage: bun packages/book-import/src/cli.ts <manifest.yaml> <brain-data>";

const [manifestPath, brainData] = process.argv.slice(2);
if (!manifestPath || !brainData) {
  console.error(USAGE);
  process.exit(1);
}

const manifest = parseManifest(await readFile(manifestPath, "utf8"));
const fetchText = createPoliteFetch({
  cacheDir:
    process.env["BOOK_IMPORT_CACHE"] ??
    join(homedir(), ".cache", "book-import"),
  userAgent: "rizom-brains-book-import (yeehaa@rizom.ai)",
  minIntervalMs: 1000,
});

const results = await importBooks(manifest, brainData, fetchText);
results.forEach(({ slug, entries }) =>
  console.log(`${slug}: ${entries} entries`),
);
