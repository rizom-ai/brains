import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseManifest, scannedBooks, type Manifest } from "./import-books";

interface CoverageLine {
  volume: string;
  /** Where the work begins in its volume, for listing works in their order. */
  start: number;
  line: string;
}

const ROMAN_PAGE = /^[IVXL]+$/u;

/** A page range's first arabic page; front matter in roman comes first. */
function startOf(pages: string | number): number {
  const first = String(pages).split(/[–-]/u)[0] ?? "";
  return ROMAN_PAGE.test(first) ? 0 : Number(first);
}

/**
 * The coverage note of a brain read from scanned volumes: every work of the
 * author's oeuvre by volume, in the volume's order, imported or a gap with
 * its reason.
 */
export function renderCoverage(manifest: Manifest): string {
  const books = scannedBooks(manifest);
  const coverage = manifest.coverage;
  if (!coverage) throw new Error("The manifest has no coverage section.");
  const lines: CoverageLine[] = [
    ...books.map((book) => ({
      volume: book.volume,
      start: startOf(book.firstPage),
      line: `- ${book.title} (${book.year}, GW ${book.volume}, ${book.firstPage}–${book.lastPage}) — imported${book.published ? "" : ", published after the author's death"}`,
    })),
    ...manifest.gaps.flatMap((gap) =>
      gap.volume === undefined
        ? []
        : [
            {
              volume: gap.volume,
              start: startOf(gap.pages ?? ""),
              line: `- ${gap.title} (${gap.year === undefined ? "" : `${gap.year}, `}GW ${gap.volume}, ${gap.pages ?? ""}) — gap: ${gap.reason}`,
            },
          ],
    ),
  ];
  // Works the edition does not print close the note.
  const outside = manifest.gaps
    .filter((gap) => gap.volume === undefined)
    .map((gap) => `- ${gap.title} — gap: ${gap.reason}`);
  const volumes = [...new Set(books.map((book) => book.volume))];
  const sections = volumes.map((volume) =>
    [
      `## GW ${volume}`,
      "",
      ...lines
        .filter((entry) => entry.volume === volume)
        .sort((a, b) => a.start - b.start)
        .map((entry) => entry.line),
      "",
    ].join("\n"),
  );
  return [
    "---",
    "title: Coverage",
    "---",
    `Every work of ${coverage.author}'s oeuvre, and whether this brain holds it. Texts come from ${coverage.edition}. ${coverage.license}`,
    "",
    ...sections,
    ...(outside.length === 0
      ? []
      : [["## Not in the edition", "", ...outside, ""].join("\n")]),
  ].join("\n");
}

const USAGE =
  "Usage: bun packages/book-import/src/coverage.ts <manifest.yaml> <brain-data>";

async function main(): Promise<void> {
  const [manifestPath, brainData] = process.argv.slice(2);
  if (!manifestPath || !brainData) {
    console.error(USAGE);
    process.exit(1);
  }
  const manifest = parseManifest(await readFile(manifestPath, "utf8"));
  await writeFile(join(brainData, "coverage.md"), renderCoverage(manifest));
}

if (import.meta.main) await main();
