import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const packageDirectory = join(import.meta.dir, "..");

describe("removed @rizom/brain/site alpha surface", () => {
  it("has no package export, source entry, or generated declaration", () => {
    const manifest = JSON.parse(
      readFileSync(join(packageDirectory, "package.json"), "utf8"),
    );

    expect(manifest.exports["./site"]).toBeUndefined();
    expect(
      existsSync(join(packageDirectory, "src", "entries", "site.ts")),
    ).toBeFalse();
    expect(existsSync(join(packageDirectory, "dist", "site.d.ts"))).toBeFalse();
    expect(existsSync(join(packageDirectory, "dist", "site.js"))).toBeFalse();
  });

  it("does not build the removed entry", () => {
    const buildSource = readFileSync(
      join(packageDirectory, "scripts", "build.ts"),
      "utf8",
    );

    expect(buildSource).not.toContain('name: "site"');
    expect(buildSource).not.toContain('"src", "entries", "site.ts"');
  });
});
