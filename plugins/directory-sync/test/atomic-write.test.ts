import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync } from "fs";
import { writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  atomicWriteTempPath,
  isAtomicWriteTemp,
  writeFileAtomic,
} from "../src/lib/atomic-write";

let dir: string | undefined;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

describe("writeFileAtomic", () => {
  it("replaces a file and leaves no temporary file behind", async () => {
    dir = mkdtempSync(join(tmpdir(), "atomic-write-"));
    const target = join(dir, "note.md");
    await writeFile(target, "old");

    await writeFileAtomic(target, "new");

    expect(readFileSync(target, "utf-8")).toBe("new");
    expect(readdirSync(dir)).toEqual(["note.md"]);
  });

  it("removes its temporary file when the replace fails", async () => {
    dir = mkdtempSync(join(tmpdir(), "atomic-write-"));
    const target = join(dir, "occupied");
    mkdirSync(join(target, "child"), { recursive: true });

    expect(writeFileAtomic(target, "new")).rejects.toThrow();
    await Bun.sleep(10);
    expect(readdirSync(dir)).toEqual(["occupied"]);
    expect(readdirSync(target)).toEqual(["child"]);
  });

  it("names temporary files so the watcher and git can recognize them", () => {
    const temp = atomicWriteTempPath("/sync/post/hello.md");
    expect(temp.startsWith("/sync/post/.hello.md.")).toBe(true);
    expect(isAtomicWriteTemp(temp)).toBe(true);
    expect(isAtomicWriteTemp("/sync/post/hello.md")).toBe(false);
  });
});
