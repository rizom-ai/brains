import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { corpusReader } from "../src/corpus-source";
import { renderBook, type BookFile, type BookSource } from "../src/render-book";
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
      parents: ["Zweites Hauptstück"],
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

  it("refuses an entry nested below its part, whose heading it no longer has", async () => {
    await writeBook(brainData, source.book.slug, renderBook(source));
    const nested = join(
      brainData,
      "book/erfundenes-buch/00001-erstes-hauptstueck/00002-tief",
    );
    await mkdir(nested, { recursive: true });
    await writeFile(
      join(nested, "00009-x.md"),
      "---\ntitle: x\nbook: erfundenes-buch\norder: 9\nsource: http://www.nietzschesource.org/eKGWB/EB-x\n---\nx\n",
    );

    const reader = await corpusReader(brainData);

    expect(String(await failureOf(reader.read("EB")))).toContain("nested");
  });
});
