import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const packageDirectory = join(import.meta.dir, "..");

// Alpha authoring subpaths that no longer exist.
const removedEntries = ["site", "plugins", "templates"] as const;

describe("removed @rizom/brain alpha entries", () => {
  for (const entry of removedEntries) {
    it(`has no ${entry} export, source entry, or generated output`, () => {
      const manifest = JSON.parse(
        readFileSync(join(packageDirectory, "package.json"), "utf8"),
      );

      expect(manifest.exports[`./${entry}`]).toBeUndefined();
      expect(
        existsSync(join(packageDirectory, "src", "entries", `${entry}.ts`)),
      ).toBeFalse();
      expect(
        existsSync(join(packageDirectory, "dist", `${entry}.d.ts`)),
      ).toBeFalse();
      expect(
        existsSync(join(packageDirectory, "dist", `${entry}.js`)),
      ).toBeFalse();
    });
  }

  it("does not build a removed entry, and clears one an earlier build left", () => {
    const buildSource = readFileSync(
      join(packageDirectory, "scripts", "build.ts"),
      "utf8",
    );

    for (const entry of removedEntries) {
      expect(buildSource).not.toContain(`name: "${entry}"`);
      expect(buildSource).not.toContain(`"src", "entries", "${entry}.ts"`);
    }
    expect(buildSource).toContain(
      'for (const removedEntry of ["site", "plugins", "templates"])',
    );
  });
});
