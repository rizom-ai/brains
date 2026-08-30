import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const siteSources = [
  "sites/default/src/index.ts",
  "sites/rizom-ai/src/index.ts",
];

const sitePackages = [
  "sites/default/package.json",
  "sites/rizom-ai/package.json",
];

const canonicalDefinitionSource =
  "packages/brain-cli/src/model/canonical-brain.ts";

function readProjectFile(relativePath: string): string {
  return readFileSync(
    join(import.meta.dir, "..", "..", "..", relativePath),
    "utf8",
  );
}

describe("site package structure", () => {
  test("site package source files stay structural-only", () => {
    for (const path of siteSources) {
      const source = readProjectFile(path);
      expect(source).not.toContain('from "@brains/theme-');
    }
  });

  test("site packages do not depend on theme packages", () => {
    for (const path of sitePackages) {
      const source = readProjectFile(path);
      expect(source).not.toContain("@brains/theme-");
    }
  });

  test("the canonical definition does not depend on deleted archetype site packages", () => {
    const source = readProjectFile(canonicalDefinitionSource);
    expect(source).not.toContain("@brains/site-ranger");
    expect(source).not.toContain("@brains/theme-ranger");
  });
});
