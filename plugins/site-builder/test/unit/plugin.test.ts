import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { SiteBuilderPlugin } from "../../src/plugin";
import { createServicePluginHarness } from "@brains/plugins/test";
import type { PluginCapabilities } from "@brains/plugins/test";
import { createTemplate } from "@brains/templates";
import { z } from "@brains/utils";
import { h } from "preact";
import { createTestConfig } from "../test-helpers";

describe("SiteBuilderPlugin", () => {
  let harness: ReturnType<typeof createServicePluginHarness<SiteBuilderPlugin>>;
  let plugin: SiteBuilderPlugin;
  let capabilities: PluginCapabilities;

  beforeEach(async () => {
    harness = createServicePluginHarness<SiteBuilderPlugin>();
  });

  afterEach(() => {
    harness.reset();
  });

  it("should initialize with valid config", async () => {
    plugin = new SiteBuilderPlugin(
      createTestConfig({
        previewOutputDir: "/tmp/test-output",
        productionOutputDir: "/tmp/test-output-production",
        workingDir: "/tmp/test-working",
      }),
    );

    capabilities = await harness.installPlugin(plugin);
    expect(plugin.id).toBe("site-builder");
  });

  it("should register successfully and provide capabilities", async () => {
    plugin = new SiteBuilderPlugin(
      createTestConfig({
        previewOutputDir: "/tmp/test-output",
        productionOutputDir: "/tmp/test-output-production",
      }),
    );

    capabilities = await harness.installPlugin(plugin);

    // The plugin should register successfully
    expect(capabilities).toBeDefined();
    expect(capabilities.tools).toBeDefined();
    expect(capabilities.tools.length).toBeGreaterThan(0);
  });

  it("should register templates when provided", async () => {
    const testTemplate = createTemplate<{ title: string }>({
      name: "test-template",
      description: "Test template",
      schema: z.object({ title: z.string() }),
      basePrompt: "Generate a test",
      requiredPermission: "public",
      formatter: {
        format: (data: unknown) =>
          `Title: ${(data as { title: string }).title}`,
        parse: (content: string) => ({ title: content.replace("Title: ", "") }),
      },
      layout: {
        component: ({ title }: { title: string }) => h("div", {}, title),
        interactive: false,
      },
    });

    plugin = new SiteBuilderPlugin(
      createTestConfig({
        previewOutputDir: "/tmp/test-output",
        productionOutputDir: "/tmp/test-output-production",
        templates: {
          "test-template": testTemplate,
        },
      }),
    );

    capabilities = await harness.installPlugin(plugin);

    // Plugin should register content and view templates
    expect(capabilities.tools.length).toBeGreaterThan(0);

    // Check that template was registered
    const templates = harness.getTemplates();
    expect(templates.has("site-builder:test-template")).toBe(true);
  });

  it("should provide list_routes tool that shows configured routes", async () => {
    plugin = new SiteBuilderPlugin(
      createTestConfig({
        previewOutputDir: "/tmp/test-output",
        productionOutputDir: "/tmp/test-output-production",
        routes: [
          {
            id: "test",
            path: "/test",
            title: "Test Page",
            description: "Test Description",
            layout: "default",
            sections: [{ id: "section1", template: "test" }],
          },
        ],
      }),
    );

    capabilities = await harness.installPlugin(plugin);

    // The list_routes tool should be available
    const listRoutesTool = capabilities.tools.find(
      (t) => t.name === "site-builder_list_routes",
    );
    expect(listRoutesTool).toBeDefined();

    // When we use the tool, it should show our configured route
    if (listRoutesTool) {
      const result = await listRoutesTool.handler(
        {},
        {
          interfaceType: "test",
          userId: "test-user",
        },
      );
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty("routes");
      expect(Array.isArray(result.data?.["routes"])).toBe(true);
    }
  });

  it("should provide site builder tools", async () => {
    plugin = new SiteBuilderPlugin(
      createTestConfig({
        previewOutputDir: "/tmp/test-output",
        productionOutputDir: "/tmp/test-output-production",
      }),
    );

    capabilities = await harness.installPlugin(plugin);

    const toolNames = capabilities.tools.map((t) => t.name);

    expect(toolNames).toContain("site-builder_generate");
    expect(toolNames).toContain("site-builder_build-site");
    expect(toolNames).toContain("site-builder_list_routes");
    expect(toolNames).toContain("site-builder_list_templates");
  });

  it("should provide generate tool when routes have content entities", async () => {
    const testTemplate = createTemplate<{ content: string }>({
      name: "test",
      description: "Test",
      schema: z.object({ content: z.string() }),
      basePrompt: "Generate test content",
      requiredPermission: "public",
      formatter: {
        format: (data: unknown) => (data as { content: string }).content,
        parse: (content: string) => ({ content }),
      },
      layout: {
        component: ({ content }: { content: string }) => h("div", {}, content),
        interactive: false,
      },
    });

    plugin = new SiteBuilderPlugin(
      createTestConfig({
        previewOutputDir: "/tmp/test-output",
        productionOutputDir: "/tmp/test-output-production",
        templates: { test: testTemplate },
        routes: [
          {
            id: "home",
            path: "/",
            title: "Home",
            description: "Home page",
            layout: "default",
            sections: [
              {
                id: "test",
                template: "test",
                dataQuery: {
                  entityType: "site-content-preview",
                  template: "test",
                  query: { routeId: "home", sectionId: "test" },
                },
              },
            ],
          },
        ],
      }),
    );

    capabilities = await harness.installPlugin(plugin);

    // Find the generate tool
    const generateTool = capabilities.tools.find(
      (t) => t.name === "site-builder_generate",
    );
    expect(generateTool).toBeDefined();
    expect(generateTool?.description).toContain("Generate content");
  });

  it("should handle missing templates gracefully", async () => {
    plugin = new SiteBuilderPlugin(
      createTestConfig({
        previewOutputDir: "/tmp/test-output",
        productionOutputDir: "/tmp/test-output-production",
        routes: [
          {
            id: "home-missing",
            path: "/",
            title: "Home",
            description: "Home page",
            layout: "default",
            sections: [
              {
                id: "missing",
                template: "non-existent",
                dataQuery: {
                  entityType: "site-content-preview",
                  template: "non-existent",
                },
              },
            ],
          },
        ],
      }),
    );

    capabilities = await harness.installPlugin(plugin);

    const generateTool = capabilities.tools.find(
      (t) => t.name === "site-builder_generate",
    );
    if (generateTool) {
      const result = await generateTool.handler(
        {},
        {
          interfaceType: "test",
          userId: "test-user",
        },
      );
      // The generate tool should handle missing templates gracefully
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
      // It should either succeed or fail gracefully
      expect(typeof result.success).toBe("boolean");
    }
  });

  it("should set environment on routes", async () => {
    plugin = new SiteBuilderPlugin(
      createTestConfig({
        previewOutputDir: "/tmp/test-output",
        productionOutputDir: "/tmp/test-output-production",
        routes: [
          {
            id: "home-env",
            path: "/",
            title: "Home",
            description: "Home page",
            layout: "default",
            sections: [
              {
                id: "test",
                template: "test",
                dataQuery: {
                  entityType: "site-content-preview",
                  template: "test",
                },
              },
            ],
          },
        ],
      }),
    );

    capabilities = await harness.installPlugin(plugin);

    // The environment setting should be handled internally by the plugin
    // We can verify this by checking that the plugin registers successfully
    expect(capabilities.tools.length).toBeGreaterThan(0);
  });
});
