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
  const siteEntryPath = join(
    import.meta.dir,
    "..",
    "src",
    "entries",
    "site.ts",
  );

  it("does not expose a theme field on SitePackage", () => {
    const src = readFileSync(siteTypesPath, "utf-8");
    expect(src).not.toMatch(/\btheme\s*:\s*string\s*;/);
    expect(src).not.toContain("SitePackage.theme");
  });

  it("exposes both personal and professional site authoring symbols", () => {
    const types = readFileSync(siteTypesPath, "utf-8");
    const entry = readFileSync(siteEntryPath, "utf-8");

    expect(types).toContain("export const PersonalLayout");
    expect(types).toContain("export function personalSitePlugin");
    expect(types).toContain("export const routes");
    expect(types).toContain("export const personalRoutes");
    expect(types).toContain("export const ProfessionalLayout");
    expect(types).toContain("export function professionalSitePlugin");
    expect(types).toContain("export const professionalRoutes");

    expect(entry).toContain("PersonalLayout");
    expect(entry).toContain("personalSitePlugin");
    expect(entry).toContain("personalRoutes");
    expect(entry).toContain("ProfessionalLayout");
    expect(entry).toContain("professionalSitePlugin");
    expect(entry).toContain("professionalRoutes");
  });
});
