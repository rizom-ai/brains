import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseManifest, scannedBooks, type Manifest } from "./import-books";

interface CoverageLine {
  /** The volume, as cited: GW XIII. */
  citation: string;
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

/** The note's front matter and its opening sentence, which says what the note lists. */
function opening(
  manifest: Manifest,
  lists: (author: string) => string,
): string[] {
  const coverage = manifest.coverage;
  if (!coverage) throw new Error("The manifest has no coverage section.");
  return [
    "---",
    "title: Coverage",
    "---",
    `${lists(coverage.author)} Texts come from ${coverage.edition}. ${coverage.license}`,
    "",
  ];
}

/** A list under a heading, closed by a blank line. */
function section(heading: string, lines: string[]): string {
  return [`## ${heading}`, "", ...lines, ""].join("\n");
}

/**
 * The coverage note of a brain read from many sources: every work by the
 * decade it appeared in, with the edition it comes from, imported or a gap
 * with its reason; gaps without a year close the note.
 */
function renderBySource(manifest: Manifest): string {
  const entries = [
    ...manifest.books.map((book) => ({
      year: book.year,
      line: `- ${book.title ?? book.slug} (${book.year}) — imported${"edition" in book ? ` from ${book.edition}` : ""}${book.published ? "" : ", published after the author's death"}`,
    })),
    ...manifest.gaps.flatMap((gap) =>
      gap.year === undefined
        ? []
        : [
            {
              year: gap.year,
              line: `- ${gap.title} (${gap.year}) — gap: ${gap.reason}`,
            },
          ],
    ),
  ].sort((a, b) => a.year - b.year);
  const decades = [
    ...new Set(entries.map((entry) => Math.floor(entry.year / 10) * 10)),
  ];
  const undated = manifest.gaps
    .filter((gap) => gap.year === undefined)
    .map((gap) => `- ${gap.title} — gap: ${gap.reason}`);
  return [
    ...opening(
      manifest,
      (author) =>
        `The works of ${author} this brain holds, and those it lacks with the reason.`,
    ),
    ...decades.map((decade) =>
      section(
        `${decade}s`,
        entries
          .filter((entry) => Math.floor(entry.year / 10) * 10 === decade)
          .map((entry) => entry.line),
      ),
    ),
    ...(undated.length === 0 ? [] : [section("Not held", undated)]),
  ].join("\n");
}

/**
 * The coverage note of a brain: read from one edition's scanned volumes,
 * every work of the author's oeuvre by volume, in the volume's order,
 * imported or a gap with its reason; read from many sources, by decade.
 */
export function renderCoverage(manifest: Manifest): string {
  if (manifest.books.some((book) => book.source !== "archive-ocr")) {
    return renderBySource(manifest);
  }
  const books = scannedBooks(manifest);
  const lines: CoverageLine[] = [
    ...books.map((book) => ({
      citation: book.citation,
      start: startOf(book.firstPage),
      line: `- ${book.title} (${book.year}, ${book.citation}, ${book.firstPage}–${book.lastPage}) — imported${book.published ? "" : ", published after the author's death"}`,
    })),
    ...manifest.gaps.flatMap((gap) =>
      gap.citation === undefined
        ? []
        : [
            {
              citation: gap.citation,
              start: startOf(gap.pages ?? ""),
              line: `- ${gap.title} (${gap.year === undefined ? "" : `${gap.year}, `}${gap.citation}, ${gap.pages ?? ""}) — gap: ${gap.reason}`,
            },
          ],
    ),
  ];
  // Works the edition does not print close the note.
  const outside = manifest.gaps
    .filter((gap) => gap.citation === undefined)
    .map((gap) => `- ${gap.title} — gap: ${gap.reason}`);
  const volumes = [...new Set(books.map((book) => book.citation))];
  const sections = volumes.map((volume) =>
    [
      `## ${volume}`,
      "",
      ...lines
        .filter((entry) => entry.citation === volume)
        .sort((a, b) => a.start - b.start)
        .map((entry) => entry.line),
      "",
    ].join("\n"),
  );
  return [
    ...opening(
      manifest,
      (author) =>
        `Every work of ${author}'s oeuvre, and whether this brain holds it.`,
    ),
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
