import { describe, it, expect } from "bun:test";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

/*
 * Regression guard: "@rizom/brain/themes" must export composeTheme
 * so consumers can build a complete theme CSS string without
 * importing @brains/theme-base directly.
 *
 * Every site-specific theme CSS file (shared/theme-STAR/src/theme.css)
 * contains only the brand overrides. The base utilities, palette
 * tokens, and @theme inline declarations that expose color-brand /
 * color-bg / etc. to tailwind live in theme-base.css and are
 * prepended by composeTheme() at build time. Without composing,
 * tailwind can't resolve utilities like bg-brand, text-brand, or
 * focus-visible:ring-brand and the site build crashes with:
 *
 *     Cannot apply unknown utility class focus-visible:ring-brand
 *
 * Discovered booting apps/mylittlephoney as the first standalone
 * extraction. The mylittlephoney site bypassed composeTheme because
 * it wasn't reachable from @rizom/brain; once exposed as part of
 * the themes entry the site build resolved cleanly.
 *
 * Source checks on:
 *   1. packages/brain-cli/src/entries/themes.ts exists and re-exports
 *      composeTheme from @brains/theme-base
 *   2. packages/brain-cli/src/types/themes.d.ts exists with a
 *      composeTheme(themeCSS: string): string declaration
 *   3. packages/brain-cli/package.json declares the ./themes subpath
 *      in the exports map with both types and import
 *   4. packages/brain-cli/scripts/build.ts libraryEntries list
 *      includes themes so the build produces dist/themes.js and
 *      copies the hand-written dist/themes.d.ts
 */
describe("@rizom/brain/themes export", () => {
  const pkgDir = join(import.meta.dir, "..");

  it("src/entries/themes.ts exists and re-exports composeTheme", () => {
    const path = join(pkgDir, "src", "entries", "themes.ts");
    expect(existsSync(path)).toBe(true);
    const src = readFileSync(path, "utf-8");
    expect(src).toMatch(
      /export\s+\{[^}]*\bcomposeTheme\b[^}]*\}\s+from\s+["']@brains\/theme-base["']/s,
    );
  });

  it("src/types/themes.d.ts declares composeTheme without coupling themes to SitePackage", () => {
    const path = join(pkgDir, "src", "types", "themes.d.ts");
    expect(existsSync(path)).toBe(true);
    const src = readFileSync(path, "utf-8");
    expect(src).toMatch(/export\s+function\s+composeTheme\s*\(/);
    expect(src).not.toContain("SitePackage.theme");
    expect(src).not.toContain("theme: composeTheme");
  });

  it("package.json exports ./themes with types + import", () => {
    const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf-8"));
    expect(pkg.exports?.["./themes"]).toBeDefined();
    expect(pkg.exports["./themes"].types).toBe("./dist/themes.d.ts");
    expect(pkg.exports["./themes"].import).toBe("./dist/themes.js");
  });

  it("scripts/build.ts libraryEntries includes themes", () => {
    const src = readFileSync(join(pkgDir, "scripts", "build.ts"), "utf-8");
    // Match a libraryEntries array literal containing a `name: "themes"` entry.
    // The match is scoped to the libraryEntries array so a stray
    // `"themes"` string elsewhere doesn't false-positive.
    const libEntries = src.match(
      /libraryEntries\s*=\s*\[([\s\S]*?)\]\s*as\s+const/,
    );
    expect(libEntries).not.toBeNull();
    expect(libEntries?.[1] ?? "").toMatch(/name:\s*["']themes["']/);
  });
});
