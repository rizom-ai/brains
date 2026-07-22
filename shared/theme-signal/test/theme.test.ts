import { describe, expect, it } from "bun:test";
import defaultThemeCSS from "@rizom/theme-default";

import themeCSS, { FONT_IMPORT_RE, themeCSSOnly } from "../src";

describe("theme-signal", () => {
  it("layers its complete type and color register over theme-default", () => {
    expect(
      themeCSS.startsWith(defaultThemeCSS.replace(FONT_IMPORT_RE, "")),
    ).toBe(true);
    expect(themeCSS).toContain(themeCSSOnly);
    expect(themeCSS).not.toMatch(/@import[^\n]*(Barlow|Fraunces|JetBrains)/);
    expect(themeCSSOnly).toContain("family=Syne");
    expect(themeCSSOnly).toContain("family=Instrument+Sans");
    expect(themeCSSOnly).toContain("family=Azeret+Mono");
  });

  it("defines accessible light and dark signal palettes", () => {
    expect(themeCSSOnly).toContain("--signal-bone: #efede6");
    expect(themeCSSOnly).toContain("--signal-carbon: #151512");
    expect(themeCSSOnly).toContain("--signal-orange: #f04b18");
    expect(themeCSSOnly).toContain("--signal-cyan: #007f82");
    expect(themeCSSOnly).toContain('[data-theme="dark"]');
  });

  it("provides an intentional reduced-motion fallback", () => {
    expect(themeCSSOnly).toContain("@keyframes signal-breathe");
    expect(themeCSSOnly).toContain("prefers-reduced-motion: reduce");
  });
});
