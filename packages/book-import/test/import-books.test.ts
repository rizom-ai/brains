import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bookAdapter } from "@brains/book";
import { importBooks, parseManifest } from "../src/import-books";

const manifestYaml = `
source: ekgwb
books:
  - siglum: EB
    slug: erfundenes-buch
    author: Erfundener Autor
    year: 1888
    kind: work
`;

describe("importBooks", () => {
  let brainData: string;
  const requested: string[] = [];

  beforeEach(async () => {
    brainData = await mkdtemp(join(tmpdir(), "book-import-run-"));
    requested.length = 0;
  });

  afterEach(async () => {
    await rm(brainData, { recursive: true, force: true });
  });

  async function fetchFixture(url: string): Promise<string> {
    requested.push(url);
    return readFile(
      join(import.meta.dir, "fixtures", "ekgwb-flat.html"),
      "utf8",
    );
  }

  it("fetches each book's print page once and writes its entries", async () => {
    const results = await importBooks(
      parseManifest(manifestYaml),
      brainData,
      fetchFixture,
    );

    expect(requested).toEqual([
      "http://www.nietzschesource.org/eKGWB/EB/print",
    ]);
    expect(results).toEqual([{ slug: "erfundenes-buch", entries: 3 }]);
    expect(
      (await readdir(join(brainData, "book/erfundenes-buch"))).sort(),
    ).toEqual(["00000-titel.md", "00001-vorwort.md", "00002-1.md"]);
  });

  it("credits eKGWB on the title entry", async () => {
    await importBooks(parseManifest(manifestYaml), brainData, fetchFixture);
    const title = await readFile(
      join(brainData, "book/erfundenes-buch/00000-titel.md"),
      "utf8",
    );

    expect(
      bookAdapter.parseFrontMatter(title, bookAdapter.frontmatterSchema),
    ).toMatchObject({
      title: "Erfundenes Buch",
      author: "Erfundener Autor",
      license: "CC-BY-NC-ND-4.0",
      source: "http://www.nietzschesource.org/eKGWB/EB",
    });
    expect(title).toContain("Nietzsche Source");
  });

  it("titles a book from the manifest when it names one", async () => {
    await importBooks(
      parseManifest(
        manifestYaml.replace(
          "slug: erfundenes-buch",
          "slug: erfundenes-buch\n    title: Ein genauerer Titel",
        ),
      ),
      brainData,
      fetchFixture,
    );
    const title = await readFile(
      join(brainData, "book/erfundenes-buch/00000-titel.md"),
      "utf8",
    );

    expect(
      bookAdapter.parseFrontMatter(title, bookAdapter.frontmatterSchema)[
        "title"
      ],
    ).toBe("Ein genauerer Titel");
  });

  it("carries published and shortTitle from the manifest", async () => {
    await importBooks(
      parseManifest(
        manifestYaml.replace(
          "slug: erfundenes-buch",
          "slug: erfundenes-buch\n    published: false\n    shortTitle: Erfunden",
        ),
      ),
      brainData,
      fetchFixture,
    );
    const title = await readFile(
      join(brainData, "book/erfundenes-buch/00000-titel.md"),
      "utf8",
    );

    expect(
      bookAdapter.parseFrontMatter(title, bookAdapter.frontmatterSchema),
    ).toMatchObject({ published: false, shortTitle: "Erfunden" });
  });

  it("counts a book as published unless the manifest says otherwise", async () => {
    await importBooks(parseManifest(manifestYaml), brainData, fetchFixture);
    const title = await readFile(
      join(brainData, "book/erfundenes-buch/00000-titel.md"),
      "utf8",
    );

    expect(
      bookAdapter.parseFrontMatter(title, bookAdapter.frontmatterSchema)[
        "published"
      ],
    ).toBe(true);
  });

  it("rejects a manifest entry without a siglum", () => {
    expect(() =>
      parseManifest(
        `source: ekgwb\nbooks:\n  - slug: x\n    author: A\n    year: 1\n    kind: work\n`,
      ),
    ).toThrow();
  });
});

describe("importBooks from scanned volumes", () => {
  const ocrManifest = `
source: archive-ocr
books:
  - item: freud-1940-gw-13
    volume: XIII
    firstPage: 3
    lastPage: 10
    slug: jenseits-des-lustprinzips
    title: Jenseits des Lustprinzips
    edition: Gesammelte Werke, Bd. XIII (Imago, London 1940)
    author: Sigmund Freud
    year: 1920
    kind: work
`;
  let brainData: string;
  const requested: string[] = [];

  beforeEach(async () => {
    brainData = await mkdtemp(join(tmpdir(), "book-import-ocr-"));
    requested.length = 0;
  });

  afterEach(async () => {
    await rm(brainData, { recursive: true, force: true });
  });

  async function fetchArchive(url: string): Promise<string> {
    requested.push(url);
    if (url === "https://archive.org/metadata/freud-1940-gw-13") {
      return JSON.stringify({
        metadata: { title: "Gesammelte Werke. XIII. Band", date: "1940" },
        files: [
          { name: "Freud_1940_GW_13_djvu.txt", format: "DjVuTXT" },
          { name: "Freud_1940_GW_13_hocr.html", format: "hOCR" },
        ],
      });
    }
    return readFile(
      join(import.meta.dir, "fixtures", "archive-ocr-gw.html"),
      "utf8",
    );
  }

  it("reads a work from its volume's hOCR, found through the item's metadata", async () => {
    const results = await importBooks(
      parseManifest(ocrManifest),
      brainData,
      fetchArchive,
    );

    expect(requested).toEqual([
      "https://archive.org/metadata/freud-1940-gw-13",
      "https://archive.org/download/freud-1940-gw-13/Freud_1940_GW_13_hocr.html",
    ]);
    expect(results).toEqual([
      { slug: "jenseits-des-lustprinzips", entries: 3 },
    ]);
  });

  it("credits the edition and the scan on the title entry", async () => {
    await importBooks(parseManifest(ocrManifest), brainData, fetchArchive);
    const title = await readFile(
      join(brainData, "book/jenseits-des-lustprinzips/00000-titel.md"),
      "utf8",
    );

    expect(
      bookAdapter.parseFrontMatter(title, bookAdapter.frontmatterSchema),
    ).toMatchObject({
      title: "Jenseits des Lustprinzips",
      author: "Sigmund Freud",
      year: 1920,
      license: "public-domain",
      edition: "Gesammelte Werke, Bd. XIII (Imago, London 1940)",
      source: "https://archive.org/details/freud-1940-gw-13",
    });
    expect(title).toContain("Internet Archive");
  });
});
