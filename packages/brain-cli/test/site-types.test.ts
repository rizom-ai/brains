import { beforeAll, describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { spawnSync } from "node:child_process";

const pkgDir = join(import.meta.dir, "..");
const siteAuthorFixtureDir = join(pkgDir, "test", "fixtures", "site-author");

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

  it("typechecks the package-local site authoring fixture", () => {
    const result = spawnSync(
      "bun",
      ["x", "tsc", "--noEmit", "-p", "tsconfig.json"],
      {
        cwd: siteAuthorFixtureDir,
        encoding: "utf-8",
      },
    );

    const output = `${result.stdout}\n${result.stderr}`;
    if (result.status !== 0) {
      throw new Error(output);
    }
    expect(output).not.toContain("@brains/");
  });

  it("resolves the site authoring fixture against generated dist declarations", () => {
    const result = spawnSync(
      "bun",
      ["x", "tsc", "--noEmit", "--traceResolution", "-p", "tsconfig.json"],
      {
        cwd: siteAuthorFixtureDir,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      },
    );

    const output = `${result.stdout}\n${result.stderr}`;
    if (result.status !== 0) {
      throw new Error(output);
    }

    expect(output).toContain(
      "Module name '@rizom/brain/site' was successfully resolved",
    );
    expect(output).toContain("dist/site.d.ts");
  });
});
