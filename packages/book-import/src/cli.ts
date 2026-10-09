import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  importBooks,
  parseCorrections,
  parseManifest,
  type Corrections,
} from "./import-books";
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

/** A manifest's corrections sit beside it: freud.yaml, freud-corrections.yaml. */
async function correctionsBeside(path: string): Promise<Corrections> {
  const correctionsPath = path.replace(/\.ya?ml$/u, "-corrections.yaml");
  try {
    await access(correctionsPath);
  } catch {
    // A manifest without corrections imports its text as read.
    return {};
  }
  return parseCorrections(await readFile(correctionsPath, "utf8"));
}

const results = await importBooks(
  manifest,
  brainData,
  fetchText,
  await correctionsBeside(manifestPath),
);
results.forEach(({ slug, entries }) =>
  console.log(`${slug}: ${entries} entries`),
);
