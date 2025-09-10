import { describe, test, expect } from "bun:test";
import { siteBuilderConfigSchema } from "./config";

describe("siteBuilderConfigSchema", () => {
  test("accepts valid config with themeCSS", () => {
    const config = {
      templates: {},
      routes: [],
      layouts: {},
      themeCSS: ":root { --color-brand: #10b981; }",
    };

    const result = siteBuilderConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.themeCSS).toBe(":root { --color-brand: #10b981; }");
    }
  });

  test("themeCSS is optional", () => {
    const config = {
      templates: {},
      routes: [],
      layouts: {},
    };

    const result = siteBuilderConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.themeCSS).toBeUndefined();
    }
  });

  test("accepts empty themeCSS", () => {
    const config = {
      templates: {},
      routes: [],
      layouts: {},
      themeCSS: "",
    };

    const result = siteBuilderConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });
});
