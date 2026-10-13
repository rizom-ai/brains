import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  mkdir,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeBook } from "../src/write-book";

describe("writeBook", () => {
  let brainData: string;

  beforeEach(async () => {
    brainData = await mkdtemp(join(tmpdir(), "book-import-"));
  });

  afterEach(async () => {
    await rm(brainData, { recursive: true, force: true });
  });

  it("writes the book and its sections, removing sections it no longer has", async () => {
    await mkdir(join(brainData, "book/eb/00001-alt"), {
      recursive: true,
    });
    await writeFile(join(brainData, "book/eb/00001-alt/00009-weg.md"), "alt");
    await mkdir(join(brainData, "book/anderes"), { recursive: true });
    await writeFile(join(brainData, "book/anderes/00001-a.md"), "bleibt");
    await mkdir(join(brainData, "book"), { recursive: true });
    await writeFile(join(brainData, "book/anderes.md"), "bleibt");

    await writeBook(brainData, "eb", [
      { path: "book/eb.md", markdown: "buch" },
      { path: "book/eb/00001-teil/00001-eins.md", markdown: "eins" },
    ]);

    expect(await readFile(join(brainData, "book/eb.md"), "utf8")).toBe("buch");
    expect((await readdir(join(brainData, "book/eb"))).sort()).toEqual([
      "00001-teil",
    ]);
    expect(
      await readFile(
        join(brainData, "book/eb/00001-teil/00001-eins.md"),
        "utf8",
      ),
    ).toBe("eins");
    expect(await readFile(join(brainData, "book/anderes.md"), "utf8")).toBe(
      "bleibt",
    );
    expect(
      await readFile(join(brainData, "book/anderes/00001-a.md"), "utf8"),
    ).toBe("bleibt");
  });

  it("refuses files outside the book and its sections", async () => {
    expect(
      writeBook(brainData, "eb", [{ path: "book/anderes/x.md", markdown: "" }]),
    ).rejects.toThrow("outside book/eb.md and book/eb");
  });
});
