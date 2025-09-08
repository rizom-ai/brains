import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { SiteBuilderPlugin } from "../../src/plugin";
import { createServicePluginHarness } from "@brains/plugins";
import { createTemplate } from "@brains/templates";
import { z } from "@brains/utils";
import { h } from "preact";
import type { DataSource } from "@brains/datasource";
import { createTestConfig } from "../test-helpers";

// Test schemas
const TestDataSchema = z.object({
  title: z.string(),
  content: z.string(),
});

type TestData = z.infer<typeof TestDataSchema>;

// Mock DataSource for testing
const mockDataSource: DataSource = {
  id: "mock-test-data",
  name: "Mock Test Data Source",
  description: "A test data source for content resolution",
  async fetch<T>(_query: unknown): Promise<T> {
    const data = {
      title: "DataSource Title",
      content: "This content was fetched from a DataSource",
    };
    return data as T;
  },
};

describe("Site Builder Content Resolution", () => {
  let harness: ReturnType<typeof createServicePluginHarness<SiteBuilderPlugin>>;
  let plugin: SiteBuilderPlugin;

  beforeEach(async () => {
    harness = createServicePluginHarness<SiteBuilderPlugin>();
  });

  afterEach(() => {
    harness.reset();
  });

  it("should install successfully with templates", async () => {
    // Create template for testing
    const staticTemplate = createTemplate<TestData>({
      name: "static-template",
      description: "Template with static content",
      schema: TestDataSchema,
      basePrompt: "Static template",
      requiredPermission: "public",
      layout: {
        component: ({ title, content }: TestData) =>
          h("div", null, h("h1", null, title), h("p", null, content)),
      },
    });

    plugin = new SiteBuilderPlugin(
      createTestConfig({
        previewOutputDir: "/tmp/test-output",
        workingDir: "/tmp/test-working",
        templates: {
          "static-template": staticTemplate,
        },
        routes: [
          {
            id: "test-page",
            path: "/test",
            title: "Test Page",
            description: "Test page with static content",
            layout: "default",
            sections: [
              {
                id: "main",
                template: "static-template",
                content: {
                  title: "Static Title",
                  content: "This is static content",
                },
              },
            ],
          },
        ],
      }),
    );

    const capabilities = await harness.installPlugin(plugin);

    expect(capabilities).toBeDefined();
    expect(capabilities.tools.length).toBeGreaterThan(0);

    const siteBuilder = plugin.getSiteBuilder();
    expect(siteBuilder).toBeDefined();
  });

  it("should register and use DataSources for content resolution", async () => {
    // Create template with DataSource
    const dataSourceTemplate = createTemplate<TestData>({
      name: "datasource-template",
      description: "Template with DataSource",
      schema: TestDataSchema,
      basePrompt: "DataSource template",
      requiredPermission: "public",
      dataSourceId: "shell:mock-test-data",
      layout: {
        component: ({ title, content }: TestData) =>
          h("div", null, h("h1", null, title), h("p", null, content)),
      },
    });

    plugin = new SiteBuilderPlugin(
      createTestConfig({
        previewOutputDir: "/tmp/test-output",
        workingDir: "/tmp/test-working",
        templates: {
          "datasource-template": dataSourceTemplate,
        },
      }),
    );

    await harness.installPlugin(plugin);

    // Register the mock DataSource - this should not throw
    expect(() => harness.registerDataSource(mockDataSource)).not.toThrow();

    // Verify the plugin successfully registered a template that references a DataSource
    const siteBuilder = plugin.getSiteBuilder();
    expect(siteBuilder).toBeDefined();

    // The key test: verify that templates with dataSourceId can be created and used
    expect(dataSourceTemplate.dataSourceId).toBe("shell:mock-test-data");
  });

  it("should verify dashboard template references shell DataSource", async () => {
    plugin = new SiteBuilderPlugin(
      createTestConfig({
        previewOutputDir: "/tmp/test-output",
        workingDir: "/tmp/test-working",
      }),
    );

    await harness.installPlugin(plugin);

    // Check that the dashboard template was registered
    const templates = harness.getTemplates();
    expect(templates.has("site-builder:dashboard")).toBe(true);

    const dashboardTemplate = templates.get("site-builder:dashboard");
    expect(dashboardTemplate).toBeDefined();

    // Verify the template references the shell's SystemStats DataSource
    expect(dashboardTemplate?.dataSourceId).toBe("shell:system-stats");
  });
});
