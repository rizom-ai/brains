import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The published authoring entries and the SDK subpath each one re-exports. */
const AUTHORING_ENTRIES = {
  index: "@brains/sdk",
  plugins: "@brains/sdk/plugins",
  entities: "@brains/sdk/entities",
  services: "@brains/sdk/services",
  interfaces: "@brains/sdk/interfaces",
  templates: "@brains/sdk/templates",
} as const;

function code(file: string): string {
  return readFileSync(
    join(import.meta.dir, "../src/entries", `${file}.ts`),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/\/\/.*$/gmu, "")
    .trim();
}

describe("@rizom/brain authoring entries", () => {
  it("re-export the SDK and nothing else", () => {
    for (const [file, specifier] of Object.entries(AUTHORING_ENTRIES)) {
      // An SDK subpath that exports only types is re-exported as types.
      expect([
        `export * from "${specifier}";`,
        `export type * from "${specifier}";`,
      ]).toContain(code(file));
    }
  });

  it("expose exactly the SDK's runtime values", async () => {
    for (const [file, specifier] of Object.entries(AUTHORING_ENTRIES)) {
      const entry: Record<string, unknown> = await import(
        `../src/entries/${file}`
      );
      const sdk: Record<string, unknown> = await import(specifier);
      expect(Object.keys(entry).sort()).toEqual(Object.keys(sdk).sort());
      Object.keys(sdk).forEach((name) => {
        expect(entry[name]).toBe(sdk[name]);
      });
    }
  });
});
