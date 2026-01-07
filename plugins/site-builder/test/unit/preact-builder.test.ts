import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createPreactBuilder } from "../../src/lib/preact-builder";
import type { BuildContext } from "../../src/lib/static-site-builder";
import type { ViewTemplate, OutputFormat } from "@brains/plugins";
import type { RouteDefinition } from "../../src/types/routes";
import {
  createSilentLogger,
  createMockServicePluginContext,
} from "@brains/test-utils";
import { z } from "@brains/utils";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { h, type VNode } from "preact";
import { MockCSSProcessor } from "../mocks/mock-css-processor";
import { TestLayout } from "../test-helpers";

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

    const buildContext: BuildContext = {
      routes: [
        {
          id: "test",
          path: "/",
          title: "Test Page",
          description: "Test Description",
          layout: "default",
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
      pluginContext: createMockServicePluginContext(),
      siteConfig: {
        title: "Test Site",
        description: "Test Site Description",
      },
      getContent: async (_route, section) => section.content ?? null,
      layouts: { default: TestLayout },
      getSiteInfo: async () => ({
        title: "Test Site",
        description: "Test Site Description",
        navigation: {
          primary: [],
          secondary: [],
        },
        copyright: "© 2025 Test Site. All rights reserved.",
      }),
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

    const buildContext: BuildContext = {
      routes: [
        {
          id: "team",
          path: "/about/team",
          title: "Team Page",
          description: "About our team",
          layout: "default",
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
      pluginContext: createMockServicePluginContext(),
      siteConfig: {
        title: "Test Site",
        description: "Test",
      },
      getContent: async (_route, section) => section.content ?? null,
      layouts: { default: TestLayout },
      getSiteInfo: async () => ({
        title: "Test Site",
        description: "Test Site Description",
        navigation: {
          primary: [],
          secondary: [],
        },
        copyright: "© 2025 Test Site. All rights reserved.",
      }),
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

    const buildContext: BuildContext = {
      routes: [
        {
          id: "test-missing",
          path: "/",
          title: "Test",
          description: "Test",
          layout: "default",
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
      pluginContext: createMockServicePluginContext(),
      siteConfig: {
        title: "Test Site",
        description: "Test",
      },
      getContent: async (_route, section) => section.content ?? null,
      layouts: { default: TestLayout },
      getSiteInfo: async () => ({
        title: "Test Site",
        description: "Test Site Description",
        navigation: {
          primary: [],
          secondary: [],
        },
        copyright: "© 2025 Test Site. All rights reserved.",
      }),
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

    const buildContext: BuildContext = {
      routes: [
        {
          id: "test-entity",
          path: "/",
          title: "Test",
          description: "Test",
          layout: "default",
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
      pluginContext: createMockServicePluginContext(),
      siteConfig: {
        title: "Test Site",
        description: "Test",
      },
      getContent: async (_route, section) => {
        contentFetched = true;
        expect(section.dataQuery).toBeDefined();
        return mockContent;
      },
      layouts: { default: TestLayout },
      getSiteInfo: async () => ({
        title: "Test Site",
        description: "Test",
        navigation: {
          primary: [],
          secondary: [],
        },
        copyright: "© 2025 Test Site. All rights reserved.",
      }),
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

  it("should extract inline data URLs to static files", async () => {
    // REGRESSION TEST: This is the REAL scenario - the entity service resolves
    // entity://image/{id} to data URLs BEFORE content reaches site-builder.
    // Site-builder must detect these data URLs and extract them to static files.
    const builder = createPreactBuilder({
      logger,
      outputDir,
      workingDir,
      cssProcessor: new MockCSSProcessor(),
    });

    const samplePngDataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const mockPluginContext = createMockServicePluginContext();

    // Component receives content with data URL already inlined
    // (this is what happens when entity service resolves the image)
    const BlogPostComponent = (props: unknown): VNode => {
      const { coverImageUrl } = props as { coverImageUrl: string };
      return h("article", {}, [h("img", { src: coverImageUrl, alt: "Cover" })]);
    };

    const viewRegistry = {
      getViewTemplate: (_name: string): ViewTemplate => ({
        name: "blog-post",
        schema: z.object({ coverImageUrl: z.string() }),
        pluginId: "test-plugin",
        renderers: { web: BlogPostComponent },
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

    const buildContext: BuildContext = {
      routes: [
        {
          id: "blog-post",
          path: "/blog/my-post",
          title: "My Post",
          description: "Test blog post",
          layout: "default",
          sections: [
            {
              id: "content",
              template: "blog-post",
              // Content has data URL already inlined (simulating entity service resolution)
              content: { coverImageUrl: samplePngDataUrl },
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
      layouts: { default: TestLayout },
      getSiteInfo: async () => ({
        title: "Test Site",
        description: "Test",
        navigation: { primary: [], secondary: [] },
        copyright: "© 2025 Test",
      }),
    };

    await builder.build(buildContext, () => {});

    // CRITICAL: HTML should NOT contain inline data URLs
    const html = await fs.readFile(
      join(outputDir, "blog/my-post/index.html"),
      "utf-8",
    );
    expect(html).not.toContain("data:image/png;base64");
    // Should have extracted to a static file with a hash-based name
    expect(html).toMatch(/\/images\/[a-f0-9]+\.png/);

    // Verify at least one image was extracted to the images directory
    const imagesDir = join(outputDir, "images");
    const imagesDirExists = await fs
      .access(imagesDir)
      .then(() => true)
      .catch(() => false);
    expect(imagesDirExists).toBe(true);
  });

  it("should NOT inline data URLs - must extract images to static files", async () => {
    // REGRESSION TEST: Production builds should use static file URLs, not inline data URLs
    // This test verifies that even when content contains data URLs, the output HTML
    // uses static file paths for better caching and smaller HTML files.
    const builder = createPreactBuilder({
      logger,
      outputDir,
      workingDir,
      cssProcessor: new MockCSSProcessor(),
    });

    const samplePngDataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const mockPluginContext = createMockServicePluginContext();
    Object.defineProperty(mockPluginContext.entityService, "getEntity", {
      value: async (type: string, id: string) => {
        if (type === "image" && id === "cover-image") {
          return {
            id: "cover-image",
            entityType: "image",
            content: samplePngDataUrl,
            metadata: { format: "png" },
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            contentHash: "abc123",
          };
        }
        return null;
      },
    });

    // Component that displays content from a blog post
    // The content comes through getContent which should have entity://image references
    const BlogPostComponent = (props: unknown): VNode => {
      const { coverImageId } = props as { coverImageId: string };
      // In the real flow, this would use entity://image/{id} reference
      // The site-builder should extract this to a static file
      return h("article", {}, [
        h("img", { src: `entity://image/${coverImageId}`, alt: "Cover" }),
      ]);
    };

    const viewRegistry = {
      getViewTemplate: (_name: string): ViewTemplate => ({
        name: "blog-post",
        schema: z.object({ coverImageId: z.string() }),
        pluginId: "test-plugin",
        renderers: { web: BlogPostComponent },
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

    const buildContext: BuildContext = {
      routes: [
        {
          id: "blog-post",
          path: "/blog/my-post",
          title: "My Post",
          description: "Test blog post",
          layout: "default",
          sections: [
            {
              id: "content",
              template: "blog-post",
              content: { coverImageId: "cover-image" },
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
      layouts: { default: TestLayout },
      getSiteInfo: async () => ({
        title: "Test Site",
        description: "Test",
        navigation: { primary: [], secondary: [] },
        copyright: "© 2025 Test",
      }),
    };

    await builder.build(buildContext, () => {});

    // CRITICAL: HTML should NOT contain inline data URLs
    const html = await fs.readFile(
      join(outputDir, "blog/my-post/index.html"),
      "utf-8",
    );
    expect(html).not.toContain("data:image/png;base64");
    expect(html).toContain("/images/cover-image.png");

    // Verify image was extracted to static file
    const imagePath = join(outputDir, "images", "cover-image.png");
    const imageExists = await fs
      .access(imagePath)
      .then(() => true)
      .catch(() => false);
    expect(imageExists).toBe(true);
  });

  it("should extract entity://image from markdown content in sections", async () => {
    // REGRESSION TEST: Images in markdown content should be extracted to static files
    // This tests the flow where a datasource returns content with entity://image references
    const builder = createPreactBuilder({
      logger,
      outputDir,
      workingDir,
      cssProcessor: new MockCSSProcessor(),
    });

    const samplePngDataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const mockPluginContext = createMockServicePluginContext();
    Object.defineProperty(mockPluginContext.entityService, "getEntity", {
      value: async (type: string, id: string) => {
        if (type === "image" && id === "inline-image") {
          return {
            id: "inline-image",
            entityType: "image",
            content: samplePngDataUrl,
            metadata: { format: "png" },
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            contentHash: "def456",
          };
        }
        return null;
      },
    });

    // Component that renders an image from content
    const ContentComponent = (props: unknown): VNode => {
      const { imageId } = props as { imageId: string };
      // Render an img tag with entity://image reference
      return h("div", {}, [
        h("p", {}, "Here is an image:"),
        h("img", { src: `entity://image/${imageId}`, alt: "Inline" }),
      ]);
    };

    const viewRegistry = {
      getViewTemplate: (_name: string): ViewTemplate => ({
        name: "content-with-image",
        schema: z.object({ imageId: z.string() }),
        pluginId: "test-plugin",
        renderers: { web: ContentComponent },
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

    // Content returned by getContent contains the imageId
    const contentWithImageRef = {
      imageId: "inline-image",
    };

    const buildContext: BuildContext = {
      routes: [
        {
          id: "essay",
          path: "/essays/test-essay",
          title: "Test Essay",
          description: "Essay with inline images",
          layout: "default",
          sections: [
            {
              id: "content",
              template: "content-with-image",
              dataQuery: {
                entityType: "blog",
                template: "content-with-image",
                query: { slug: "test-essay" },
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
      getContent: async () => contentWithImageRef,
      layouts: { default: TestLayout },
      getSiteInfo: async () => ({
        title: "Test Site",
        description: "Test",
        navigation: { primary: [], secondary: [] },
        copyright: "© 2025 Test",
      }),
    };

    await builder.build(buildContext, () => {});

    // Verify image was extracted to static file
    const imagePath = join(outputDir, "images", "inline-image.png");
    const imageExists = await fs
      .access(imagePath)
      .then(() => true)
      .catch(() => false);
    expect(imageExists).toBe(true);

    // Verify HTML uses static URL, not entity://image reference
    const html = await fs.readFile(
      join(outputDir, "essays/test-essay/index.html"),
      "utf-8",
    );
    expect(html).not.toContain("entity://image/inline-image");
    expect(html).toContain("/images/inline-image.png");
  });

  it("should extract and resolve entity://image references", async () => {
    const builder = createPreactBuilder({
      logger,
      outputDir,
      workingDir,
      cssProcessor: new MockCSSProcessor(),
    });

    // Sample PNG data URL for test
    const samplePngDataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    // Create mock entity service that returns an image
    const mockPluginContext = createMockServicePluginContext();
    Object.defineProperty(mockPluginContext.entityService, "getEntity", {
      value: async (type: string, id: string) => {
        if (type === "image" && id === "test-image") {
          return {
            id: "test-image",
            entityType: "image",
            content: samplePngDataUrl,
            metadata: { format: "png" },
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            contentHash: "abc123",
          };
        }
        return null;
      },
    });

    // Create component that renders an entity://image reference
    const ImageComponent = (): VNode => {
      return h("div", {}, [
        h("img", { src: "entity://image/test-image", alt: "Test" }),
        h("p", {}, "![Alt text](entity://image/test-image)"),
      ]);
    };

    const viewRegistry = {
      getViewTemplate: (_name: string): ViewTemplate => ({
        name: "image-test",
        schema: z.object({}),
        pluginId: "test-plugin",
        renderers: { web: ImageComponent },
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

    const buildContext: BuildContext = {
      routes: [
        {
          id: "image-test",
          path: "/",
          title: "Image Test",
          description: "Test image extraction",
          layout: "default",
          sections: [
            {
              id: "content",
              template: "image-test",
              content: {},
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
      layouts: { default: TestLayout },
      getSiteInfo: async () => ({
        title: "Test Site",
        description: "Test",
        navigation: { primary: [], secondary: [] },
        copyright: "© 2025 Test",
      }),
    };

    await builder.build(buildContext, () => {});

    // Check that image was extracted to static file
    const imagePath = join(outputDir, "images", "test-image.png");
    const imageExists = await fs
      .access(imagePath)
      .then(() => true)
      .catch(() => false);
    expect(imageExists).toBe(true);

    // Check that HTML was updated with static URL
    const html = await fs.readFile(join(outputDir, "index.html"), "utf-8");
    expect(html).toContain("/images/test-image.png");
    expect(html).not.toContain("entity://image/test-image");
  });
});
