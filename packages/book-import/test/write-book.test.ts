import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import * as fs from "node:fs/promises";
import { rejects } from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeBook } from "../src/write-book";
import type { BookFile } from "../src/render-book";

function files(version: string): BookFile[] {
  return [
    { path: "book/eb.md", markdown: `${version} title` },
    { path: `book-section/eb/${version}.md`, markdown: `${version} text` },
  ];
}
describe("writeBook", () => {
  let brainData: string;
  beforeEach(async () => {
    brainData = await fs.mkdtemp(join(tmpdir(), "book-import-"));
  });
  afterEach(async () => {
    await fs.rm(brainData, { recursive: true, force: true });
  });
  async function expectOriginal(): Promise<void> {
    expect(await fs.readFile(join(brainData, "book/eb.md"), "utf8")).toBe(
      "old title",
    );
    expect(
      await fs.readFile(join(brainData, "book-section/eb/old.md"), "utf8"),
    ).toBe("old text");
    expect(await fs.readdir(join(brainData, "book-section/eb"))).toEqual([
      "old.md",
    ]);
  }
  it("replaces both paths, removing stale sections without touching another book", async () => {
    await writeBook(brainData, "eb", files("old"));
    await writeBook(brainData, "other", [
      { path: "book/other.md", markdown: "other title" },
      { path: "book-section/other/text.md", markdown: "other text" },
    ]);
    await writeBook(brainData, "eb", files("new"));
    expect(await fs.readFile(join(brainData, "book/eb.md"), "utf8")).toBe(
      "new title",
    );
    expect(await fs.readdir(join(brainData, "book-section/eb"))).toEqual([
      "new.md",
    ]);
    expect(
      await fs.readFile(join(brainData, "book-section/eb/new.md"), "utf8"),
    ).toBe("new text");
    expect(await fs.readFile(join(brainData, "book/other.md"), "utf8")).toBe(
      "other title",
    );
    expect(
      await fs.readFile(join(brainData, "book-section/other/text.md"), "utf8"),
    ).toBe("other text");
    expect((await fs.readdir(brainData)).sort()).toEqual([
      "book",
      "book-section",
    ]);
  });
  it("refuses unsafe paths and slugs before touching existing files", async () => {
    await writeBook(brainData, "eb", files("old"));
    await fs.writeFile(join(brainData, "sentinel"), "untouched");
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
      "book-section/eb/../../sentinel",
      "book-section/eb/sub/../old.md",
      "book-section/eb//old.md",
      "book-section/eb/sub\\old.md",
      "book/other.md",
      "book-section/other/text.md",
      "book/eb.md/child",
      "book-section/eb/control\u0000.md",
    ]) {
      await rejects(
        writeBook(brainData, "eb", [{ path, markdown: "overwrite" }]),
        /outside|unsafe/,
      );
    }
    expect(await fs.readFile(join(brainData, "sentinel"), "utf8")).toBe(
      "untouched",
    );
    await expectOriginal();
  });
  it.each(["book", "book-section"])(
    "rejects a symlinked %s container",
    async (container) => {
      await fs.mkdir(join(brainData, "outside"));
      await fs.symlink(join(brainData, "outside"), join(brainData, container));
      await rejects(
        writeBook(brainData, "eb", files("new")),
        /Unsafe book output directory/,
      );
      expect(await fs.readdir(join(brainData, "outside"))).toEqual([]);
    },
  );
  it("keeps both previous paths when staging fails", async () => {
    await writeBook(brainData, "eb", files("old"));
    await rejects(
      writeBook(brainData, "eb", [
        ...files("new"),
        { path: "book-section/eb/part", markdown: "file" },
        {
          path: "book-section/eb/part/nested.md",
          markdown: "cannot create parent",
        },
      ]),
    );
    await expectOriginal();
    expect((await fs.readdir(brainData)).sort()).toEqual([
      "book",
      "book-section",
    ]);
  });
  it.each(["next-sections", "next-book"])(
    "restores both previous paths if publishing %s fails",
    async (name) => {
      await writeBook(brainData, "eb", files("old"));
      const rename = fs.rename;
      const failure = spyOn(fs, "rename").mockImplementation(
        async (from, to) => {
          if (typeof from === "string" && from.endsWith(`/${name}`))
            throw new Error("Publication refused");
          return rename(from, to);
        },
      );
      try {
        await rejects(
          writeBook(brainData, "eb", files("new")),
          /Publication refused/,
        );
        await expectOriginal();
        expect((await fs.readdir(brainData)).sort()).toEqual([
          "book",
          "book-section",
        ]);
      } finally {
        failure.mockRestore();
      }
    },
  );
  it("restores moved sections if backing up the book fails", async () => {
    await writeBook(brainData, "eb", files("old"));
    const rename = fs.rename;
    const failure = spyOn(fs, "rename").mockImplementation(async (from, to) => {
      if (from === join(brainData, "book/eb.md"))
        throw new Error("Backup refused");
      return rename(from, to);
    });
    try {
      await rejects(writeBook(brainData, "eb", files("new")), /Backup refused/);
      await expectOriginal();
    } finally {
      failure.mockRestore();
    }
  });
  it("removes a newly published section directory on failed first publication", async () => {
    const rename = fs.rename;
    const failure = spyOn(fs, "rename").mockImplementation(async (from, to) => {
      if (typeof from === "string" && from.endsWith("/next-book"))
        throw new Error("Publication refused");
      return rename(from, to);
    });
    try {
      await rejects(
        writeBook(brainData, "eb", files("new")),
        /Publication refused/,
      );
      expect(await fs.readdir(join(brainData, "book"))).toEqual([]);
      expect(await fs.readdir(join(brainData, "book-section"))).toEqual([]);
    } finally {
      failure.mockRestore();
    }
  });
  it("retains a recovery backup and restores the other path if rollback fails", async () => {
    await writeBook(brainData, "eb", files("old"));
    const rename = fs.rename;
    const failure = spyOn(fs, "rename").mockImplementation(async (from, to) => {
      if (to === join(brainData, "book/eb.md"))
        throw new Error("Target refused");
      return rename(from, to);
    });
    try {
      await rejects(
        writeBook(brainData, "eb", files("new")),
        /recover previous book/,
      );
      const recovery = (await fs.readdir(brainData)).find((name) =>
        name.startsWith(".book-import-"),
      );
      if (!recovery) throw new Error("Missing recovery directory");
      expect(
        await fs.readFile(join(brainData, recovery, "previous-book"), "utf8"),
      ).toBe("old title");
      expect(
        await fs.readFile(join(brainData, "book-section/eb/old.md"), "utf8"),
      ).toBe("old text");
    } finally {
      failure.mockRestore();
    }
  });
  it("rejects duplicate paths and missing title files without replacing output", async () => {
    await writeBook(brainData, "eb", files("old"));
    await rejects(
      writeBook(brainData, "eb", [...files("new"), ...files("new")]),
      /Duplicate book path/,
    );
    await rejects(
      writeBook(brainData, "eb", [
        { path: "book-section/eb/new.md", markdown: "new text" },
      ]),
      /Missing book title file/,
    );
    await expectOriginal();
  });
});
