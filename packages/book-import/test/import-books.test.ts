import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rejects } from "node:assert/strict";
import { bookFrontmatterSchema } from "@brains/book";
import { parseMarkdown } from "@brains/sdk/entities";
function frontmatterOf(
  markdown: string,
): ReturnType<typeof bookFrontmatterSchema.parse> {
  return bookFrontmatterSchema.parse(parseMarkdown(markdown).frontmatter);
}
import { ekgwbReader, importBooks, parseManifest } from "../src/import-books";
import { corpusReader } from "../src/corpus-source";

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
      ekgwbReader(fetchFixture),
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
    await importBooks(
      parseManifest(manifestYaml),
      brainData,
      ekgwbReader(fetchFixture),
    );
    const title = await readFile(
      join(brainData, "book/erfundenes-buch/00000-titel.md"),
      "utf8",
    );

    expect(frontmatterOf(title)).toMatchObject({
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
      ekgwbReader(fetchFixture),
    );
    const title = await readFile(
      join(brainData, "book/erfundenes-buch/00000-titel.md"),
      "utf8",
    );

    expect(frontmatterOf(title).title).toBe("Ein genauerer Titel");
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
      ekgwbReader(fetchFixture),
    );
    const title = await readFile(
      join(brainData, "book/erfundenes-buch/00000-titel.md"),
      "utf8",
    );

    expect(frontmatterOf(title)).toMatchObject({
      published: false,
      shortTitle: "Erfunden",
    });
  });

  it("counts a book as published unless the manifest says otherwise", async () => {
    await importBooks(
      parseManifest(manifestYaml),
      brainData,
      ekgwbReader(fetchFixture),
    );
    const title = await readFile(
      join(brainData, "book/erfundenes-buch/00000-titel.md"),
      "utf8",
    );

    expect(frontmatterOf(title).published).toBe(true);
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
          frontmatterOf(await readFile(join(root, file), "utf8")),
        ),
    );
    return parsed.sort(
      (left, right) => Number(left["order"]) - Number(right["order"]),
    );
  }

  it("finishes reading each part before requesting the next", async () => {
    const source = ekgwbReader(fetchPart);
    let active = 0;
    let maximum = 0;
    await importBooks(parseManifest(partsYaml), brainData, {
      read: async (siglum) => {
        active++;
        maximum = Math.max(maximum, active);
        try {
          await Bun.sleep(5);
          return await source.read(siglum);
        } finally {
          active--;
        }
      },
    });
    expect(maximum).toBe(1);
    expect(requested).toEqual([
      "http://www.nietzschesource.org/eKGWB/EB-I/print",
      "http://www.nietzschesource.org/eKGWB/EB-II/print",
    ]);
  });

  it("joins the parts into one book, numbered across them", async () => {
    const results = await importBooks(
      parseManifest(partsYaml),
      brainData,
      ekgwbReader(fetchPart),
    );

    expect(requested).toEqual([
      "http://www.nietzschesource.org/eKGWB/EB-I/print",
      "http://www.nietzschesource.org/eKGWB/EB-II/print",
    ]);
    expect(results).toEqual([{ slug: "erfundenes-werk", entries: 5 }]);
    const sections = (await entries()).slice(1);
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
    await importBooks(
      parseManifest(partsYaml),
      brainData,
      ekgwbReader(fetchPart),
    );
    const title = await readFile(
      join(brainData, "book/erfundenes-werk/00000-titel.md"),
      "utf8",
    );

    expect(frontmatterOf(title)).toMatchObject({
      title: "Erfundenes Werk",
      order: 0,
      sections: 4,
    });
    expect(title).toContain("[Erster Theil]");
    expect(title).toContain("[Zweiter Theil]");
  });

  it("does not request later parts or replace a book after a read fails", async () => {
    await importBooks(
      parseManifest(partsYaml),
      brainData,
      ekgwbReader(fetchPart),
    );
    const titlePath = join(brainData, "book/erfundenes-werk/00000-titel.md");
    const original = await readFile(titlePath, "utf8");
    const reads: string[] = [];
    await rejects(
      importBooks(parseManifest(partsYaml), brainData, {
        read: async (siglum) => {
          reads.push(siglum);
          throw new Error("Source unavailable");
        },
      }),
      /Source unavailable/,
    );
    expect(reads).toEqual(["EB-I"]);
    expect(await readFile(titlePath, "utf8")).toBe(original);
  });

  it("combines an existing corpus without fetching or altering its inputs", async () => {
    const originalRoot = join(brainData, "original");
    await importBooks(
      parseManifest(`source: ekgwb
books:
  - siglum: EB-I
    slug: first-part
    author: Erfundener Autor
    year: 1888
    kind: work
  - siglum: EB-II
    slug: second-part
    author: Erfundener Autor
    year: 1888
    kind: work
`),
      originalRoot,
      ekgwbReader(fetchPart),
    );
    const originalPath = join(originalRoot, "book/first-part/00002-1.md");
    const original = await readFile(originalPath, "utf8");
    requested.length = 0;
    await importBooks(
      parseManifest(partsYaml),
      brainData,
      await corpusReader(originalRoot),
    );
    expect(requested).toEqual([]);
    expect(await readFile(originalPath, "utf8")).toBe(original);
    const combined = await entries();
    expect(combined.map((entry) => entry["order"])).toEqual([0, 1, 2, 3, 4]);
    expect(combined.slice(1).map((entry) => entry["source"])).toEqual([
      "http://www.nietzschesource.org/eKGWB/EB-I-Vorwort",
      "http://www.nietzschesource.org/eKGWB/EB-I-1",
      "http://www.nietzschesource.org/eKGWB/EB-II-Vorwort",
      "http://www.nietzschesource.org/eKGWB/EB-II-1",
    ]);
  });

  it("rejects a book that names both a siglum and parts", () => {
    expect(() =>
      parseManifest(
        partsYaml.replace("kind: work", "kind: work\n    siglum: EB"),
      ),
    ).toThrow();
  });
});
