import { describe, expect, it } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { YAMLLoader } from "../src/loaders/yaml-loader";

async function findYamlFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findYamlFiles(fullPath)));
    } else if (entry.isFile() && /\.ya?ml$/i.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

describe("rover evaluation test cases", () => {
  it("loads every rover eval fixture with unique IDs", async () => {
    const testCaseDir = join(
      import.meta.dir,
      "..",
      "..",
      "..",
      "brains",
      "rover",
      "test-cases",
    );
    const loader = YAMLLoader.createFresh({ directory: testCaseDir });
    const files = await findYamlFiles(testCaseDir);

    expect(files.length).toBeGreaterThan(0);

    const seenIds = new Set<string>();
    for (const file of files) {
      const testCase = await loader.loadTestCase(file);
      expect(testCase.id.length).toBeGreaterThan(0);
      expect(seenIds.has(testCase.id)).toBe(false);
      seenIds.add(testCase.id);

      if (testCase.type !== "plugin") {
        expect(testCase.turns.length).toBeGreaterThan(0);
      }
    }

    expect(seenIds.size).toBe(files.length);
  });
});
