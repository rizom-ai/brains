import { describe, test, expect } from "bun:test";
import { siteBuilderConfigSchema } from "../../src/config";

describe("siteBuilderConfigSchema", () => {
  // The site's entity display reaches the builder whole: the builder takes
  // the site contract's schema instead of a copy that drops what it lacks.
  test("keeps every entity display setting the site declares", () => {
    const entityDisplay = {
      post: {
        label: "Essay",
        citable: true,
        paginate: true,
        navigation: { slot: "primary" as const, priority: 10 },
      },
      topic: { label: "Topic", navigation: { slot: "secondary" as const } },
      note: { label: "Note", citable: false },
    };
    const result = siteBuilderConfigSchema.parse({ entityDisplay });
    expect(result.entityDisplay).toEqual(entityDisplay);
  });

  test("rejects invalid or unknown entity display fields instead of silently stripping them", () => {
    for (const entry of [
      { label: "Post", citable: "true" },
      { label: "Post", citabel: true },
      { label: "Post", pageSize: 1.5 },
      { label: "" },
    ]) {
      expect(
        siteBuilderConfigSchema.safeParse({ entityDisplay: { post: entry } })
          .success,
      ).toBe(false);
    }
  });

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

  test("validates global head scripts and defaults them to empty", () => {
    expect(siteBuilderConfigSchema.parse({}).headScripts).toEqual([]);
    expect(
      siteBuilderConfigSchema.parse({
        headScripts: ['<script src="/site.js"></script>'],
      }).headScripts,
    ).toEqual(['<script src="/site.js"></script>']);
  });

  test("previewOutputDir defaults to ./dist/site-preview", () => {
    const config = {
      templates: {},
      routes: [],
      layouts: {},
    };

    const result = siteBuilderConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.previewOutputDir).toBe("./dist/site-preview");
    }
  });

  test("previewOutputDir can be overridden", () => {
    const config = {
      templates: {},
      routes: [],
      layouts: {},
      previewOutputDir: "./custom/preview",
    };

    const result = siteBuilderConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.previewOutputDir).toBe("./custom/preview");
    }
  });

  test("productionOutputDir defaults to ./dist/site-production", () => {
    const config = {
      templates: {},
      routes: [],
      layouts: {},
    };

    const result = siteBuilderConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.productionOutputDir).toBe("./dist/site-production");
    }
  });
});
