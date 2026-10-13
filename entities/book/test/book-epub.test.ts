import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { strFromU8, unzipSync } from "fflate";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";
import { BookPlugin } from "../src";
import { book, section } from "./helpers/books";

describe("book EPUB", () => {
  let harness: PluginTestHarness<BookPlugin>;
  let outputDir: string;
  const failures: string[] = [];

  const stage = (): Promise<unknown> =>
    harness.sendMessage(
      "site:build:staging",
      {
        outputDir,
        environment: "production",
        routesBuilt: 1,
        siteConfig: { title: "Erfundene Bibliothek" },
        generateEntityUrl: (_type: string, slug: string): string =>
          `/books/${slug}`,
        reportFailure: (detail: string): void => {
          failures.push(detail);
        },
      },
      "site-builder",
      true,
    );

  beforeEach(async () => {
    failures.length = 0;
    outputDir = await fs.mkdtemp(join(tmpdir(), "book-epub-"));
    harness = createPluginHarness<BookPlugin>({
      dataDir: "/tmp/test-datadir",
    });
    await harness.installPlugin(new BookPlugin());
    const entities = harness.getEntityService();
    await entities.createEntity({ entity: book("erstes", "Erstes Buch") });
    await entities.createEntity({
      entity: section("erstes:00002-mitte", "erstes", 2, "Mitte"),
    });
    await entities.createEntity({
      entity: section("erstes:00001-vorrede", "erstes", 1, "Vorrede"),
    });
    await entities.createEntity({ entity: book("leeres", "Leeres Buch") });
  });

  afterEach(async () => {
    await fs.rm(outputDir, { recursive: true, force: true });
  });

  it("registers the book view in the EPUB format", () => {
    expect(
      harness.getEntityContext("book").views.hasRenderer("book:epub", "epub"),
    ).toBe(true);
  });

  it("writes each book with sections into the build, its sections in reading order", async () => {
    await stage();

    expect(failures).toEqual([]);
    const files = unzipSync(
      await fs.readFile(join(outputDir, "books", "erstes.epub")),
    );
    const chapter = (n: number): string => {
      const file = files[`OEBPS/chapter-${n}.xhtml`];
      if (!file) throw new Error(`no chapter ${n}`);
      return strFromU8(file);
    };
    expect(chapter(1)).toContain("Vorrede");
    expect(chapter(1)).toContain("Erfundener Text 1.");
    expect(chapter(2)).toContain("Mitte");
    expect(chapter(2)).toContain("Erfundener Text 2.");
    expect(files["OEBPS/chapter-3.xhtml"]).toBeUndefined();
  });

  it("writes nothing for a book without sections", async () => {
    await stage();

    expect(existsSync(join(outputDir, "books", "leeres.epub"))).toBe(false);
  });
});
