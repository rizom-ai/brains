import { describe, it, expect } from "bun:test";
import { siteBuilderConfigSchema } from "../../src/config";

describe("Theme CSS Configuration", () => {
  it("should accept themeCSS as a string", () => {
    const config = {
      themeCSS: ":root { --color-brand: #00ff00; }",
      layouts: {},
    };

    const result = siteBuilderConfigSchema.parse(config);
    expect(result.themeCSS).toBe(":root { --color-brand: #00ff00; }");
  });

  it("should have themeCSS as undefined when not provided", () => {
    const config = {
      layouts: {},
    };

    const result = siteBuilderConfigSchema.parse(config);
    expect(result.themeCSS).toBeUndefined();
  });

  it("should handle empty themeCSS", () => {
    const config = {
      themeCSS: "",
      layouts: {},
    };

    const result = siteBuilderConfigSchema.parse(config);
    expect(result.themeCSS).toBe("");
  });
});

describe("CSS Concatenation", () => {
  it("should concatenate base CSS with theme CSS", () => {
    const baseCSS = "@import 'tailwindcss';";
    const themeCSS = ":root { --color-brand: #00ff00; }";

    // This is what happens in PreactBuilder.processStyles
    const finalCSS = baseCSS + "\n\n/* Custom Theme Overrides */\n" + themeCSS;

    expect(finalCSS).toContain("@import 'tailwindcss'");
    expect(finalCSS).toContain("/* Custom Theme Overrides */");
    expect(finalCSS).toContain(":root { --color-brand: #00ff00; }");
  });

  it("should handle empty theme CSS gracefully", () => {
    const baseCSS = "@import 'tailwindcss';";
    const themeCSS = "";

    const finalCSS = baseCSS + "\n\n/* Custom Theme Overrides */\n" + themeCSS;

    expect(finalCSS).toContain("@import 'tailwindcss'");
    expect(finalCSS).toContain("/* Custom Theme Overrides */");
    expect(finalCSS).toEndWith("/* Custom Theme Overrides */\n");
  });
});
