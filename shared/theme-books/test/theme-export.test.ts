import { describe, expect, test } from "bun:test";
import themeCSS, { themeCSSOnly } from "../src/index";

describe("theme-books export", () => {
  test("exports only its own theme CSS", () => {
    expect(themeCSS).toBe(themeCSSOnly);
    expect(themeCSS).toContain("Books theme");
    expect(themeCSS).not.toContain("@layer theme-base");
  });

  test("sets the reading typefaces", () => {
    expect(themeCSS).toContain("Bodoni Moda");
    expect(themeCSS).toContain("Literata");
    expect(themeCSS).toContain("Courier Prime");
  });

  test("brands with the red pencil and has a dark mode", () => {
    expect(themeCSS).toMatch(/--color-brand:\s*var\(--palette-pencil\)/);
    expect(themeCSS).toContain('[data-theme="dark"]');
  });

  test("sets book text in the theme's ink, not the typography plugin's grey", () => {
    expect(themeCSS).toMatch(
      /\.book-text \.prose\s*\{[^}]*--tw-prose-body:\s*var\(--color-text\)/,
    );
    expect(themeCSS).toMatch(/\.book-text \.prose\s*\{[^}]*max-width:\s*none/);
  });

  test("prints emphasis in book text as letter-spacing, like the first editions", () => {
    expect(themeCSS).toMatch(/\.book-text em\s*\{[^}]*letter-spacing/);
    expect(themeCSS).toMatch(/\.book-text em\s*\{[^}]*font-style:\s*normal/);
  });
});
