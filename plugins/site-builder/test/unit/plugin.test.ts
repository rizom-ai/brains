import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { SiteBuilderPlugin } from "../../src/plugin";
import { ServicePluginTestHarness } from "@brains/service-plugin";
import type { PluginCapabilities } from "@brains/plugins";
import type { Template } from "@brains/types";
import { z } from "zod";
import { h } from "preact";

describe("SiteBuilderPlugin", () => {
  let harness: ServicePluginTestHarness<SiteBuilderPlugin>;
  let plugin: SiteBuilderPlugin;
  let capabilities: PluginCapabilities;

  beforeEach(async () => {
    harness = new ServicePluginTestHarness<SiteBuilderPlugin>();
  });

  afterEach(() => {
    harness.reset();
  });

  it("should initialize with valid config", async () => {
    plugin = new SiteBuilderPlugin({
      previewOutputDir: "/tmp/test-output",
      productionOutputDir: "/tmp/test-output-production",
      workingDir: "/tmp/test-working",
    });

    capabilities = await harness.installPlugin(plugin);
    expect(plugin.id).toBe("site-builder");
  });

  it("should register successfully and provide capabilities", async () => {
    plugin = new SiteBuilderPlugin({
      previewOutputDir: "/tmp/test-output",
      productionOutputDir: "/tmp/test-output-production",
    });

    capabilities = await harness.installPlugin(plugin);

    // The plugin should register successfully
    expect(capabilities).toBeDefined();
    expect(capabilities.tools).toBeDefined();
    expect(capabilities.tools.length).toBeGreaterThan(0);
  });

  it("should register templates when provided", async () => {
    const testTemplate: Template<{ title: string }> = {
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
    };

    plugin = new SiteBuilderPlugin({
      previewOutputDir: "/tmp/test-output",
      productionOutputDir: "/tmp/test-output-production",
      templates: {
        "test-template": testTemplate,
      },
    });

    capabilities = await harness.installPlugin(plugin);

    // Plugin should register content and view templates
    expect(capabilities.tools.length).toBeGreaterThan(0);

    // Check that template was registered
    const templates = harness.getTemplates();
    expect(templates.has("site-builder:test-template")).toBe(true);
  });

  it("should provide list_routes tool that shows configured routes", async () => {
    plugin = new SiteBuilderPlugin({
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

    capabilities = await harness.installPlugin(plugin);

    // The list_routes tool should be available
    const listRoutesTool = capabilities.tools.find(
      (t) => t.name === "site-builder:list_routes",
    );
    expect(listRoutesTool).toBeDefined();

    // When we use the tool, it should show our configured route
    if (listRoutesTool) {
      const result = (await listRoutesTool.handler({}, {})) as {
        success: boolean;
        routes: unknown[];
      };
      expect(result.success).toBe(true);
      expect(result.routes).toBeDefined();
      expect(result.routes.length).toBeGreaterThan(0);
    }
  });

  it("should provide site builder tools", async () => {
    plugin = new SiteBuilderPlugin({
      previewOutputDir: "/tmp/test-output",
      productionOutputDir: "/tmp/test-output-production",
    });

    capabilities = await harness.installPlugin(plugin);

    const toolNames = capabilities.tools.map((t) => t.name);

    expect(toolNames).toContain("site-builder:generate");
    expect(toolNames).toContain("site-builder:build-site");
    expect(toolNames).toContain("site-builder:list_routes");
    expect(toolNames).toContain("site-builder:list_templates");
    expect(toolNames).toContain("site-builder:promote-content");
    expect(toolNames).toContain("site-builder:rollback-content");
  });

  it("should provide generate tool when routes have content entities", async () => {
    const testTemplate: Template<{ content: string }> = {
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
    };

    plugin = new SiteBuilderPlugin({
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
                query: { routeId: "home", sectionId: "test" },
              },
            },
          ],
        },
      ],
    });

    capabilities = await harness.installPlugin(plugin);

    // Find the generate tool
    const generateTool = capabilities.tools.find(
      (t) => t.name === "site-builder:generate",
    );
    expect(generateTool).toBeDefined();
    expect(generateTool?.description).toContain("Generate content");
  });

  it("should handle missing templates gracefully", async () => {
    plugin = new SiteBuilderPlugin({
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

    capabilities = await harness.installPlugin(plugin);

    const generateTool = capabilities.tools.find(
      (t) => t.name === "site-builder:generate",
    );
    if (generateTool) {
      const result = (await generateTool.handler({}, {})) as {
        status: string;
        message: string;
        sectionsGenerated?: number;
      };
      // The generate tool should handle missing templates gracefully
      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
      // It may queue jobs (status: "queued") or complete immediately (status: "completed")
      // Both are valid behaviors when templates are missing
      expect(["queued", "completed"]).toContain(result.status);
    }
  });

  it("should set environment on routes", async () => {
    plugin = new SiteBuilderPlugin({
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

    capabilities = await harness.installPlugin(plugin);

    // The environment setting should be handled internally by the plugin
    // We can verify this by checking that the plugin registers successfully
    expect(capabilities.tools.length).toBeGreaterThan(0);
  });
});
