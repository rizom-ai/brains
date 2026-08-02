import { describe, expect, it } from "bun:test";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

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

  it("keeps commerce eval seed content aligned with its recipe", async () => {
    const brainPackageDir = join(
      import.meta.dir,
      "..",
      "..",
      "..",
      "packages",
      "brain-cli",
    );
    const recipeDir = join(
      brainPackageDir,
      "templates",
      "recipes",
      "commerce",
      "seed-content",
    );
    const evalDir = join(brainPackageDir, "eval-content", "commerce");
    const recipeFiles = (await findFiles(recipeDir)).sort();
    const evalFiles = (await findFiles(evalDir))
      .filter((file) => !/\.db(?:-shm|-wal)?$/.test(file))
      .sort();

    expect(evalFiles.map((file) => relative(evalDir, file))).toEqual(
      recipeFiles.map((file) => relative(recipeDir, file)),
    );
    for (const [index, recipeFile] of recipeFiles.entries()) {
      const evalFile = evalFiles[index];
      expect(evalFile).toBeDefined();
      if (!evalFile)
        throw new Error(`Missing commerce eval fixture at ${index}`);
      expect(await readFile(evalFile)).toEqual(await readFile(recipeFile));
    }
  });
});
