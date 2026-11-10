import { describe, expect, it } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const cases = join(import.meta.dir, "../test-cases");
const importCase = "personal/tool-invocation/blog-published-essay-import.yaml";

async function caseFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".yaml"))
    .map((entry) => join(entry.parentPath, entry.name));
}

describe("the published essay import case", () => {
  // Cases of a suite share one brain: an essay another case saves first
  // already exists when this one creates it, and the create is refused.
  it("imports an essay no other case saves", async () => {
    const own = await readFile(join(cases, importCase), "utf8");
    const title = /^ {6}# (.+)$/m.exec(own)?.[1];
    if (!title) throw new Error("The case names no essay");

    const others = await Promise.all(
      (await caseFiles(cases))
        .filter((file) => !file.endsWith(importCase))
        .map(async (file) => ({ file, text: await readFile(file, "utf8") })),
    );

    expect(
      others.filter(({ text }) => text.includes(title)).map(({ file }) => file),
    ).toEqual([]);
  });
});
