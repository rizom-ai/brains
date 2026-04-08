import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

describe("@rizom/brain/site type contract", () => {
  const siteTypesPath = join(
    import.meta.dir,
    "..",
    "src",
    "types",
    "site.d.ts",
  );

  it("does not expose a theme field on SitePackage", () => {
    const src = readFileSync(siteTypesPath, "utf-8");
    expect(src).not.toMatch(/\btheme\s*:\s*string\s*;/);
    expect(src).not.toContain("SitePackage.theme");
  });
});
