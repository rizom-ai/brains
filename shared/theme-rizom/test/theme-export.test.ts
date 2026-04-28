import { describe, expect, test } from "bun:test";
import defaultThemeCSS from "@brains/theme-default";
import themeCSS, { themeCSSOnly } from "../src/index";

describe("theme-rizom export", () => {
  test("layers rizom overrides on top of theme-default", () => {
    expect(themeCSS.startsWith(defaultThemeCSS)).toBe(true);
    expect(themeCSS).toContain(themeCSSOnly);
    expect(themeCSS).not.toBe(themeCSSOnly);
  });
});
