import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bookAdapter, bookSectionAdapter } from "@brains/book";
import {
  importBooks,
  ocrVolumeHocr,
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
    expect(await readdir(join(brainData, "book"))).toEqual([
      "erfundenes-buch.md",
    ]);
    expect(
      (await readdir(join(brainData, "book-section/erfundenes-buch"))).sort(),
    ).toEqual(["00001-vorwort.md", "00002-1.md"]);
  });

  it("credits eKGWB on the book", async () => {
    await importBooks(parseManifest(manifestYaml), brainData, fetchFixture);
    const title = await readFile(
      join(brainData, "book/erfundenes-buch.md"),
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
      join(brainData, "book/erfundenes-buch.md"),
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
      join(brainData, "book/erfundenes-buch.md"),
      "utf8",
    );

    expect(
      bookAdapter.parseFrontMatter(title, bookAdapter.frontmatterSchema),
    ).toMatchObject({ published: false, shortTitle: "Erfunden" });
  });

  it("counts a book as published unless the manifest says otherwise", async () => {
    await importBooks(parseManifest(manifestYaml), brainData, fetchFixture);
    const title = await readFile(
      join(brainData, "book/erfundenes-buch.md"),
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

describe("importBooks with a book of several parts", () => {
  let brainData: string;
  const requested: string[] = [];
  const partsYaml = `
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
`;

  beforeEach(async () => {
    brainData = await mkdtemp(join(tmpdir(), "book-import-parts-"));
    requested.length = 0;
  });

  afterEach(async () => {
    await rm(brainData, { recursive: true, force: true });
  });

  /** The flat fixture, keyed to whichever siglum is asked for. */
  async function fetchPart(url: string): Promise<string> {
    requested.push(url);
    const siglum = url.split("/").at(-2) ?? "";
    const html = await readFile(
      join(import.meta.dir, "fixtures", "ekgwb-flat.html"),
      "utf8",
    );
    return html.replaceAll("EB-", `${siglum}-`);
  }

  async function entries(): Promise<Record<string, unknown>[]> {
    const root = join(brainData, "book-section/erfundenes-werk");
    const files = await readdir(root, { recursive: true });
    const parsed = await Promise.all(
      files
        .filter((file) => file.endsWith(".md"))
        .map(async (file) =>
          bookSectionAdapter.parseFrontMatter(
            await readFile(join(root, file), "utf8"),
            bookSectionAdapter.frontmatterSchema,
          ),
        ),
    );
    return parsed.sort(
      (left, right) => Number(left["order"]) - Number(right["order"]),
    );
  }

  it("joins the parts into one book, numbered across them", async () => {
    const results = await importBooks(
      parseManifest(partsYaml),
      brainData,
      fetchPart,
    );

    expect(requested).toEqual([
      "http://www.nietzschesource.org/eKGWB/EB-I/print",
      "http://www.nietzschesource.org/eKGWB/EB-II/print",
    ]);
    expect(results).toEqual([{ slug: "erfundenes-werk", entries: 5 }]);
    const sections = await entries();
    expect(sections.map((entry) => entry["order"])).toEqual([1, 2, 3, 4]);
    expect(sections.map((entry) => entry["headings"])).toEqual([
      ["Erster Theil"],
      ["Erster Theil"],
      ["Zweiter Theil"],
      ["Zweiter Theil"],
    ]);
    expect(sections.map((entry) => entry["section"])).toEqual([
      "EB-I-Vorwort",
      "EB-I-1",
      "EB-II-Vorwort",
      "EB-II-1",
    ]);
  });

  it("titles the book from the manifest and lists its parts", async () => {
    await importBooks(parseManifest(partsYaml), brainData, fetchPart);
    const title = await readFile(
      join(brainData, "book/erfundenes-werk.md"),
      "utf8",
    );

    expect(
      bookAdapter.parseFrontMatter(title, bookAdapter.frontmatterSchema),
    ).toMatchObject({ title: "Erfundenes Werk", sections: 4 });
    expect(title).toContain("[Erster Theil]");
    expect(title).toContain("[Zweiter Theil]");
  });

  it("rejects a book that names both a siglum and parts", () => {
    expect(() =>
      parseManifest(
        partsYaml.replace("kind: work", "kind: work\n    siglum: EB"),
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
      join(brainData, "book", "das-kapital-1.md"),
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
        "briefe-aus-den-deutsch-franzoesischen-jahrbuechern.md",
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
      join(brainData, "book", "briefe-an-engels-1844-1853.md"),
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

describe("importBooks from MEGAdigital letters", () => {
  let brainData: string;

  beforeEach(async () => {
    brainData = await mkdtemp(join(tmpdir(), "book-import-mega-"));
  });

  afterEach(async () => {
    await rm(brainData, { recursive: true, force: true });
  });

  it("reads the writer's letters in the manifest's language and credits the edition", async () => {
    const listing = `<documents xmlns="http://www.tei-c.org/ns/1.0">
<document><uri>https://megadigital.bbaw.de/M0000300.xml</uri><title>
  Karl Marx an Ferdinand Freiligrath in London. London, Samstag, 20. Juli 1867</title></document>
<document><uri>https://megadigital.bbaw.de/M0000175.xml</uri><title>Karl Marx an Collet Dobson Collet in London. London, Mittwoch, 26. September 1866</title></document>
<document><uri>https://megadigital.bbaw.de/M0000301.xml</uri><title>Ferdinand Freiligrath an Karl Marx in London. London, Samstag, 20. Juli 1867</title></document>
<document><uri>https://megadigital.bbaw.de/M0001374.xml</uri><title>Marx Karl</title></document>
</documents>`;
    const letters: Record<string, string> = {
      M0000300: "mega-letter-de.xml",
      M0000175: "mega-letter-en.xml",
    };
    const requested: string[] = [];
    const results = await importBooks(
      parseManifest(`
source: mega-letters
books:
  - writer: Karl Marx
    language: de
    slug: briefe-1866-1871
    title: Briefe 1866–1871
    edition: MEGAdigital, Briefe 1866–1871
    author: Karl Marx
    year: 1866
    published: false
    kind: letters
`),
      brainData,
      async (url) => {
        requested.push(url);
        const id = /(M\d+)\.xml$/.exec(url)?.[1];
        const name = id ? letters[id] : undefined;
        return name
          ? readFile(join(import.meta.dir, "fixtures", name), "utf8")
          : listing;
      },
    );
    const title = await readFile(
      join(brainData, "book", "briefe-1866-1871.md"),
      "utf8",
    );

    expect(requested).toEqual([
      "https://megadigital.bbaw.de/api/v2/tei-xml.xql",
      "https://megadigital.bbaw.de/M0000300.xml",
      "https://megadigital.bbaw.de/M0000175.xml",
    ]);
    expect(results).toEqual([{ slug: "briefe-1866-1871", entries: 2 }]);
    expect(title).toContain("license: CC-BY-SA-4.0");
    expect(title).toContain("MEGAdigital");
  });
});

describe("importBooks from MEGAdigital's Kapital volumes", () => {
  let brainData: string;

  beforeEach(async () => {
    brainData = await mkdtemp(join(tmpdir(), "book-import-mega-etx-"));
  });

  afterEach(async () => {
    await rm(brainData, { recursive: true, force: true });
  });

  it("reads a work over its volumes and credits the transcription", async () => {
    const requested: string[] = [];
    const results = await importBooks(
      parseManifest(`
source: mega-etx
books:
  - citation: MEGA² II/1
    parts:
      - file: MEGA_A2_B001-01_ETX.xml
        text: Grundrisse der Kritik der politischen Ökonomie Erster Teil
      - file: MEGA_A2_B001-02_ETX.xml
        text: Grundrisse der Kritik der politischen Ökonomie Zweiter Teil
    slug: grundrisse
    title: Grundrisse der Kritik der politischen Ökonomie
    edition: MEGA² II/1 (Berlin 1976–1981)
    author: Karl Marx
    year: 1939
    published: false
    kind: nachlass
`),
      brainData,
      async (url) => {
        requested.push(url);
        return readFile(
          join(
            import.meta.dir,
            "fixtures",
            url.endsWith("01_ETX.xml") ? "mega-etx-1.xml" : "mega-etx-2.xml",
          ),
          "utf8",
        );
      },
    );
    const title = await readFile(
      join(brainData, "book", "grundrisse.md"),
      "utf8",
    );

    expect(requested).toEqual([
      "https://telota.bbaw.de/mega/docs/MEGA_A2_B001-01_ETX.xml",
      "https://telota.bbaw.de/mega/docs/MEGA_A2_B001-02_ETX.xml",
    ]);
    expect(results).toEqual([{ slug: "grundrisse", entries: 2 }]);
    expect(title).toContain("license: public-domain");
    expect(title).toContain("MEGAdigital");
  });
});

describe("importBooks from scanned volumes", () => {
  const ocrManifest = `
source: archive-ocr
books:
  - item: freud-1940-gw-13
    citation: GW XIII
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
        metadata: {
          title: "Gesammelte Werke. XIII. Band",
          date: "1940",
          imagecount: 21,
        },
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

  it("reads the scan anew with the OCR model a work names, page by page", async () => {
    const volume = await readFile(
      join(import.meta.dir, "fixtures", "archive-ocr-gw.html"),
      "utf8",
    );
    // The fixture's pages, as Tesseract would return each by itself.
    const pageAt = (leaf: number): string => {
      const div = volume
        .split(/(?=<div class='ocr_page')/)
        .find((chunk) =>
          chunk.startsWith(
            `<div class='ocr_page' id='page_${String(leaf).padStart(6, "0")}'`,
          ),
        );
      const page =
        div?.replace(/<\/body>[\s\S]*$/, "") ??
        "<div class='ocr_page' id='page_1' title='bbox 0 0 2600 4400'></div>";
      return `<html><body>${page}</body></html>`;
    };
    const recognised: string[] = [];
    const files = async (dir: string): Promise<string[]> => {
      const names = await Array.fromAsync(new Bun.Glob("**/*.md").scan(dir));
      return Promise.all(
        names.sort().map((name) => readFile(join(dir, name), "utf8")),
      );
    };

    await importBooks(parseManifest(ocrManifest), brainData, fetchArchive);
    const fromArchive = await files(join(brainData, "book"));
    await rm(join(brainData, "book"), { recursive: true, force: true });
    requested.length = 0;
    await importBooks(
      parseManifest(ocrManifest + "    ocr: frk\n"),
      brainData,
      fetchArchive,
      {
        pageOcr:
          (model) =>
          async (url): Promise<string> => {
            recognised.push(`${model} ${url}`);
            const leaf = Number(/\/n(\d+)_w1600\.jpg$/.exec(url)?.[1]);
            return pageAt(leaf);
          },
      },
    );

    expect(requested).toEqual([
      "https://archive.org/metadata/freud-1940-gw-13",
    ]);
    expect(recognised).toHaveLength(21);
    expect(recognised[0]).toBe(
      "frk https://archive.org/download/freud-1940-gw-13/page/n0_w1600.jpg",
    );
    expect(await files(join(brainData, "book"))).toEqual(fromArchive);
  });

  it("counts an uploaded scan's pages in its scandata, read from the item's own server, where its metadata has no image count", async () => {
    const scandata = (leaves: boolean[]): string =>
      `<book><pageData>${leaves
        .map(
          (access, leaf) =>
            `<page leafNum="${leaf}"><addToAccessFormats>${access}</addToAccessFormats></page>`,
        )
        .join("")}</pageData></book>`;
    const uploaded = async (url: string): Promise<string> => {
      requested.push(url);
      if (url === "https://archive.org/metadata/mehring-nachlass-1") {
        return JSON.stringify({
          server: "ia801004.us.archive.org",
          dir: "/25/items/mehring-nachlass-1",
          metadata: { title: "Mehring Nachlass 1" },
          files: [
            { name: "Mehring Nachlass 1.pdf", format: "Image Container PDF" },
            { name: "Mehring Nachlass 1_scandata.xml", format: "Scandata" },
          ],
        });
      }
      return scandata([true, true, false, true]);
    };
    const recognised: string[] = [];

    await ocrVolumeHocr("mehring-nachlass-1", uploaded, async (url) => {
      recognised.push(url);
      return "<html><body><div class='ocr_page' id='page_1'></div></body></html>";
    });

    expect(requested).toEqual([
      "https://archive.org/metadata/mehring-nachlass-1",
      "https://ia801004.us.archive.org/25/items/mehring-nachlass-1/Mehring%20Nachlass%201_scandata.xml",
    ]);
    expect(recognised).toHaveLength(3);
  });

  it("reads as many pages as the page numbers file lists, which leaves out the scan's colour cards", async () => {
    const scanned = async (url: string): Promise<string> => {
      requested.push(url);
      if (url === "https://archive.org/metadata/theorienberden01marxuoft") {
        return JSON.stringify({
          server: "ia802803.us.archive.org",
          dir: "/3/items/theorienberden01marxuoft",
          metadata: { title: "Theorien über den Mehrwert", imagecount: 6 },
          files: [
            {
              name: "theorienberden01marxuoft_page_numbers.json",
              format: "Page Numbers JSON",
            },
          ],
        });
      }
      return JSON.stringify({
        pages: [1, 2, 3, 4].map((leafNum) => ({ leafNum, pageNumber: "" })),
      });
    };
    const recognised: string[] = [];

    await ocrVolumeHocr("theorienberden01marxuoft", scanned, async (url) => {
      recognised.push(url);
      return "<html><body><div class='ocr_page' id='page_1'></div></body></html>";
    });

    expect(requested).toEqual([
      "https://archive.org/metadata/theorienberden01marxuoft",
      "https://ia802803.us.archive.org/3/items/theorienberden01marxuoft/theorienberden01marxuoft_page_numbers.json",
    ]);
    expect(recognised).toHaveLength(4);
  });

  it("applies the corrections for the work's volume", async () => {
    await importBooks(parseManifest(ocrManifest), brainData, fetchArchive, {
      corrections: {
        "freud-1940-gw-13": [
          { page: 5, from: "rutscht ein", to: "rückt ein", by: "scan" },
        ],
      },
    });
    const files = await Array.fromAsync(
      new Bun.Glob("book-section/**/*.md").scan(brainData),
    );
    const texts = await Promise.all(
      files.map((file) => readFile(join(brainData, file), "utf8")),
    );

    expect(texts.join("\n")).toContain("rückt ein Wort");
  });

  it("names the transcriptions of a work to check its OCR against", () => {
    const manifest = parseManifest(
      ocrManifest +
        "    references:\n      - https://example.org/kapitel-1.htm\n      - https://example.org/kapitel-2.htm\n",
    );

    expect(
      manifest.books[0]?.source === "archive-ocr"
        ? manifest.books[0].references
        : null,
    ).toEqual([
      "https://example.org/kapitel-1.htm",
      "https://example.org/kapitel-2.htm",
    ]);
  });

  it("names the notes of a work to leave out, by page and opening words", () => {
    const manifest = parseManifest(
      ocrManifest +
        '    skipNotes:\n      - { page: 4, opens: "¹) Vgl." }\n      - { page: XXX, opens: "*) Titre" }\n',
    );

    expect(
      manifest.books[0]?.source === "archive-ocr"
        ? manifest.books[0].skipNotes
        : null,
    ).toEqual([
      { page: 4, opens: "¹) Vgl." },
      { page: "XXX", opens: "*) Titre" },
    ]);
  });

  it("names an editor's signatures, whose notes are left out", () => {
    const manifest = parseManifest(ocrManifest + "    skipNotesSigned: [K.]\n");

    expect(
      manifest.books[0]?.source === "archive-ocr"
        ? manifest.books[0].skipNotesSigned
        : null,
    ).toEqual(["K."]);
  });

  it("names an edition that sets its notes as large as the text", () => {
    const manifest = parseManifest(ocrManifest + "    spacedNotes: true\n");

    expect(
      manifest.books[0]?.source === "archive-ocr"
        ? manifest.books[0].spacedNotes
        : null,
    ).toBe(true);
  });

  it("names a volume of newspaper articles, each titled above its dateline", () => {
    const manifest = parseManifest(ocrManifest + "    datelined: true\n");

    expect(
      manifest.books[0]?.source === "archive-ocr"
        ? manifest.books[0].datelined
        : null,
    ).toBe(true);
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
      join(brainData, "book/jenseits-des-lustprinzips.md"),
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
