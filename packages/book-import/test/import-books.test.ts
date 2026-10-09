import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bookAdapter } from "@brains/book";
import {
  importBooks,
  parseCorrections,
  parseManifest,
} from "../src/import-books";

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

describe("parseManifest", () => {
  it("reads each book from its own source, the manifest's unless it names another", () => {
    const manifest = parseManifest(`
source: ekgwb
books:
  - siglum: AC
    slug: der-antichrist
    author: Friedrich Nietzsche
    year: 1888
    kind: work
  - source: dta-tei
    id: marx_manifestws_1848
    citation: Manifest
    slug: manifest-der-kommunistischen-partei
    title: Manifest der Kommunistischen Partei
    edition: Manifest der Kommunistischen Partei. London, 1848
    author: Karl Marx, Friedrich Engels
    year: 1848
    kind: work
`);

    expect(manifest.books.map((book) => book.source)).toEqual([
      "ekgwb",
      "dta-tei",
    ]);
  });
});

describe("importBooks from the Deutsches Textarchiv", () => {
  let brainData: string;

  beforeEach(async () => {
    brainData = await mkdtemp(join(tmpdir(), "book-import-dta-"));
  });

  afterEach(async () => {
    await rm(brainData, { recursive: true, force: true });
  });

  it("reads a work from its TEI and credits the Textarchiv under its licence", async () => {
    const requested: string[] = [];
    const results = await importBooks(
      parseManifest(`
source: dta-tei
books:
  - id: marx_kapital01_1867
    citation: Kapital I
    slug: das-kapital-1
    title: Das Kapital. Erster Band
    edition: "Das Kapital. Buch I: Der Produktionsprocess des Kapitals. Hamburg: Otto Meissner, 1867"
    author: Karl Marx
    year: 1867
    kind: work
    skipHeadings: [Vorwort]
`),
      brainData,
      async (url) => {
        requested.push(url);
        return readFile(
          join(import.meta.dir, "fixtures", "dta-kapital.xml"),
          "utf8",
        );
      },
    );
    const title = await readFile(
      join(brainData, "book", "das-kapital-1", "00000-titel.md"),
      "utf8",
    );

    expect(requested).toEqual([
      "https://www.deutschestextarchiv.de/book/download_xml/marx_kapital01_1867",
    ]);
    expect(results).toEqual([{ slug: "das-kapital-1", entries: 4 }]);
    expect(title).toContain("license: CC-BY-SA-4.0");
    expect(title).toContain("Deutsches Textarchiv");
    expect(title).toContain(
      "source: 'https://www.deutschestextarchiv.de/book/show/marx_kapital01_1867'",
    );
  });
});

describe("importBooks from Wikisource", () => {
  let brainData: string;

  beforeEach(async () => {
    brainData = await mkdtemp(join(tmpdir(), "book-import-wikisource-"));
  });

  afterEach(async () => {
    await rm(brainData, { recursive: true, force: true });
  });

  it("reads a work from its rendered page and credits the transcription", async () => {
    const requested: string[] = [];
    const results = await importBooks(
      parseManifest(`
source: wikisource
books:
  - page: Ein Briefwechsel von 1843
    citation: Briefwechsel
    slug: briefe-aus-den-deutsch-franzoesischen-jahrbuechern
    title: Briefe aus den Deutsch-Französischen Jahrbüchern
    edition: "Deutsch-Französische Jahrbücher (Paris 1844), S. 17–40"
    author: Karl Marx
    year: 1844
    kind: letters
    skipHeadings: [R. an M.]
`),
      brainData,
      async (url) => {
        requested.push(url);
        const html = await readFile(
          join(import.meta.dir, "fixtures", "wikisource-briefwechsel.html"),
          "utf8",
        );
        return JSON.stringify({ parse: { text: html } });
      },
    );
    const title = await readFile(
      join(
        brainData,
        "book",
        "briefe-aus-den-deutsch-franzoesischen-jahrbuechern",
        "00000-titel.md",
      ),
      "utf8",
    );

    expect(requested).toEqual([
      "https://de.wikisource.org/w/api.php?action=parse&page=Ein+Briefwechsel+von+1843&prop=text&format=json&formatversion=2",
    ]);
    expect(results).toEqual([
      {
        slug: "briefe-aus-den-deutsch-franzoesischen-jahrbuechern",
        entries: 4,
      },
    ]);
    expect(title).toContain("license: public-domain");
    expect(title).toContain("Wikisource");
    expect(title).toContain(
      "source: 'https://de.wikisource.org/wiki/Ein_Briefwechsel_von_1843'",
    );
  });
});

describe("importBooks from Project Gutenberg letters", () => {
  let brainData: string;

  beforeEach(async () => {
    brainData = await mkdtemp(join(tmpdir(), "book-import-gutenberg-"));
  });

  afterEach(async () => {
    await rm(brainData, { recursive: true, force: true });
  });

  it("reads the writer's letters from the ebook and links it as source", async () => {
    const requested: string[] = [];
    const results = await importBooks(
      parseManifest(`
source: gutenberg-letters
books:
  - ebook: 64327
    citation: Briefwechsel I
    writer:
      signatures: [K. M.]
      salutations: [Lieber Engels!]
    slug: briefe-an-engels-1844-1853
    title: Briefe an Friedrich Engels 1844–1853
    edition: "Der Briefwechsel zwischen Friedrich Engels und Karl Marx, Erster Band (Stuttgart 1913)"
    author: Karl Marx
    year: 1913
    published: false
    kind: letters
`),
      brainData,
      async (url) => {
        requested.push(url);
        return readFile(
          join(import.meta.dir, "fixtures", "gutenberg-briefwechsel.html"),
          "utf8",
        );
      },
    );
    const title = await readFile(
      join(brainData, "book", "briefe-an-engels-1844-1853", "00000-titel.md"),
      "utf8",
    );

    expect(requested).toEqual([
      "https://www.gutenberg.org/cache/epub/64327/pg64327-images.html",
    ]);
    expect(results).toEqual([
      { slug: "briefe-an-engels-1844-1853", entries: 3 },
    ]);
    expect(title).toContain("license: public-domain");
    expect(title).toContain("source: 'https://www.gutenberg.org/ebooks/64327'");
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

  it("applies the corrections for the work's volume", async () => {
    await importBooks(parseManifest(ocrManifest), brainData, fetchArchive, {
      "freud-1940-gw-13": [
        { page: 5, from: "rutscht ein", to: "rückt ein", by: "scan" },
      ],
    });
    const files = await Array.fromAsync(
      new Bun.Glob("**/*.md").scan(join(brainData, "book")),
    );
    const texts = await Promise.all(
      files.map((file) => readFile(join(brainData, "book", file), "utf8")),
    );

    expect(texts.join("\n")).toContain("rückt ein Wort");
  });

  it("names a transcription of a work to check its OCR against", () => {
    const manifest = parseManifest(
      ocrManifest +
        "    reference: https://www.gutenberg.org/cache/epub/28220/pg28220.txt\n",
    );

    expect(
      manifest.books[0]?.source === "archive-ocr"
        ? manifest.books[0].reference
        : null,
    ).toBe("https://www.gutenberg.org/cache/epub/28220/pg28220.txt");
  });

  it("reads a corrections file by volume", () => {
    expect(
      parseCorrections(`
freud-1940-gw-13:
  - page: 5
    from: rutscht ein
    to: rückt ein
    by: reference
`),
    ).toEqual({
      "freud-1940-gw-13": [
        { page: 5, from: "rutscht ein", to: "rückt ein", by: "reference" },
      ],
    });
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
