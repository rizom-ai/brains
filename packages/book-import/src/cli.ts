import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { corpusReader } from "./corpus-source";
import {
  ekgwbReader,
  importBooks,
  parseManifest,
  type BookReader,
} from "./import-books";
import { createPoliteFetch } from "./polite-fetch";

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
// A corpus the importer already rendered is a source too: restructuring a
// book needs no second fetch.
const reader: BookReader = corpus
  ? await corpusReader(corpus)
  : ekgwbReader(
      createPoliteFetch({
        cacheDir:
          process.env["BOOK_IMPORT_CACHE"] ??
          join(homedir(), ".cache", "book-import"),
        userAgent: "rizom-brains-book-import (yeehaa@rizom.ai)",
        minIntervalMs: 1000,
      }),
    );

const results = await importBooks(manifest, brainData, reader);
results.forEach(({ slug, entries }) =>
  console.log(`${slug}: ${entries} entries`),
);
