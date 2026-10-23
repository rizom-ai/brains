import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bookAdapter, bookSectionAdapter } from "@brains/book";
import { deferred } from "@brains/utils/deferred";
import {
  fetchVolumeHocr,
  firstOfEachVolume,
  importBooks,
  ocrVolumeHocr,
  parseCorrections,
  parseManifest,
  scannedBooks,
  type ScannedBook,
  volumeHocr,
  volumeKey,
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
    expect((await readdir(join(brainData, "book"))).sort()).toEqual([
      "erfundenes-buch",
      "erfundenes-buch.md",
    ]);
    expect(
      (await readdir(join(brainData, "book/erfundenes-buch"))).sort(),
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
    const root = join(brainData, "book/erfundenes-werk");
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

  /** The Kapital fixture, its header linking another licence. */
  async function underLicence(target: string): Promise<string> {
    return (
      await readFile(
        join(import.meta.dir, "fixtures", "dta-kapital.xml"),
        "utf8",
      )
    ).replace(/<licence target="[^"]*"/u, `<licence target="${target}"`);
  }

  const kapital = parseManifest(`
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
`);

  it("reads a work the Textarchiv dedicates to the public domain as public domain", async () => {
    const licence = "http://creativecommons.org/publicdomain/zero/1.0/";
    await importBooks(kapital, brainData, async () => underLicence(licence));
    const title = await readFile(
      join(brainData, "book", "das-kapital-1.md"),
      "utf8",
    );

    expect(title).toContain("license: public-domain");
    // The front matter folds long values over lines.
    expect(title.replace(/\s+/gu, " ")).toContain(
      `Deutsches Textarchiv (deutschestextarchiv.de), ${licence}`,
    );
  });

  it("refuses a work under a licence that does not allow its reuse", async () => {
    expect(
      importBooks(kapital, brainData, async () =>
        underLicence("https://creativecommons.org/licenses/by-nc/4.0/"),
      ),
    ).rejects.toThrow(
      "marx_kapital01_1867 is neither under CC BY-SA nor in the public domain",
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
  it("reads a work from the Wikisource it is on, from its first heading to its end", async () => {
    const requested: string[] = [];
    const results = await importBooks(
      parseManifest(`
source: wikisource
books:
  - page: Misère de la philosophie/Texte entier
    site: fr.wikisource.org
    citation: Misère
    slug: misere-de-la-philosophie
    title: Misère de la philosophie
    edition: "Misère de la philosophie (Paris 1896)"
    author: Karl Marx
    year: 1847
    kind: work
    from: Chapitre premier
    until: Appendice I
    textHeadings: ["Et propter vitam vivendi perdere causas !", "Variante."]
`),
      brainData,
      async (url) => {
        requested.push(url);
        const html = await readFile(
          join(import.meta.dir, "fixtures", "wikisource-misere.html"),
          "utf8",
        );
        return JSON.stringify({ parse: { text: html } });
      },
    );
    const title = await readFile(
      join(brainData, "book", "misere-de-la-philosophie.md"),
      "utf8",
    );

    expect(requested).toEqual([
      "https://fr.wikisource.org/w/api.php?action=parse&page=Mis%C3%A8re+de+la+philosophie%2FTexte+entier&prop=text&format=json&formatversion=2",
    ]);
    expect(results).toEqual([{ slug: "misere-de-la-philosophie", entries: 5 }]);
    expect(title).toContain("Wikisource (fr.wikisource.org)");
    expect(title).toContain(
      "source: 'https://fr.wikisource.org/wiki/Mis%C3%A8re_de_la_philosophie%2FTexte_entier'",
    );
  });
  it("reads a work set out over several pages, in their order", async () => {
    const requested: string[] = [];
    const fixtures: Record<string, string> = {
      "The Civil War in France (1871)/Chapter 1": "wikisource-civil-war-1.html",
      "The Civil War in France (1871)/Notes": "wikisource-civil-war-notes.html",
    };
    const results = await importBooks(
      parseManifest(`
source: wikisource
books:
  - page: The Civil War in France (1871)
    pages:
      - The Civil War in France (1871)/Chapter 1
      - The Civil War in France (1871)/Notes
    site: en.wikisource.org
    citation: Civil War
    slug: the-civil-war-in-france
    title: The Civil War in France
    edition: "The Civil War in France (London, Edward Truelove, 1871), second edition, revised"
    author: Karl Marx
    year: 1871
    kind: work
`),
      brainData,
      async (url) => {
        requested.push(url);
        const page = new URL(url).searchParams.get("page") ?? "";
        const html = await readFile(
          join(import.meta.dir, "fixtures", fixtures[page] ?? ""),
          "utf8",
        );
        return JSON.stringify({ parse: { text: html } });
      },
    );
    const title = await readFile(
      join(brainData, "book", "the-civil-war-in-france.md"),
      "utf8",
    );

    expect(
      requested.map((url) => new URL(url).searchParams.get("page")),
    ).toEqual([
      "The Civil War in France (1871)/Chapter 1",
      "The Civil War in France (1871)/Notes",
    ]);
    expect(results).toEqual([{ slug: "the-civil-war-in-france", entries: 3 }]);
    expect(title).toContain(
      "source: 'https://en.wikisource.org/wiki/The_Civil_War_in_France_(1871)'",
    );
  });
});

describe("importBooks from Project Gutenberg", () => {
  let brainData: string;

  beforeEach(async () => {
    brainData = await mkdtemp(join(tmpdir(), "book-import-gutenberg-"));
  });

  afterEach(async () => {
    await rm(brainData, { recursive: true, force: true });
  });

  it("reads an ebook's transcription, cited by its printed pages, and credits the project", async () => {
    const requested: string[] = [];
    const results = await importBooks(
      parseManifest(`
source: gutenberg
books:
  - ebook: 32370
    citation: Diplomatic History
    from: Chapter I
    printedNotes: true
    slug: secret-diplomatic-history-of-the-eighteenth-century
    title: Secret Diplomatic History of the Eighteenth Century
    edition: "Secret Diplomatic History of the Eighteenth Century (London, Swan Sonnenschein, 1899)"
    author: Karl Marx
    year: 1856
    kind: work
`),
      brainData,
      async (url) => {
        requested.push(url);
        return readFile(
          join(import.meta.dir, "fixtures", "gutenberg-secret-diplomatic.html"),
          "utf8",
        );
      },
    );
    const title = await readFile(
      join(
        brainData,
        "book",
        "secret-diplomatic-history-of-the-eighteenth-century.md",
      ),
      "utf8",
    );

    expect(requested).toEqual([
      "https://www.gutenberg.org/cache/epub/32370/pg32370-images.html",
    ]);
    expect(results).toEqual([
      {
        slug: "secret-diplomatic-history-of-the-eighteenth-century",
        entries: 3,
      },
    ]);
    expect(title).toContain("Project Gutenberg");
    expect(title).toContain("source: 'https://www.gutenberg.org/ebooks/32370'");
  });
});

describe("importBooks from mlwerke.de", () => {
  let brainData: string;

  beforeEach(async () => {
    brainData = await mkdtemp(join(tmpdir(), "book-import-mlwerke-"));
  });

  afterEach(async () => {
    await rm(brainData, { recursive: true, force: true });
  });

  it("reads a work page by page from its archived pages and credits the transcription", async () => {
    const page471 =
      "https://web.archive.org/web/2009id_/http://www.mlwerke.de/me/me40/me40_471.htm";
    const page533 =
      "https://web.archive.org/web/2009id_/http://www.mlwerke.de/me/me40/me40_533.htm";
    const requested: string[] = [];
    const results = await importBooks(
      parseManifest(`
books:
  - source: mlwerke
    pages: [${page471}, ${page533}]
    citation: Manuskripte 1844
    slug: oekonomisch-philosophische-manuskripte
    title: Ökonomisch-philosophische Manuskripte aus dem Jahre 1844
    edition: "Marx-Engels-Werke, Ergänzungsband, 1. Teil (Berlin, Dietz, 1968), S. 465–588"
    author: Karl Marx
    year: 1844
    published: false
    kind: work
`),
      brainData,
      async (url) => {
        requested.push(url);
        return readFile(
          join(
            import.meta.dir,
            "fixtures",
            url.endsWith("471.htm")
              ? "mlwerke-opm-471.html"
              : "mlwerke-opm-533.html",
          ),
          "utf8",
        );
      },
    );
    const title = await readFile(
      join(brainData, "book", "oekonomisch-philosophische-manuskripte.md"),
      "utf8",
    );

    expect(requested).toEqual([page471, page533]);
    expect(results).toEqual([
      { slug: "oekonomisch-philosophische-manuskripte", entries: 3 },
    ]);
    expect(title).toContain("license: public-domain");
    expect(title).toContain("Marxists Internet Archive");
    expect(title).toContain(`source: '${page471}'`);
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
      parseManifest(ocrManifest + "    ocr: frk\n    binarise: true\n"),
      brainData,
      fetchArchive,
      {
        pageOcr:
          ({ model, binarise }) =>
          async (url): Promise<string> => {
            recognised.push(`${model}${binarise ? " binarised" : ""} ${url}`);
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
      "frk binarised https://archive.org/download/freud-1940-gw-13/page/n0_w1600.jpg",
    );
    expect(await files(join(brainData, "book"))).toEqual(fromArchive);
  });

  it("reads a work that quotes Greek with the Greek model as well, page by page", async () => {
    const volume = await readFile(
      join(import.meta.dir, "fixtures", "archive-ocr-gw.html"),
      "utf8",
    );
    const pages = volume.split(/(?=<div class='ocr_page')/).slice(1);
    const recognised: string[] = [];

    const results = await importBooks(
      parseManifest(ocrManifest + "    ocr: deu\n    greek: true\n"),
      brainData,
      fetchArchive,
      {
        pageOcr:
          ({ model }) =>
          async (url): Promise<string> => {
            recognised.push(`${model} ${url}`);
            const leaf = Number(/\/n(\d+)_w1600\.jpg$/.exec(url)?.[1]);
            const page = (pages[leaf] ?? "").replace(/<\/body>[\s\S]*$/, "");
            return `<html><body>${page}</body></html>`;
          },
      },
    );

    const first =
      "https://archive.org/download/freud-1940-gw-13/page/n0_w1600.jpg";
    expect(results).toEqual([
      { slug: "jenseits-des-lustprinzips", entries: 3 },
    ]);
    const greekRead = recognised
      .filter((entry) => entry.startsWith("grc_agocr "))
      .map((entry) => entry.slice("grc_agocr ".length));
    expect(recognised).toContain(`deu ${first}`);
    expect(greekRead.length).toBeGreaterThan(0);
    expect(greekRead.every((url) => recognised.includes(`deu ${url}`))).toBe(
      true,
    );
  });

  it("reads several of a volume's pages at once", async () => {
    const volume = await readFile(
      join(import.meta.dir, "fixtures", "archive-ocr-gw.html"),
      "utf8",
    );
    const pages = volume.split(/(?=<div class='ocr_page')/).slice(1);
    // The first page is read only once the second is being read: a reader
    // that reads one page after another never gets to the second.
    const secondStarted = deferred();

    const results = await importBooks(
      parseManifest(ocrManifest + "    ocr: deu\n"),
      brainData,
      fetchArchive,
      {
        pageOcr:
          () =>
          async (url): Promise<string> => {
            const leaf = Number(/\/n(\d+)_w1600\.jpg$/.exec(url)?.[1]);
            if (leaf === 1) secondStarted.resolve();
            if (leaf === 0) await secondStarted.promise;
            const page = (pages[leaf] ?? "").replace(/<\/body>[\s\S]*$/, "");
            return `<html><body>${page}</body></html>`;
          },
      },
    );

    expect(results).toEqual([
      { slug: "jenseits-des-lustprinzips", entries: 3 },
    ]);
  });

  it("reads a binarised work's Greek from its page as scanned", async () => {
    const volume = await readFile(
      join(import.meta.dir, "fixtures", "archive-ocr-gw.html"),
      "utf8",
    );
    const pages = volume.split(/(?=<div class='ocr_page')/).slice(1);
    const readings = new Set<string>();

    await importBooks(
      parseManifest(
        ocrManifest + "    ocr: deu\n    binarise: true\n    greek: true\n",
      ),
      brainData,
      fetchArchive,
      {
        pageOcr:
          ({ model, binarise }) =>
          async (url): Promise<string> => {
            readings.add(`${model}${binarise ? " binarised" : ""}`);
            const leaf = Number(/\/n(\d+)_w1600\.jpg$/.exec(url)?.[1]);
            const page = (pages[leaf] ?? "").replace(/<\/body>[\s\S]*$/, "");
            return `<html><body>${page}</body></html>`;
          },
      },
    );

    expect([...readings].sort()).toEqual(["deu binarised", "grc_agocr"]);
  });

  it("keeps a page as its own model read it where the Greek model fails on it", async () => {
    const volume = await readFile(
      join(import.meta.dir, "fixtures", "archive-ocr-gw.html"),
      "utf8",
    );
    const pages = volume.split(/(?=<div class='ocr_page')/).slice(1);
    const page = (url: string): string => {
      const leaf = Number(/\/n(\d+)_w1600\.jpg$/.exec(url)?.[1]);
      return `<html><body>${(pages[leaf] ?? "").replace(/<\/body>[\s\S]*$/, "")}</body></html>`;
    };

    const results = await importBooks(
      parseManifest(ocrManifest + "    ocr: deu\n    greek: true\n"),
      brainData,
      fetchArchive,
      {
        pageOcr:
          ({ model }) =>
          async (url): Promise<string> => {
            if (model === "grc_agocr")
              throw new Error("tesseract failed (134)");
            return page(url);
          },
      },
    );

    expect(results).toEqual([
      { slug: "jenseits-des-lustprinzips", entries: 3 },
    ]);
  });

  it("reads no page with the Greek model that its own model read no words on", async () => {
    const recognised: string[] = [];
    const blank =
      "<html><body><div class='ocr_page' id='page_1' title='bbox 0 0 2600 4400'></div></body></html>";

    await importBooks(
      parseManifest(ocrManifest + "    ocr: deu\n    greek: true\n"),
      brainData,
      fetchArchive,
      {
        pageOcr:
          ({ model }) =>
          async (url): Promise<string> => {
            recognised.push(`${model} ${url}`);
            return blank;
          },
      },
    ).catch((error: unknown) => {
      // A volume of blank pages holds no work; only the readings matter here.
      expect(String(error)).toContain("jenseits-des-lustprinzips");
    });

    expect(recognised.length).toBeGreaterThan(0);
    expect(recognised.filter((entry) => entry.startsWith("grc_agocr"))).toEqual(
      [],
    );
  });

  it("reads a scan another library holds from the page images the work lists, and names that library", async () => {
    const volume = await readFile(
      join(import.meta.dir, "fixtures", "archive-ocr-gw.html"),
      "utf8",
    );
    const pages = volume.split(/(?=<div class='ocr_page')/).slice(1);
    const images = pages.map(
      (_, leaf) =>
        `https://polona.pl/iiif/3/leaf-${leaf}/full/max/0/default.jpg`,
    );
    const recognised: string[] = [];

    await importBooks(
      parseManifest(
        ocrManifest +
          "    ocr: fra\n    scan:\n      library: Polona\n      url: https://polona.pl/item-view/gw-13\n      pages:\n" +
          images.map((image) => `        - ${image}\n`).join(""),
      ),
      brainData,
      fetchArchive,
      {
        pageOcr:
          ({ model }) =>
          async (url): Promise<string> => {
            recognised.push(`${model} ${url}`);
            const leaf = Number(/leaf-(\d+)\//.exec(url)?.[1]);
            const page = (pages[leaf] ?? "").replace(/<\/body>[\s\S]*$/, "");
            return `<html><body>${page}</body></html>`;
          },
      },
    );
    const book = await readFile(
      join(brainData, "book", "jenseits-des-lustprinzips.md"),
      "utf8",
    );
    const [first] = (
      await Array.fromAsync(
        new Bun.Glob("jenseits-des-lustprinzips/*.md").scan(
          join(brainData, "book"),
        ),
      )
    ).sort();

    expect(requested).toEqual([]);
    expect(recognised).toEqual(images.map((image) => `fra ${image}`));
    expect(book).toContain(
      "attribution: 'Scan: Polona (polona.pl/item-view/gw-13)'",
    );
    expect(book).toContain("source: 'https://polona.pl/item-view/gw-13'");
    expect(
      await readFile(join(brainData, "book", first ?? "missing"), "utf8"),
    ).toMatch(
      /source: 'https:\/\/polona\.pl\/iiif\/3\/leaf-\d+\/full\/max\/0\/default\.jpg'/,
    );
  });

  it("numbers a scan's pages as the work lists them, pages of several volumes among them", async () => {
    const [book] = scannedBooks(
      parseManifest(
        ocrManifest +
          "    ocr: eng\n    scan:\n      library: Internet Archive\n      url: https://archive.org/details/cyclopaedia\n      pages:\n" +
          "        - { url: 'https://archive.org/download/cyclopaedia-2/page/n117.jpg#region=0.1,0.5,0.4,0.4', page: 105 }\n" +
          "        - { url: 'https://archive.org/download/cyclopaedia-3/page/n120.jpg', page: 108 }\n",
      ),
    );
    if (!book) throw new Error("No scanned book");
    const read: string[] = [];
    const hocr = await volumeHocr(
      book,
      fetchArchive,
      () =>
        async (url): Promise<string> => {
          read.push(url);
          return "<html><body><div class='ocr_page' id='page_1' title='bbox 0 0 100 100'></div></body></html>";
        },
    );

    expect(read).toEqual([
      "https://archive.org/download/cyclopaedia-2/page/n117.jpg#region=0.1,0.5,0.4,0.4",
      "https://archive.org/download/cyclopaedia-3/page/n120.jpg",
    ]);
    expect(hocr.match(/<span class='ocr_pageno'>\d+<\/span>/g)).toEqual([
      "<span class='ocr_pageno'>105</span>",
      "<span class='ocr_pageno'>108</span>",
    ]);
  });

  it("will not read a scan another library holds without an OCR model", () => {
    expect(() =>
      parseManifest(
        ocrManifest +
          "    scan:\n      library: Polona\n      url: https://polona.pl/item-view/gw-13\n      pages: [https://polona.pl/iiif/3/a/full/max/0/default.jpg]\n",
      ),
    ).toThrow();
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
      new Bun.Glob("book/*/**/*.md").scan(brainData),
    );
    const texts = await Promise.all(
      files.map((file) => readFile(join(brainData, file), "utf8")),
    );

    expect(texts.join("\n")).toContain("rückt ein Wort");
  });

  const piecesManifest = `
source: archive-ocr
books:
  - item: freud-1940-gw-13
    citation: GW XIII
    firstPage: 3
    lastPage: 6
    slug: kleine-schriften
    title: Kleine Schriften
    edition: Zeitschrift, Bd. I–II
    author: Sigmund Freud
    year: 1920
    kind: work
  - item: zeitschrift-2
    citation: Z II
    firstPage: 7
    lastPage: 10
    slug: kleine-schriften
    title: Kleine Schriften
    edition: Zeitschrift, Bd. I–II
    author: Sigmund Freud
    year: 1920
    kind: work
`;

  async function fetchTwoVolumes(url: string): Promise<string> {
    if (url === "https://archive.org/metadata/zeitschrift-2") {
      requested.push(url);
      return JSON.stringify({
        files: [{ name: "z2_hocr.html", format: "hOCR" }],
      });
    }
    return fetchArchive(url);
  }

  it("joins the entries that share a slug into one book, read from each one's volume in turn", async () => {
    const results = await importBooks(
      parseManifest(piecesManifest),
      brainData,
      fetchTwoVolumes,
    );
    const files = await Array.fromAsync(
      new Bun.Glob("book/kleine-schriften/*.md").scan(brainData),
    );
    const sections = await Promise.all(
      files
        .sort()
        .map(async (file) =>
          bookSectionAdapter.parseFrontMatter(
            await readFile(join(brainData, file), "utf8"),
            bookSectionAdapter.frontmatterSchema,
          ),
        ),
    );

    expect(results).toEqual([
      { slug: "kleine-schriften", entries: sections.length + 1 },
    ]);
    expect(requested).toContain(
      "https://archive.org/download/zeitschrift-2/z2_hocr.html",
    );
    expect(sections[0]?.["page"]).toBe("GW XIII, 3");
    expect(sections.at(-1)?.["source"]).toStartWith(
      "https://archive.org/details/zeitschrift-2/",
    );
  });

  it("sets each entry's sections under the part it names", async () => {
    const parted = piecesManifest
      .replace(
        "    citation: GW XIII\n",
        "    citation: GW XIII\n    part: Aus den Gesammelten Werken\n",
      )
      .replace(
        "    citation: Z II\n",
        "    citation: Z II\n    part: Aus der Zeitschrift\n",
      );
    await importBooks(parseManifest(parted), brainData, fetchTwoVolumes);
    const files = (
      await Array.fromAsync(
        new Bun.Glob("book/kleine-schriften/**/*.md").scan(brainData),
      )
    ).sort();
    const headingsOf = async (file: string): Promise<unknown> =>
      bookSectionAdapter.parseFrontMatter(
        await readFile(join(brainData, file), "utf8"),
        bookSectionAdapter.frontmatterSchema,
      )["headings"];
    const first = files[0];
    const last = files.at(-1);
    if (!first || !last) throw new Error("Expected sections");

    expect(await headingsOf(first)).toEqual(
      expect.arrayContaining(["Aus den Gesammelten Werken"]),
    );
    expect(await headingsOf(last)).toEqual(
      expect.arrayContaining(["Aus der Zeitschrift"]),
    );
  });

  it("credits the scan of each volume a book is read from", async () => {
    await importBooks(
      parseManifest(piecesManifest),
      brainData,
      fetchTwoVolumes,
    );
    const title = await readFile(
      join(brainData, "book/kleine-schriften.md"),
      "utf8",
    );

    expect(title).toContain("archive.org/details/freud-1940-gw-13");
    expect(title).toContain("archive.org/details/zeitschrift-2");
  });

  it("rejects entries that share a slug but not the book's title", () => {
    expect(() =>
      parseManifest(
        piecesManifest.replace(
          /(zeitschrift-2[\s\S]*?title: )Kleine Schriften/u,
          "$1Andere",
        ),
      ),
    ).toThrow("share a slug");
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

  it("names a note's lines by page, one of them running on the note before", () => {
    const manifest = parseManifest(
      ocrManifest +
        '    notes:\n      - { page: 4, opens: "1 Vgl." }\n      - { page: 5, opens: "und weiter", runsOn: true }\n',
    );

    expect(
      manifest.books[0]?.source === "archive-ocr"
        ? manifest.books[0].notes
        : null,
    ).toEqual([
      { page: 4, opens: "1 Vgl." },
      { page: 5, opens: "und weiter", runsOn: true },
    ]);
  });

  it("names a heading's level and its label as printed, or a heading without one", () => {
    const manifest = parseManifest(
      ocrManifest +
        '    headings:\n      - { page: 4, opens: "IIa. Geschichte", level: 1, label: IIa }\n      - { page: 5, opens: "B. Leichte", level: 2, label: B }\n      - { page: 6, opens: "Einleitung", level: 1 }\n      - { page: 7, opens: "Paris war", numeral: II }\n',
    );

    expect(
      manifest.books[0]?.source === "archive-ocr"
        ? manifest.books[0].headings
        : null,
    ).toEqual([
      { page: 4, opens: "IIa. Geschichte", level: 1, label: "IIa" },
      { page: 5, opens: "B. Leichte", level: 2, label: "B" },
      { page: 6, opens: "Einleitung", level: 1 },
      { page: 7, opens: "Paris war", numeral: "II" },
    ]);
  });

  it.each([
    ["a label without its level", '{ page: 4, opens: "B. Leichte", label: B }'],
    ["a level past the deepest", '{ page: 4, opens: "B. Leichte", level: 5 }'],
    [
      "a lost numeral beside a level",
      '{ page: 4, opens: "Paris", level: 1, numeral: II }',
    ],
  ])("refuses a heading with %s", (_, heading) => {
    expect(() =>
      parseManifest(`${ocrManifest}    headings:\n      - ${heading}\n`),
    ).toThrow();
  });

  it("names an editor's signatures, whose notes are left out", () => {
    const manifest = parseManifest(ocrManifest + "    skipNotesSigned: [K.]\n");

    expect(
      manifest.books[0]?.source === "archive-ocr"
        ? manifest.books[0].skipNotesSigned
        : null,
    ).toEqual(["K."]);
  });

  it("names the words the scan shows printed so, which no dictionary knows", () => {
    const manifest = parseManifest(
      ocrManifest + "    printedWords: [Glaceephrasen, Sieyes]\n",
    );

    expect(
      manifest.books[0]?.source === "archive-ocr"
        ? manifest.books[0].printedWords
        : null,
    ).toEqual(["Glaceephrasen", "Sieyes"]);
  });

  it("names the lines that open paragraphs on a page the OCR set askew", () => {
    const manifest = parseManifest(
      ocrManifest +
        "    paragraphs:\n      - { page: 19, opens: Vor dieser Jury }\n",
    );

    expect(
      manifest.books[0]?.source === "archive-ocr"
        ? manifest.books[0].paragraphs
        : null,
    ).toEqual([{ page: 19, opens: "Vor dieser Jury" }]);
  });

  it("names the lines that open notes the OCR set as the text", () => {
    const manifest = parseManifest(
      ocrManifest + "    notes:\n      - { page: 188, opens: Im Manuskript }\n",
    );

    expect(
      manifest.books[0]?.source === "archive-ocr"
        ? manifest.books[0].notes
        : null,
    ).toEqual([{ page: 188, opens: "Im Manuskript" }]);
  });

  it("names a scan whose lines curve, so their starts tell no indent", () => {
    const manifest = parseManifest(ocrManifest + "    curved: true\n");

    expect(
      manifest.books[0]?.source === "archive-ocr"
        ? manifest.books[0].curved
        : null,
    ).toBe(true);
  });

  it("names an edition that sets its notes as large as the text", () => {
    const manifest = parseManifest(ocrManifest + "    spacedNotes: true\n");

    expect(
      manifest.books[0]?.source === "archive-ocr"
        ? manifest.books[0].spacedNotes
        : null,
    ).toBe(true);
  });

  it("names the line a work opens with, after another's end on its first page", () => {
    const manifest = parseManifest(
      ocrManifest + "    opensWith: London, 5. Mai 1875.\n",
    );

    expect(
      manifest.books[0]?.source === "archive-ocr"
        ? manifest.books[0].opensWith
        : null,
    ).toBe("London, 5. Mai 1875.");
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

describe("fetchVolumeHocr", () => {
  const fetchHocr =
    (hocr: string) =>
    async (url: string): Promise<string> =>
      url.includes("/metadata/")
        ? JSON.stringify({ files: [{ name: "x_hocr.html", format: "hOCR" }] })
        : hocr;

  it("reads an archive OCR that read Fraktur as roman type sets it", async () => {
    expect(
      await fetchVolumeHocr(
        "x",
        fetchHocr(
          "<span class='ocrx_word'>Geſellſchaft</span> <span class='ocrx_word'>ver⸗</span>",
        ),
      ),
    ).toBe(
      "<span class='ocrx_word'>Gesellschaft</span> <span class='ocrx_word'>ver-</span>",
    );
  });

  it("leaves an archive OCR of roman type as it read it", async () => {
    const roman = "<span class='ocrx_word'>Wort—</span>";

    expect(await fetchVolumeHocr("x", fetchHocr(roman))).toBe(roman);
  });

  it("keeps the leaves the item serves, numbered as its pages are, where its OCR also read a cover it does not serve", async () => {
    const page = (id: number, text: string): string =>
      `<div class='ocr_page' id='page_${String(id).padStart(6, "0")}' title='bbox 0 0 10 10'><span class='ocrx_word'>${text}</span></div>`;
    const volume = `<html><body>${page(0, "cover")}${page(1, "Titel")}${page(2, "Vorwort")}</body></html>`;

    const read = await fetchVolumeHocr("y", async (url) => {
      if (url.includes("/metadata/")) {
        return JSON.stringify({
          server: "ia800.us.archive.org",
          dir: "/1/items/y",
          files: [
            { name: "y_hocr.html", format: "hOCR" },
            { name: "y_page_numbers.json", format: "Page Numbers JSON" },
          ],
        });
      }
      if (url.endsWith("y_page_numbers.json")) {
        return JSON.stringify({
          pages: [1, 2].map((leafNum) => ({ leafNum, pageNumber: "" })),
        });
      }
      return volume;
    });

    expect(read).not.toContain("cover");
    expect(
      read.match(/id='page_\d+'[^>]*><span class='ocrx_word'>\w+/g),
    ).toEqual([
      "id='page_000000' title='bbox 0 0 10 10'><span class='ocrx_word'>Titel",
      "id='page_000001' title='bbox 0 0 10 10'><span class='ocrx_word'>Vorwort",
    ]);
  });
});

describe("fetchVolumeHocr, served leaves", () => {
  it("takes the served leaves from the scandata, whose page numbers leave out a title page the scan serves", async () => {
    const page = (id: number, text: string): string =>
      `<div class='ocr_page' id='page_${String(id).padStart(6, "0")}' title='bbox 0 0 10 10'><span class='ocrx_word'>${text}</span></div>`;
    const volume = `<html><body>${page(0, "Titel")}${page(1, "Vorwort")}${page(2, "card")}</body></html>`;

    const read = await fetchVolumeHocr("z", async (url) => {
      if (url.includes("/metadata/")) {
        return JSON.stringify({
          server: "ia800.us.archive.org",
          dir: "/1/items/z",
          files: [
            { name: "z_hocr.html", format: "hOCR" },
            { name: "z_page_numbers.json", format: "Page Numbers JSON" },
            { name: "z_scandata.xml", format: "Scandata" },
          ],
        });
      }
      if (url.endsWith("z_page_numbers.json")) {
        return JSON.stringify({ pages: [{ leafNum: 1, pageNumber: "1" }] });
      }
      if (url.endsWith("z_scandata.xml")) {
        return `<book><pageData>${[true, true, false]
          .map(
            (access, leaf) =>
              `<page leafNum="${leaf}"><addToAccessFormats>${access}</addToAccessFormats></page>`,
          )
          .join("")}</pageData></book>`;
      }
      return volume;
    });

    expect(read).toContain("Titel");
    expect(read).not.toContain("card");
  });
});

describe("volumeHocr, models", () => {
  const book = (ocr: string): ScannedBook | undefined =>
    scannedBooks(
      parseManifest(`
source: archive-ocr
books:
  - item: e
    citation: E
    ocr: ${ocr}
    scan:
      library: L
      url: https://example.org/e
      pages: [https://example.org/e/1.jpg]
    firstPage: 1
    lastPage: 1
    slug: e
    title: E
    edition: E
    author: A
    year: 1854
    kind: work
`),
    )[0];
  const page =
    "<html><body><div class='ocr_page' id='page_1' title='bbox 0 0 10 10'><span class='ocrx_word'>vigor—</span></div></body></html>";

  it("keeps the dash a word ends with where the scan was read with a model for roman type", async () => {
    const read = await volumeHocr(
      book("eng") ?? fail(),
      async (): Promise<string> => "",
      () => async (): Promise<string> => page,
    );

    expect(read).toContain(">vigor—</span>");
  });

  it("reads the German model's dash or equals sign at a word's end as its hyphen, but leaves its capitals and umlauts", async () => {
    const german =
      "<html><body><div class='ocr_page' id='page_1' title='bbox 0 0 10 10'><span class='ocrx_word'>Kennt—</span> <span class='ocrx_word'>ge=</span> <span class='ocrx_word'>Uber</span></div></body></html>";
    const read = await volumeHocr(
      book("deu") ?? fail(),
      async (): Promise<string> => "",
      () => async (): Promise<string> => german,
    );

    expect(read).toContain(">Kennt-</span>");
    expect(read).toContain(">ge-</span>");
    expect(read).toContain(">Uber</span>");
  });

  it("reads the Fraktur model's dash at a word's end as its hyphen", async () => {
    const read = await volumeHocr(
      book("frak2021") ?? fail(),
      async (): Promise<string> => "",
      () => async (): Promise<string> => page,
    );

    expect(read).toContain(">vigor-</span>");
  });
});

describe("volumeHocr, front matter", () => {
  it("states page I on the leaf the work names as the front matter's first page", async () => {
    const [book] = scannedBooks(
      parseManifest(`
source: archive-ocr
books:
  - item: w
    citation: Aphasien
    frontLeaf: 1
    firstPage: II
    lastPage: 2
    slug: w
    title: W
    edition: E
    author: A
    year: 1891
    kind: work
`),
    );
    const page = (id: number): string =>
      `<div class='ocr_page' id='page_${String(id).padStart(6, "0")}' title='bbox 0 0 10 10'><span class='ocrx_word'>x</span></div>`;

    const read = await volumeHocr(book ?? fail(), async (url) =>
      url.includes("/metadata/")
        ? JSON.stringify({ files: [{ name: "w_hocr.html", format: "hOCR" }] })
        : `<html><body>${page(0)}${page(1)}${page(2)}</body></html>`,
    );

    expect(
      read.match(/id='page_\d+'[^>]*><span class='ocr_pageno'>I<\/span>/g),
    ).toEqual([
      "id='page_000001' title='bbox 0 0 10 10'><span class='ocr_pageno'>I</span>",
    ]);
  });
});

function fail(): never {
  throw new Error("no book");
}

describe("firstOfEachVolume", () => {
  it("counts a scan read anew with another model as a volume of its own", () => {
    const books = scannedBooks(
      parseManifest(`
source: archive-ocr
books:
  - { item: freud-1952-gw-1, citation: GW I, firstPage: 3, lastPage: 20, slug: a, title: A, edition: GW I, author: Sigmund Freud, year: 1886, kind: work }
  - { item: freud-1952-gw-1, citation: GW I, ocr: fra, firstPage: 37, lastPage: 56, slug: b, title: B, edition: GW I, author: Sigmund Freud, year: 1893, kind: work }
  - { item: freud-1952-gw-1, citation: GW I, firstPage: 57, lastPage: 75, slug: c, title: C, edition: GW I, author: Sigmund Freud, year: 1894, kind: work }
`),
    );

    expect(firstOfEachVolume(books).map((book) => book.slug)).toEqual([
      "a",
      "b",
    ]);
    const [first, other, third] = books.map(volumeKey);
    expect(first).toBe(third);
    expect(first).not.toBe(other);
  });
});

describe("volumeHocr, a scan's printed pages", () => {
  it("numbers each image by the page it names, the images after it one by one: a paper's columns in two issues", async () => {
    const [book] = scannedBooks(
      parseManifest(`
source: archive-ocr
books:
  - item: wmw-1884-hirnblutung
    citation: WMW 1884
    ocr: deu
    scan:
      library: Internet Archive
      url: https://archive.org/details/wmw-34-1884-9
      firstPage: 244
      pages:
        - https://archive.org/download/wmw-34-1884-9/page/n1_w1600.jpg#region=0.5,0,0.5,1
        - https://archive.org/download/wmw-34-1884-9/page/n2_w1600.jpg#region=0,0,0.5,1
        - url: https://archive.org/download/wmw-34-1884-10/page/n1_w1600.jpg#region=0.5,0,0.5,1
          page: 276
        - https://archive.org/download/wmw-34-1884-10/page/n2_w1600.jpg#region=0,0,0.5,1
    firstPage: 244
    lastPage: 277
    slug: a
    title: A
    edition: WMW
    author: Sigmund Freud
    year: 1884
    kind: work
`),
    );
    if (!book) throw new Error("no book");
    const read: string[] = [];

    const hocr = await volumeHocr(
      book,
      async () => {
        throw new Error("nothing to fetch");
      },
      () =>
        async (url: string): Promise<string> => {
          read.push(url);
          return "<html><body><div class='ocr_page' id='page_1' title='bbox 0 0 10 10'></div></body></html>";
        },
    );

    expect(read).toEqual([
      "https://archive.org/download/wmw-34-1884-9/page/n1_w1600.jpg#region=0.5,0,0.5,1",
      "https://archive.org/download/wmw-34-1884-9/page/n2_w1600.jpg#region=0,0,0.5,1",
      "https://archive.org/download/wmw-34-1884-10/page/n1_w1600.jpg#region=0.5,0,0.5,1",
      "https://archive.org/download/wmw-34-1884-10/page/n2_w1600.jpg#region=0,0,0.5,1",
    ]);
    expect(hocr.match(/<span class='ocr_pageno'>\d+<\/span>/g)).toEqual([
      "<span class='ocr_pageno'>244</span>",
      "<span class='ocr_pageno'>245</span>",
      "<span class='ocr_pageno'>276</span>",
      "<span class='ocr_pageno'>277</span>",
    ]);
  });
});

describe("a volume whose front matter no head numbers", () => {
  const books = scannedBooks(
    parseManifest(`
source: archive-ocr
books:
  - { item: drei, citation: DA, firstPage: III, lastPage: III, frontLeaf: 2, slug: vorwort, title: Vorwort, edition: DA, author: Sigmund Freud, year: 1910, kind: work }
  - { item: drei, citation: DA, firstPage: 1, lastPage: 2, slug: text, title: Text, edition: DA, author: Sigmund Freud, year: 1910, kind: work }
`),
  );

  it("reads it as a volume of its own, its leaves numbered from the one the manifest names", () => {
    const [vorwort, text] = books.map(volumeKey);

    expect(vorwort).not.toBe(text);
  });
});

describe("a scanned work set among others' texts", () => {
  const [book] = scannedBooks(
    parseManifest(`
source: archive-ocr
books:
  - { item: wmw, citation: WMW, columns: true, firstPage: 137, lastPage: 137, opensWith: Die akute, closesWith: behandelt sind, notesOnly: true, notesSigned: [Der Herausgeber.], notesNamed: true, slug: a, title: A, edition: WMW, author: Sigmund Freud, year: 1887, kind: work }
`),
  );

  it("names its columns, its closing line and the notes that are its own", () => {
    expect(book).toMatchObject({
      columns: true,
      closesWith: "behandelt sind",
      notesOnly: true,
      notesSigned: ["Der Herausgeber."],
      notesNamed: true,
    });
  });
});
