import { describe, expect, test } from "bun:test";
import themeCSS, { themeCSSOnly } from "../src/index";

describe("theme-default export", () => {
  test("exports only its own theme CSS", () => {
    expect(themeCSS).toBe(themeCSSOnly);
    expect(themeCSS).toContain("Default theme");
    expect(themeCSS).not.toContain("@brains/theme-base");
  });
});
