import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  hasLegacyMarker,
  readInventory,
  untrackedLegacyMarkers,
} from "./check-legacy-code";

/**
 * Fixtures are strings rather than files so the check never scans them, and
 * each one isolates a single marker the scan must see.
 */

const repositoryRoot = join(import.meta.dir, "..");

function readSource(path: string): string {
  return readFileSync(join(repositoryRoot, path), "utf8");
}

describe("legacy markers", () => {
  it.each([
    ["the word legacy", "// Reads the legacy layout."],
    ["a JSDoc deprecation", "/** @deprecated Use next() instead. */"],
    ["the word deprecated in any case", "// Deprecated: kept for old callers."],
    ["a camelCase identifier", "const legacyFoo = 1;"],
    ["a camelCase identifier inside a name", "isLegacyBar(value);"],
    ["a PascalCase identifier", "type LegacyShape = string;"],
    ["a SCREAMING_CASE identifier", "const LEGACY_BAZ = [];"],
  ])("flags %s", (_name, source) => {
    expect(hasLegacyMarker(source)).toBe(true);
  });

  it("passes source that names neither", () => {
    expect(hasLegacyMarker("export const current = read(store);")).toBe(false);
  });
});

describe("legacy marker coverage", () => {
  const inventory = readInventory();

  it("reports a source file with an uncovered marker", () => {
    const sources = new Map([
      ["src/deprecated-fixture.ts", "/** @deprecated */ export const a = 1;"],
      ["src/legacy-fixture.ts", "export const legacyFoo = 1;"],
      ["src/current-fixture.ts", "export const current = 1;"],
    ]);

    expect(
      untrackedLegacyMarkers(
        inventory,
        [...sources.keys()],
        (path) => sources.get(path) ?? "",
      ),
    ).toEqual(["src/deprecated-fixture.ts", "src/legacy-fixture.ts"]);
  });

  it.each([
    ".dependency-cruiser.js",
    "scripts/verify-retired-package-deprecations.ts",
    "shared/atproto-contracts/src/lexicon.ts",
  ])("passes %s, which uses deprecated as a domain word", (path) => {
    expect(hasLegacyMarker(readSource(path))).toBe(true);
    expect(
      inventory.exemptions.find((exemption) => exemption.paths.includes(path)),
    ).toEqual(
      expect.objectContaining({ paths: [path], reason: expect.any(String) }),
    );
    expect(untrackedLegacyMarkers(inventory, [path], readSource)).toEqual([]);
  });
});
