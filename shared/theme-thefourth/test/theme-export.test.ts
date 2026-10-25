import { describe, expect, test } from "bun:test";
import themeCSS, { themeCSSOnly } from "../src/index";

describe("theme-thefourth export", () => {
  test("exports only its own theme CSS", () => {
    expect(themeCSS).toBe(themeCSSOnly);
    expect(themeCSS).toContain("The Fourth theme");
    expect(themeCSS).not.toContain("@layer theme-base");
  });

  test("sets the paper theatre typefaces", () => {
    expect(themeCSS).toContain("Inter Tight");
    expect(themeCSS).toContain("Playfair Display");
  });

  test("names the palette: ink, paper, red, mint and mustard", () => {
    expect(themeCSS).toMatch(/--palette-ink:\s*#232323/i);
    expect(themeCSS).toMatch(/--palette-paper:\s*#f4efe6/i);
    expect(themeCSS).toMatch(/--palette-red:\s*#ef5959/i);
    expect(themeCSS).toMatch(/--palette-mint:\s*#61f2ad/i);
    expect(themeCSS).toMatch(/--palette-mustard:\s*#d6c91d/i);
    expect(themeCSS).toMatch(/--color-brand:\s*var\(--palette-red\)/);
  });

  // The design has one look; a visitor whose browser asks for dark mode
  // still gets paper and ink.
  test("keeps paper and ink in dark mode", () => {
    expect(themeCSS).toMatch(/\[data-theme="dark"\][^{]*\{/);
    const dark = themeCSS.slice(themeCSS.indexOf('[data-theme="dark"]'));
    expect(dark).toMatch(/--color-bg:\s*var\(--palette-paper\)/);
  });
});
