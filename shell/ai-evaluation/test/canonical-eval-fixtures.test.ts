import { describe, expect, it } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { YAMLLoader } from "../src/loaders/yaml-loader";

async function findFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findFiles(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

async function findYamlFiles(directory: string): Promise<string[]> {
  return (await findFiles(directory)).filter((file) => /\.ya?ml$/i.test(file));
}

describe("canonical evaluation test cases", () => {
  it("loads every canonical fixture with unique IDs", async () => {
    const testCaseDir = join(
      import.meta.dir,
      "..",
      "..",
      "..",
      "packages",
      "brain-cli",
      "test-cases",
    );
    const loader = YAMLLoader.createFresh({ directory: testCaseDir });
    const files = await findYamlFiles(testCaseDir);

    expect(files.length).toBeGreaterThan(0);

    const testCases = await Promise.all(
      files.map((file) => loader.loadTestCase(file)),
    );
    const seenIds = new Set<string>();
    for (const testCase of testCases) {
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
