import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { PageRegistry, LayoutRegistry, SiteBuilder } from "../src";
import type { PageDefinition } from "@brains/types";
import { createSilentLogger, PluginTestHarness } from "@brains/utils";
import { createMockStaticSiteBuilder } from "./mocks/mock-static-site-builder";
import { z } from "zod";

describe("SiteBuilder", () => {
  const logger = createSilentLogger();
  const harness = new PluginTestHarness();

  beforeEach(() => {
    PageRegistry.resetInstance();
    LayoutRegistry.resetInstance();
    SiteBuilder.resetInstance();
    // Set mock as default for all tests
    SiteBuilder.setDefaultStaticSiteBuilderFactory(createMockStaticSiteBuilder);
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("should initialize without built-in layouts", () => {
    const context = harness.getPluginContext();
    SiteBuilder.getInstance(logger, context);
    const layoutRegistry = LayoutRegistry.getInstance();

    // Site-builder should start with no layouts
    // Layouts are registered by plugins
    const layouts = layoutRegistry.list();
    expect(layouts.length).toBe(0);
  });

  it("should build pages successfully", async () => {
    const context = harness.getPluginContext();
    const siteBuilder = SiteBuilder.getInstance(logger, context);
    const pageRegistry = PageRegistry.getInstance();
    const layoutRegistry = LayoutRegistry.getInstance();

    // Register a test layout first
    layoutRegistry.register({
      name: "test-layout",
      component: "@test/layouts/test.astro",
      description: "Test layout",
      schema: z.object({
        headline: z.string(),
        subheadline: z.string(),
      }),
    });

    // Register a test page
    const testPage: PageDefinition = {
      path: "/test",
      title: "Test Page",
      pluginId: "test-plugin",
      sections: [
        {
          id: "test-section",
          layout: "test-layout",
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
    const context = harness.getPluginContext();
    const siteBuilder = SiteBuilder.getInstance(logger, context);
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
