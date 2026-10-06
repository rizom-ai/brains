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

  it("rejects a manifest entry without a siglum", () => {
    expect(() =>
      parseManifest(
        `source: ekgwb\nbooks:\n  - slug: x\n    author: A\n    year: 1\n    kind: work\n`,
      ),
    ).toThrow();
  });
});
