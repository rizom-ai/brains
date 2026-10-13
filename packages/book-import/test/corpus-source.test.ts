import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { corpusReader } from "../src/corpus-source";
import {
  importBooks,
  parseManifest,
  type BookRead,
  type BookReader,
} from "../src/import-books";
import {
  renderBook,
  type BookFile,
  type BookSource,
  type BookUnit,
} from "../src/render-book";
import { writeBook } from "../src/write-book";

const longParagraph = Array.from(
  { length: 400 },
  (_, index) => `Satz ${index} steht hier.`,
).join(" ");

const source: BookSource = {
  book: {
    slug: "erfundenes-buch",
    title: "Erfundenes Buch",
    author: "Erfundener Autor",
    year: 1888,
    kind: "work",
    edition: "Erfundene Ausgabe",
    license: "CC-BY-NC-ND-4.0",
    attribution: "Erfundene Quelle",
    source: "http://www.nietzschesource.org/eKGWB/EB",
    published: true,
    shortTitle: "Erfunden",
  },
  units: [
    {
      parents: [],
      title: "[Titel]",
      section: "EB-[Titel]",
      page: null,
      source: "http://www.nietzschesource.org/eKGWB/EB-[Titel]",
      paragraphs: ["Erfundenes Buch."],
    },
    {
      parents: ["Erstes Hauptstück"],
      title: "1",
      section: "EB-I-1",
      page: "11",
      source: "http://www.nietzschesource.org/eKGWB/EB-I-1",
      paragraphs: ["Erster Absatz.", "Zweiter Absatz."],
    },
    {
      parents: ["Erstes Hauptstück"],
      title: "2",
      section: "EB-I-2",
      page: "12",
      source: "http://www.nietzschesource.org/eKGWB/EB-I-2",
      paragraphs: [longParagraph, "Ein kurzer Absatz danach."],
    },
    {
      parents: ["Zweites Hauptstück", "Ein Unterabschnitt"],
      title: "3",
      section: "EB-II-3",
      page: null,
      source: "http://www.nietzschesource.org/eKGWB/EB-II-3",
      paragraphs: ["Dritter Abschnitt."],
    },
  ],
};

/** The error a promise rejects with; undefined when it resolves. */
function failureOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  );
}

function unit(siglum: string, title: string, parents: string[]): BookUnit {
  return {
    parents,
    title,
    section: siglum,
    page: null,
    source: `http://www.nietzschesource.org/eKGWB/${siglum}`,
    paragraphs: [`Text von ${siglum}.`],
  };
}

/** Every file below a directory, by path, with its content. */
async function treeOf(dir: string): Promise<Record<string, string>> {
  const files = (await readdir(dir, { recursive: true })).filter((file) =>
    file.endsWith(".md"),
  );
  const entries = await Promise.all(
    files.map(async (file) => [file, await readFile(join(dir, file), "utf8")]),
  );
  return Object.fromEntries(
    entries.sort(([a], [b]) => String(a).localeCompare(String(b))),
  );
}

function sorted(files: BookFile[]): BookFile[] {
  return [...files].sort((left, right) => left.path.localeCompare(right.path));
}

describe("corpusReader", () => {
  let brainData: string;

  beforeEach(async () => {
    brainData = await mkdtemp(join(tmpdir(), "book-import-corpus-"));
  });

  afterEach(async () => {
    await rm(brainData, { recursive: true, force: true });
  });

  it("reads a rendered book back into units that render the same files", async () => {
    const files = renderBook(source);
    await writeBook(brainData, source.book.slug, files);

    const reader = await corpusReader(brainData);
    const read = await reader.read("EB");

    expect(read.title).toBe("Erfundenes Buch");
    expect(
      sorted(renderBook({ book: source.book, units: read.units })),
    ).toEqual(sorted(files));
  });

  it("finds a book by the siglum of its source", async () => {
    await writeBook(brainData, source.book.slug, renderBook(source));

    const reader = await corpusReader(brainData);

    expect(await reader.read("EB")).toMatchObject({
      title: "Erfundenes Buch",
    });
    expect(String(await failureOf(reader.read("XY")))).toContain("XY");
  });
  it("reads back each part of a book printed in parts, under its own siglum", async () => {
    // EB-I and EB-II: one siglum is a prefix of the other, as Za-I and Za-II.
    const parts: Record<string, BookRead> = {
      "EB-I": {
        title: "Erfundenes Werk. Erster Theil",
        units: [
          unit("EB-I-1", "Eins", []),
          unit("EB-I-2", "Zwei", ["Ein Kapitel"]),
        ],
      },
      "EB-II": {
        title: "Erfundenes Werk. Zweiter Theil",
        units: [unit("EB-II-1", "Drei", [])],
      },
    };
    const fromSource: BookReader = {
      read: async (siglum) => {
        const part = parts[siglum];
        if (!part) throw new Error(siglum);
        return part;
      },
    };
    const manifest = parseManifest(`
source: ekgwb
books:
  - slug: erfundenes-werk
    title: Erfundenes Werk
    author: Erfundener Autor
    year: 1888
    kind: work
    parts:
      - siglum: EB-I
        title: Erster Theil
      - siglum: EB-II
        title: Zweiter Theil
`);
    await importBooks(manifest, brainData, fromSource);
    const again = await mkdtemp(join(tmpdir(), "book-import-again-"));
    try {
      await importBooks(manifest, again, await corpusReader(brainData));

      expect(await treeOf(again)).toEqual(await treeOf(brainData));
    } finally {
      await rm(again, { recursive: true, force: true });
    }
  });
});
