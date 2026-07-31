import { describe, expect, test } from "bun:test";
import themeCSS, { themeCSSOnly } from "../src/index";

describe("theme-default export", () => {
  test("exports only its own theme CSS", () => {
    expect(themeCSS).toBe(themeCSSOnly);
    expect(themeCSS).toContain("Default theme");
    // The shared base is prepended once by the shell's withThemeBase, never
    // inlined here. Its utilities are the only source of @layer theme-base,
    // so that is the marker — not a package name, which prose may mention.
    expect(themeCSS).not.toContain("@layer theme-base");
  });
});
