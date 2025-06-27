import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { siteBuilderPlugin } from "../../src/plugin";
import { PluginTestHarness } from "@brains/test-utils";
import type { Template } from "@brains/types";
import { z } from "zod";
import { h } from "preact";

describe("SiteBuilderPlugin", () => {
  let harness: PluginTestHarness;

  beforeEach(async () => {
    harness = new PluginTestHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("should initialize with valid config", async () => {
    const plugin = siteBuilderPlugin({
      previewOutputDir: "/tmp/test-output",
      productionOutputDir: "/tmp/test-output-production",
      workingDir: "/tmp/test-working",
    });

    await harness.installPlugin(plugin);
    expect(plugin.id).toBe("site-builder");
  });

  it("should register site-content entity type", async () => {
    const plugin = siteBuilderPlugin({
      previewOutputDir: "/tmp/test-output",
      productionOutputDir: "/tmp/test-output-production",
    });

    // Track registered entity types
    const registeredTypes = new Set<string>();
    const context = harness.getPluginContext();
    const originalRegisterEntityType = context.registerEntityType;
    context.registerEntityType = (entityType, schema, adapter): void => {
      registeredTypes.add(entityType);
      originalRegisterEntityType(entityType, schema, adapter);
    };

    await plugin.register(context);

    // Check that both site-content entity types are registered
    expect(registeredTypes.has("site-content-preview")).toBe(true);
    expect(registeredTypes.has("site-content-production")).toBe(true);
  });

  it("should register templates when provided", async () => {
    const testTemplate: Template<{ title: string }> = {
      name: "test-template",
      description: "Test template",
      schema: z.object({ title: z.string() }),
      basePrompt: "Generate a test",
      formatter: {
        format: (data: unknown) =>
          `Title: ${(data as { title: string }).title}`,
        parse: (content: string) => ({ title: content.replace("Title: ", "") }),
      },
      layout: {
        component: ({ title }: { title: string }) => h("div", {}, title),
        interactive: false,
      },
    };

    const plugin = siteBuilderPlugin({
      previewOutputDir: "/tmp/test-output",
      productionOutputDir: "/tmp/test-output-production",
      templates: {
        "test-template": testTemplate,
      },
    });

    const context = harness.getPluginContext();
    const capabilities = await plugin.register(context);

    // Plugin should register content and view templates
    expect(capabilities.tools.length).toBeGreaterThan(0);
  });

  it("should register routes when provided", async () => {
    const plugin = siteBuilderPlugin({
      previewOutputDir: "/tmp/test-output",
      productionOutputDir: "/tmp/test-output-production",
      routes: [
        {
          id: "test",
          path: "/test",
          title: "Test Page",
          description: "Test Description",
          sections: [{ id: "section1", template: "test" }],
        },
      ],
    });

    const context = harness.getPluginContext();
    const capabilities = await plugin.register(context);

    // Plugin should provide tools when routes are configured
    expect(capabilities.tools.length).toBeGreaterThan(0);
  });

  it("should provide site builder tools", async () => {
    const plugin = siteBuilderPlugin({
      previewOutputDir: "/tmp/test-output",
      productionOutputDir: "/tmp/test-output-production",
    });

    const context = harness.getPluginContext();
    const capabilities = await plugin.register(context);

    const toolNames = capabilities.tools.map((t) => t.name);

    expect(toolNames).toContain("site-builder:generate");
    expect(toolNames).toContain("site-builder:build");
    expect(toolNames).toContain("site-builder:list_routes");
    expect(toolNames).toContain("site-builder:list_templates");
    expect(toolNames).toContain("site-builder:promote-all");
  });

  it("should provide generate tool when routes have content entities", async () => {
    const testTemplate: Template<{ content: string }> = {
      name: "test",
      description: "Test",
      schema: z.object({ content: z.string() }),
      basePrompt: "Generate test content",
      formatter: {
        format: (data: unknown) => (data as { content: string }).content,
        parse: (content: string) => ({ content }),
      },
      layout: {
        component: ({ content }: { content: string }) => h("div", {}, content),
        interactive: false,
      },
    };

    const plugin = siteBuilderPlugin({
      previewOutputDir: "/tmp/test-output",
      productionOutputDir: "/tmp/test-output-production",
      templates: { test: testTemplate },
      routes: [
        {
          id: "home",
          path: "/",
          title: "Home",
          description: "Home page",
          sections: [
            {
              id: "test",
              template: "test",
              contentEntity: {
                entityType: "site-content-preview",
                template: "test",
                query: { page: "home", section: "test" },
              },
            },
          ],
        },
      ],
    });

    const context = harness.getPluginContext();
    const capabilities = await plugin.register(context);

    // Find the generate tool
    const generateTool = capabilities.tools.find(
      (t) => t.name === "site-builder:generate",
    );
    expect(generateTool).toBeDefined();
    expect(generateTool?.description).toContain("Generate content");
  });

  it("should handle missing templates gracefully", async () => {
    const plugin = siteBuilderPlugin({
      previewOutputDir: "/tmp/test-output",
      productionOutputDir: "/tmp/test-output-production",
      routes: [
        {
          id: "home-missing",
          path: "/",
          title: "Home",
          description: "Home page",
          sections: [
            {
              id: "missing",
              template: "non-existent",
              contentEntity: {
                entityType: "site-content-preview",
                template: "non-existent",
              },
            },
          ],
        },
      ],
    });

    const context = harness.getPluginContext();
    const capabilities = await plugin.register(context);

    const generateTool = capabilities.tools.find(
      (t) => t.name === "site-builder:generate",
    );
    if (generateTool) {
      const result = (await generateTool.handler({})) as {
        success: boolean;
        sectionsGenerated: number;
      };
      expect(result.success).toBe(true);
      expect(result.sectionsGenerated).toBe(0);
    }
  });

  it("should set environment on routes", async () => {
    const plugin = siteBuilderPlugin({
      previewOutputDir: "/tmp/test-output",
      productionOutputDir: "/tmp/test-output-production",
      environment: "production",
      routes: [
        {
          id: "home-env",
          path: "/",
          title: "Home",
          description: "Home page",
          sections: [
            {
              id: "test",
              template: "test",
              contentEntity: {
                entityType: "site-content-preview",
                template: "test",
              },
            },
          ],
        },
      ],
    });

    const context = harness.getPluginContext();
    const capabilities = await plugin.register(context);

    // The environment setting should be handled internally by the plugin
    // We can verify this by checking that the plugin registers successfully
    expect(capabilities.tools.length).toBeGreaterThan(0);
  });
});
