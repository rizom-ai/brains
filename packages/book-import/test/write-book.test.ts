import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import * as fs from "node:fs/promises";
import { rejects } from "node:assert/strict";
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

  it("writes the book's files and removes entries it no longer has", async () => {
    await mkdir(join(brainData, "book/eb/00001-alt"), { recursive: true });
    await writeFile(join(brainData, "book/eb/00001-alt/00009-weg.md"), "alt");
    await mkdir(join(brainData, "book/anderes"), { recursive: true });
    await writeFile(join(brainData, "book/anderes/00000-titel.md"), "bleibt");

    await writeBook(brainData, "eb", [
      { path: "book/eb/00000-titel.md", markdown: "titel" },
      { path: "book/eb/00001-teil/00001-eins.md", markdown: "eins" },
    ]);

    expect((await readdir(join(brainData, "book/eb"))).sort()).toEqual([
      "00000-titel.md",
      "00001-teil",
    ]);
    expect(
      await readFile(
        join(brainData, "book/eb/00001-teil/00001-eins.md"),
        "utf8",
      ),
    ).toBe("eins");
    expect(
      await readFile(join(brainData, "book/anderes/00000-titel.md"), "utf8"),
    ).toBe("bleibt");
  });

  it("refuses traversal before touching existing files", async () => {
    await mkdir(join(brainData, "book/eb"), { recursive: true });
    await writeFile(join(brainData, "book/eb/old.md"), "original");
    await writeFile(join(brainData, "sentinel"), "untouched");
    for (const slug of [
      "..",
      "../eb",
      "eb/../other",
      "/absolute",
      "eb\\other",
    ]) {
      await rejects(writeBook(brainData, slug, []), /Unsafe book slug/);
    }
    for (const path of [
      "book/eb/../../sentinel",
      "book/eb/sub/../old.md",
      "book/eb//old.md",
      "book/eb/sub\\old.md",
    ]) {
      await rejects(
        writeBook(brainData, "eb", [{ path, markdown: "overwrite" }]),
        /outside|unsafe/,
      );
    }
    expect(await readFile(join(brainData, "sentinel"), "utf8")).toBe(
      "untouched",
    );
    expect(await readFile(join(brainData, "book/eb/old.md"), "utf8")).toBe(
      "original",
    );
  });

  it("rejects a symlinked book container", async () => {
    await mkdir(join(brainData, "outside"));
    await fs.symlink(join(brainData, "outside"), join(brainData, "book"));
    await rejects(
      writeBook(brainData, "eb", []),
      /Unsafe book output directory/,
    );
    expect(await readdir(join(brainData, "outside"))).toEqual([]);
  });

  it("keeps the previous book when staging fails", async () => {
    await writeBook(brainData, "eb", [
      { path: "book/eb/old.md", markdown: "original" },
    ]);
    await rejects(
      writeBook(brainData, "eb", [
        { path: "book/eb/part", markdown: "file" },
        { path: "book/eb/part/nested.md", markdown: "cannot create parent" },
      ]),
    );
    expect(await readFile(join(brainData, "book/eb/old.md"), "utf8")).toBe(
      "original",
    );
    expect(await readdir(join(brainData, "book"))).toEqual(["eb"]);
  });

  it("restores the previous book if publication fails", async () => {
    await writeBook(brainData, "eb", [
      { path: "book/eb/old.md", markdown: "original" },
    ]);
    const rename = fs.rename;
    const failure = spyOn(fs, "rename").mockImplementation(async (from, to) => {
      if (typeof from === "string" && from.endsWith("/next"))
        throw new Error("Publication refused");
      return rename(from, to);
    });
    try {
      await rejects(
        writeBook(brainData, "eb", [
          { path: "book/eb/new.md", markdown: "new" },
        ]),
        /Publication refused/,
      );
      expect(await readFile(join(brainData, "book/eb/old.md"), "utf8")).toBe(
        "original",
      );
      expect(await readdir(join(brainData, "book"))).toEqual(["eb"]);
    } finally {
      failure.mockRestore();
    }
  });

  it("retains recovery files if restoring the prior book also fails", async () => {
    await writeBook(brainData, "eb", [
      { path: "book/eb/old.md", markdown: "original" },
    ]);
    const rename = fs.rename;
    const failure = spyOn(fs, "rename").mockImplementation(async (from, to) => {
      if (to === join(brainData, "book/eb")) throw new Error("Target refused");
      return rename(from, to);
    });
    try {
      await rejects(
        writeBook(brainData, "eb", [
          { path: "book/eb/new.md", markdown: "new" },
        ]),
        /recover previous book/,
      );
      const directories = await readdir(join(brainData, "book"));
      expect(directories).toHaveLength(1);
      const recovery = directories.find((name) =>
        name.startsWith(".book-import-"),
      );
      if (!recovery) throw new Error("Missing recovery directory");
      expect(
        await readFile(
          join(brainData, "book", recovery, "previous/old.md"),
          "utf8",
        ),
      ).toBe("original");
    } finally {
      failure.mockRestore();
    }
  });

  it("rejects duplicate paths without replacing existing output", async () => {
    await writeBook(brainData, "eb", [
      { path: "book/eb/old.md", markdown: "original" },
    ]);
    await rejects(
      writeBook(brainData, "eb", [
        { path: "book/eb/new.md", markdown: "first" },
        { path: "book/eb/new.md", markdown: "second" },
      ]),
      /Duplicate book path/,
    );
    expect(await readFile(join(brainData, "book/eb/old.md"), "utf8")).toBe(
      "original",
    );
  });

  it("refuses files outside the book's directory", async () => {
    expect(
      writeBook(brainData, "eb", [{ path: "book/anderes/x.md", markdown: "" }]),
    ).rejects.toThrow("outside book/eb");
  });
});
