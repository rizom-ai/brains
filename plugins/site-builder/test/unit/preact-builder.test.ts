import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createPreactBuilder } from "../../src/lib/preact-builder";
import type { BuildContext } from "../../src/lib/static-site-builder";
import type {
  ServicePluginContext,
  ViewTemplate,
  OutputFormat,
} from "@brains/plugins";
import type { RouteDefinition } from "../../src/types/routes";
import { createSilentLogger } from "@brains/plugins";
import { z } from "@brains/utils";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { h, type VNode } from "preact";
import { MockCSSProcessor } from "../mocks/mock-css-processor";

describe("PreactBuilder", () => {
  let testDir: string;
  let outputDir: string;
  let workingDir: string;
  let logger: ReturnType<typeof createSilentLogger>;

  beforeEach(async () => {
    // Create temporary directories for testing
    testDir = join(tmpdir(), `preact-builder-test-${Date.now()}`);
    outputDir = join(testDir, "output");
    workingDir = join(testDir, "working");
    logger = createSilentLogger();
  });

  afterEach(async () => {
    // Clean up test directories
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("should build a simple route", async () => {
    const builder = createPreactBuilder({
      logger,
      outputDir,
      workingDir,
      cssProcessor: new MockCSSProcessor(),
    });

    // Create test component using Preact h function
    const TestComponent = (props: unknown): VNode => {
      const { title } = props as { title: string };
      return h("div", {}, title);
    };

    // Create mock view registry
    const viewRegistry = {
      getViewTemplate: (name: string): ViewTemplate | undefined => {
        if (name === "test") {
          return {
            name: "test",
            schema: z.object({ title: z.string() }),
            pluginId: "test-plugin",
            renderers: { web: TestComponent },
            interactive: false,
          };
        }
        return undefined;
      },
      registerRoute: (): void => {},
      getRoute: (): undefined => undefined,
      listRoutes: (): RouteDefinition[] => [],
      registerViewTemplate: (): void => {},
      listViewTemplates: (): ViewTemplate[] => [],
      validateViewTemplate: (): boolean => true,
      getRenderer: (): undefined => undefined,
      hasRenderer: (): boolean => false,
      listFormats: (): OutputFormat[] => [],
    };

    // Create a minimal mock pluginContext with only necessary fields
    const mockPluginContext = {
      getPlugin: (id: string) => ({
        id,
        metadata: { name: id, version: "1.0.0", packageName: `@test/${id}` },
      }),
    } as unknown as ServicePluginContext;

    const buildContext: BuildContext = {
      routes: [
        {
          id: "test",
          path: "/",
          title: "Test Page",
          description: "Test Description",
          sections: [
            {
              id: "test-section",
              template: "test",
              content: { title: "Hello World" },
            },
          ],
        },
      ],
      getViewTemplate: (name: string) => viewRegistry.getViewTemplate(name),
      pluginContext: mockPluginContext,
      siteConfig: {
        title: "Test Site",
        description: "Test Site Description",
      },
      getContent: async (_route, section) => section.content ?? null,
    };

    await builder.build(buildContext, () => {});

    // Check that output files were created
    const indexPath = join(outputDir, "index.html");
    const exists = await fs
      .access(indexPath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);

    // Check HTML content
    const html = await fs.readFile(indexPath, "utf-8");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<title>Test Page</title>");
    expect(html).toContain('content="Test Description"');
    expect(html).toContain("Hello World");
  });

  it("should create nested directories for routes", async () => {
    const builder = createPreactBuilder({
      logger,
      outputDir,
      workingDir,
      cssProcessor: new MockCSSProcessor(),
    });

    const viewRegistry = {
      getViewTemplate: (_name: string): ViewTemplate => ({
        name: "test",
        schema: z.object({ content: z.string() }),
        pluginId: "test-plugin",
        renderers: {
          web: (props: unknown): VNode => {
            const { content } = props as { content: string };
            return h("div", {}, content);
          },
        },
        interactive: false,
      }),
      registerRoute: (): void => {},
      getRoute: (): undefined => undefined,
      listRoutes: (): RouteDefinition[] => [],
      registerViewTemplate: (): void => {},
      listViewTemplates: (): ViewTemplate[] => [],
      validateViewTemplate: (): boolean => true,
      getRenderer: (): undefined => undefined,
      hasRenderer: (): boolean => false,
      listFormats: (): OutputFormat[] => [],
    };

    const mockPluginContext = {
      getPlugin: (id: string) => ({
        id,
        metadata: { name: id, version: "1.0.0", packageName: `@test/${id}` },
      }),
    } as unknown as ServicePluginContext;

    const buildContext: BuildContext = {
      routes: [
        {
          id: "team",
          path: "/about/team",
          title: "Team Page",
          description: "About our team",
          sections: [
            {
              id: "content",
              template: "test",
              content: { content: "Team content" },
            },
          ],
        },
      ],
      getViewTemplate: (name: string) => viewRegistry.getViewTemplate(name),
      pluginContext: mockPluginContext,
      siteConfig: {
        title: "Test Site",
        description: "Test",
      },
      getContent: async (_route, section) => section.content ?? null,
    };

    await builder.build(buildContext, () => {});

    const teamPath = join(outputDir, "about/team/index.html");
    const exists = await fs
      .access(teamPath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
  });

  it("should handle missing templates gracefully", async () => {
    const builder = createPreactBuilder({
      logger,
      outputDir,
      workingDir,
      cssProcessor: new MockCSSProcessor(),
    });

    const viewRegistry = {
      getViewTemplate: (_name: string): undefined => undefined, // No templates found
      registerRoute: (): void => {},
      getRoute: (): undefined => undefined,
      listRoutes: (): RouteDefinition[] => [],
      registerViewTemplate: (): void => {},
      listViewTemplates: (): ViewTemplate[] => [],
      validateViewTemplate: (): boolean => true,
      getRenderer: (): undefined => undefined,
      hasRenderer: (): boolean => false,
      listFormats: (): OutputFormat[] => [],
    };

    const mockPluginContext = {
      getPlugin: (id: string) => ({
        id,
        metadata: { name: id, version: "1.0.0", packageName: `@test/${id}` },
      }),
    } as unknown as ServicePluginContext;

    const buildContext: BuildContext = {
      routes: [
        {
          id: "test-missing",
          path: "/",
          title: "Test",
          description: "Test",
          sections: [
            {
              id: "missing",
              template: "non-existent",
              content: { data: "test" },
            },
          ],
        },
      ],
      getViewTemplate: (name: string) => viewRegistry.getViewTemplate(name),
      pluginContext: mockPluginContext,
      siteConfig: {
        title: "Test Site",
        description: "Test",
      },
      getContent: async (_route, section) => section.content ?? null,
    };

    // Should not throw
    await builder.build(buildContext, () => {});

    // Should still create the HTML file with empty content
    const html = await fs.readFile(join(outputDir, "index.html"), "utf-8");
    expect(html).toContain("<!DOCTYPE html>");
  });

  it("should fetch content from entities when not provided", async () => {
    const builder = createPreactBuilder({
      logger,
      outputDir,
      workingDir,
      cssProcessor: new MockCSSProcessor(),
    });

    const mockContent = { title: "Entity Content" };
    let contentFetched = false;

    const viewRegistry = {
      getViewTemplate: (_name: string): ViewTemplate => ({
        name: "test",
        schema: z.object({ title: z.string() }),
        pluginId: "test-plugin",
        renderers: {
          web: (props: unknown): VNode => {
            const { title } = props as { title: string };
            return h("div", {}, title);
          },
        },
        interactive: false,
      }),
      registerRoute: (): void => {},
      getRoute: (): undefined => undefined,
      listRoutes: (): RouteDefinition[] => [],
      registerViewTemplate: (): void => {},
      listViewTemplates: (): ViewTemplate[] => [],
      validateViewTemplate: (): boolean => true,
      getRenderer: (): undefined => undefined,
      hasRenderer: (): boolean => false,
      listFormats: (): OutputFormat[] => [],
    };

    const mockPluginContext = {
      getPlugin: (id: string) => ({
        id,
        metadata: { name: id, version: "1.0.0", packageName: `@test/${id}` },
      }),
    } as unknown as ServicePluginContext;

    const buildContext: BuildContext = {
      routes: [
        {
          id: "test-entity",
          path: "/",
          title: "Test",
          description: "Test",
          sections: [
            {
              id: "test",
              template: "test",
              dataQuery: {
                entityType: "site-content-preview",
                template: "test",
                query: { routeId: "landing", sectionId: "test" },
              },
            },
          ],
        },
      ],
      getViewTemplate: (name: string) => viewRegistry.getViewTemplate(name),
      pluginContext: mockPluginContext,
      siteConfig: {
        title: "Test Site",
        description: "Test",
      },
      getContent: async (_route, section) => {
        contentFetched = true;
        expect(section.dataQuery).toBeDefined();
        return mockContent;
      },
    };

    await builder.build(buildContext, () => {});

    expect(contentFetched).toBe(true);

    const html = await fs.readFile(join(outputDir, "index.html"), "utf-8");
    expect(html).toContain("Entity Content");
  });

  it("should clean up directories", async () => {
    const builder = createPreactBuilder({
      logger,
      outputDir,
      workingDir,
      cssProcessor: new MockCSSProcessor(),
    });

    // Create some test files
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(join(outputDir, "test.txt"), "test");
    await fs.mkdir(workingDir, { recursive: true });
    await fs.writeFile(join(workingDir, "test.txt"), "test");

    await builder.clean();

    // Check that directories are removed
    const outputExists = await fs
      .access(outputDir)
      .then(() => true)
      .catch(() => false);
    const workingExists = await fs
      .access(workingDir)
      .then(() => true)
      .catch(() => false);

    expect(outputExists).toBe(false);
    expect(workingExists).toBe(false);
  });
});
