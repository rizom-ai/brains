import { beforeAll, describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { spawnSync } from "node:child_process";

const pkgDir = join(import.meta.dir, "..");

describe("@rizom/brain/site type contract", () => {
  const siteTypesPath = join(pkgDir, "dist", "site.d.ts");
  const siteEntryPath = join(pkgDir, "src", "entries", "site.ts");

  beforeAll(() => {
    const result = spawnSync("bun", ["scripts/build.ts"], {
      cwd: pkgDir,
      encoding: "utf-8",
    });

    if (result.status !== 0) {
      throw new Error(`${result.stdout}\n${result.stderr}`);
    }
  }, 60_000);

  it("generates the site declaration from the public entry source", () => {
    const types = readFileSync(siteTypesPath, "utf-8");
    const entry = readFileSync(siteEntryPath, "utf-8");

    expect(entry).toContain("export interface SitePackage");
    expect(types).toContain("interface SitePackage");
    expect(types).not.toContain("@brains/");
  });

  it("does not expose a theme field on SitePackage", () => {
    const types = readFileSync(siteTypesPath, "utf-8");
    expect(types).not.toMatch(/\btheme\s*:\s*string\s*;/);
    expect(types).not.toContain("SitePackage.theme");
  });

  it("exposes both personal and professional site authoring symbols", () => {
    const types = readFileSync(siteTypesPath, "utf-8");
    const entry = readFileSync(siteEntryPath, "utf-8");

    for (const symbol of [
      "PersonalLayout",
      "personalSitePlugin",
      "routes",
      "personalRoutes",
      "ProfessionalLayout",
      "professionalSitePlugin",
      "professionalRoutes",
    ]) {
      expect(types).toContain(symbol);
      expect(entry).toContain(symbol);
    }
  });
});
