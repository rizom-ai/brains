import { describe, expect, test } from "bun:test";
import defaultThemeCSS from "@rizom/theme-default";
import themeCSS, { themeCSSOnly } from "../src/index";

describe("theme-rizom export", () => {
  test("layers rizom overrides on top of theme-default", () => {
    expect(themeCSS.startsWith(defaultThemeCSS)).toBe(true);
    expect(themeCSS).toContain(themeCSSOnly);
    expect(themeCSS).not.toBe(themeCSSOnly);
  });

  test("leaves the .reveal container reveal.js decks render in unstyled", () => {
    // A theme rule on .reveal (such as a hidden-until-scrolled fade) hides
    // every deck: reveal.js names its own container .reveal.
    expect(themeCSSOnly).not.toMatch(/(^|[\s,}])\.reveal\b/);
  });
});
