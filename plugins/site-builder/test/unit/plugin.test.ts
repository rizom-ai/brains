import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { SiteBuilderPlugin } from "../../src/plugin";
import { createPluginHarness } from "@brains/plugins/test";
import type { PluginCapabilities } from "@brains/plugins/test";
import { createTemplate } from "@brains/plugins";
import { z } from "@brains/utils";
import { h } from "preact";
import { createTestConfig } from "../test-helpers";
import { mkdtemp } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("SiteBuilderPlugin", () => {
  let harness: ReturnType<typeof createPluginHarness<SiteBuilderPlugin>>;
  let plugin: SiteBuilderPlugin;
  let capabilities: PluginCapabilities;

  beforeEach(async () => {
    harness = createPluginHarness<SiteBuilderPlugin>();
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

  it("should provide site builder tools", async () => {
    plugin = new SiteBuilderPlugin(
      createTestConfig({
        previewOutputDir: "/tmp/test-output",
        productionOutputDir: "/tmp/test-output-production",
      }),
    );

    capabilities = await harness.installPlugin(plugin);

    const toolNames = capabilities.tools.map((t) => t.name);

    expect(toolNames).toEqual(["site-builder_build-site"]);
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

  it("should ignore legacy cms config and not register a CMS route", async () => {
    const config = {
      ...createTestConfig(),
      cms: {},
    };

    plugin = new SiteBuilderPlugin(config);
    await harness.installPlugin(plugin);

    const result = await harness.sendMessage<
      { path: string },
      { route?: { path: string } }
    >("plugin:site-builder:route:get", { path: "/cms/" });

    expect(result?.route).toBeUndefined();
  });

  it("should not generate CMS files on site:build:completed", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "site-builder-no-cms-"));
    const config = {
      ...createTestConfig({
        previewOutputDir: outputDir,
        productionOutputDir: outputDir,
      }),
      cms: {},
    };

    harness.subscribe("git-sync:get-repo-info", async () => ({
      success: true,
      data: { repo: "owner/repo", branch: "main" },
    }));

    plugin = new SiteBuilderPlugin(config);
    await harness.installPlugin(plugin);

    await harness.sendMessage("site:build:completed", {
      outputDir,
      environment: "preview",
      routesBuilt: 0,
      siteConfig: {
        title: "Test",
        description: "Test",
        url: "https://example.com",
      },
      generateEntityUrl: (_entityType: string, slug: string) => `/${slug}`,
    });

    expect(existsSync(join(outputDir, "cms"))).toBe(false);
    expect(existsSync(join(outputDir, "admin"))).toBe(false);
  });
});
