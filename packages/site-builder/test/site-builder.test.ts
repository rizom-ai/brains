import { describe, it, expect, beforeEach } from "bun:test";
import { PageRegistry, LayoutRegistry, SiteBuilder } from "../src";
import type { PageDefinition } from "../src";

describe("SiteBuilder", () => {
  beforeEach(() => {
    PageRegistry.resetInstance();
    LayoutRegistry.resetInstance();
    SiteBuilder.resetInstance();
  });

  it("should register built-in layouts on initialization", () => {
    SiteBuilder.getInstance();
    const layoutRegistry = LayoutRegistry.getInstance();

    const layouts = layoutRegistry.list();
    expect(layouts.length).toBeGreaterThan(0);
    expect(layoutRegistry.get("hero")).toBeDefined();
    expect(layoutRegistry.get("features")).toBeDefined();
    expect(layoutRegistry.get("products")).toBeDefined();
  });

  it("should build pages successfully", async () => {
    const siteBuilder = SiteBuilder.getInstance();
    const pageRegistry = PageRegistry.getInstance();

    // Register a test page
    const testPage: PageDefinition = {
      path: "/test",
      title: "Test Page",
      pluginId: "test-plugin",
      sections: [
        {
          id: "hero-section",
          layout: "hero",
          content: {
            headline: "Test Headline",
            subheadline: "Test Subheadline",
          },
        },
      ],
    };

    pageRegistry.register(testPage);

    // Build the site
    const result = await siteBuilder.build({
      outputDir: "/tmp/test-site",
      enableContentGeneration: false,
    });

    expect(result.success).toBe(true);
    expect(result.pagesBuilt).toBe(1);
    expect(result.errors).toBeUndefined();
  });

  it("should report errors for invalid layouts", async () => {
    const siteBuilder = SiteBuilder.getInstance();
    const pageRegistry = PageRegistry.getInstance();

    // Register a page with invalid layout
    const testPage: PageDefinition = {
      path: "/invalid",
      title: "Invalid Page",
      pluginId: "test-plugin",
      sections: [
        {
          id: "bad-section",
          layout: "non-existent-layout",
        },
      ],
    };

    pageRegistry.register(testPage);

    // Build the site
    const result = await siteBuilder.build({
      outputDir: "/tmp/test-site",
      enableContentGeneration: false,
    });

    expect(result.success).toBe(false);
    expect(result.pagesBuilt).toBe(0);
    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]).toContain("Unknown layout");
  });
});
