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

  /** The package's files, staged for one book. */
  const stagedBook = async (id: string): Promise<(path: string) => string> => {
    await stage();
    expect(failures).toEqual([]);
    const files = unzipSync(
      await fs.readFile(join(outputDir, "books", `${id}.epub`)),
    );
    return (path) => {
      const file = files[path];
      if (!file) throw new Error(`no ${path} in ${id}.epub`);
      return strFromU8(file);
    };
  };

  it("joins a section split over several entries into one chapter", async () => {
    const entities = harness.getEntityService();
    await entities.createEntity({
      entity: book("geteilt", "Geteiltes Buch", "\ncontinuations: [2]"),
    });
    for (const [order, title] of [
      [1, "Lang"],
      [2, "Lang"],
      [3, "Kurz"],
    ] as const) {
      await entities.createEntity({
        entity: section(`geteilt:0000${order}`, "geteilt", order, title),
      });
    }

    const file = await stagedBook("geteilt");

    expect(file("OEBPS/chapter-1.xhtml")).toContain("Erfundener Text 1.");
    expect(file("OEBPS/chapter-1.xhtml")).toContain("Erfundener Text 2.");
    expect(file("OEBPS/chapter-2.xhtml")).toContain("Erfundener Text 3.");
    expect(file("OEBPS/content.opf")).not.toContain("chapter-3");
  });

  it("nests the contents by headings, opening each heading once in the text", async () => {
    const entities = harness.getEntityService();
    await entities.createEntity({ entity: book("teile", "Buch in Teilen") });
    for (const [order, headings] of [
      [1, ["Erster Theil"]],
      [2, ["Erster Theil"]],
      [3, ["Zweiter Theil"]],
    ] as const) {
      await entities.createEntity({
        entity: section(
          `teile:0000${order}`,
          "teile",
          order,
          `Abschnitt ${order}`,
          `T-${order}`,
          [...headings],
        ),
      });
    }

    const file = await stagedBook("teile");
    const nav = file("OEBPS/nav.xhtml").replace(/>\s+</g, "><");

    expect(nav).toContain(
      '<li><a href="chapter-1.xhtml">Erster Theil</a><ol><li><a href="chapter-1.xhtml">Abschnitt 1</a></li><li><a href="chapter-2.xhtml">Abschnitt 2</a></li></ol></li>',
    );
    expect(file("OEBPS/chapter-1.xhtml")).toContain("<h1>Erster Theil</h1>");
    expect(file("OEBPS/chapter-2.xhtml")).not.toContain("Erster Theil</h1>");
    expect(file("OEBPS/chapter-3.xhtml")).toContain("<h1>Zweiter Theil</h1>");
  });
});
