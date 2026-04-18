import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createPreactBuilder } from "../../src/lib/preact-builder";
import type { BuildContext } from "../../src/lib/static-site-builder";
import type { ViewTemplate, OutputFormat } from "@brains/plugins";
import type { RouteDefinition } from "@brains/plugins";
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
import { UISlotRegistry } from "../../src/lib/ui-slot-registry";
import type { LayoutComponent } from "../../src/config";

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

  it("should fall back to site info metadata when route metadata is omitted", async () => {
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
          id: "test",
          path: "/",
          title: "",
          description: "",
          layout: "default",
          sections: [
            {
              id: "content",
              template: "test",
              content: { content: "Hello World" },
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

    const html = await fs.readFile(join(outputDir, "index.html"), "utf-8");
    expect(html).toContain("<title>Test Site</title>");
    expect(html).toContain(
      '<meta name="description" content="Test Site Description">',
    );
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

  it("should clean up directories but preserve images/", async () => {
    const builder = createPreactBuilder({
      logger,
      outputDir,
      workingDir,
      cssProcessor: new MockCSSProcessor(),
    });

    // Create test files in output and working dirs
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(join(outputDir, "test.txt"), "test");
    await fs.mkdir(join(outputDir, "images"), { recursive: true });
    await fs.writeFile(join(outputDir, "images/photo.webp"), "fake");
    await fs.mkdir(workingDir, { recursive: true });
    await fs.writeFile(join(workingDir, "test.txt"), "test");

    await builder.clean();

    // Working directory should be fully removed
    const workingExists = await fs
      .access(workingDir)
      .then(() => true)
      .catch(() => false);
    expect(workingExists).toBe(false);

    // Output files should be removed, but images/ preserved
    const testFileExists = await fs
      .access(join(outputDir, "test.txt"))
      .then(() => true)
      .catch(() => false);
    expect(testFileExists).toBe(false);

    const imagesExists = await fs
      .access(join(outputDir, "images/photo.webp"))
      .then(() => true)
      .catch(() => false);
    expect(imagesExists).toBe(true);
  });

  // NOTE: Tests for extracting data URLs and entity://image references from
  // rendered HTML were removed. Image resolution now happens BEFORE rendering
  // via ImageBuildService + ImageRendererProvider (Astro-like approach).
  // See test/lib/image-build-service.test.ts for the new image resolution tests.

  /* removed: "should NOT inline data URLs" — covered by image-build-service tests */
  /* removed: "should extract entity://image from markdown" — covered by image-build-service tests */

  describe("UI Slots", () => {
    it("should pass slots to layout component", async () => {
      const builder = createPreactBuilder({
        logger,
        outputDir,
        workingDir,
        cssProcessor: new MockCSSProcessor(),
      });

      // Create a slot registry with a registered render function
      const slotRegistry = new UISlotRegistry();

      slotRegistry.register("footer-top", {
        pluginId: "newsletter",
        render: () =>
          h("div", { class: "newsletter" }, "Subscribe to newsletter"),
      });

      // Track if slots were passed to layout
      let receivedSlots: UISlotRegistry | undefined;
      const LayoutWithSlots: LayoutComponent = ({ sections, slots }) => {
        receivedSlots = slots;
        return h("main", {}, [
          ...sections,
          // Render slot components if present
          slots?.hasSlot("footer-top")
            ? h(
                "footer",
                {},
                slots.getSlot("footer-top").map((entry) => entry.render()),
              )
            : null,
        ]);
      };

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
        layouts: { default: LayoutWithSlots },
        getSiteInfo: async () => ({
          title: "Test Site",
          description: "Test Site Description",
          navigation: { primary: [], secondary: [] },
          copyright: "© 2025 Test Site. All rights reserved.",
        }),
        slots: slotRegistry,
      };

      await builder.build(buildContext, () => {});

      // Verify slots were passed to layout
      expect(receivedSlots).toBeDefined();
      expect(receivedSlots?.hasSlot("footer-top")).toBe(true);

      // Verify slot component was rendered in HTML
      const html = await fs.readFile(join(outputDir, "index.html"), "utf-8");
      expect(html).toContain("Subscribe to newsletter");
      expect(html).toContain('class="newsletter"');
    });

    it("should render slots in priority order", async () => {
      const builder = createPreactBuilder({
        logger,
        outputDir,
        workingDir,
        cssProcessor: new MockCSSProcessor(),
      });

      const slotRegistry = new UISlotRegistry();

      // Register render functions with different priorities
      slotRegistry.register("footer-top", {
        pluginId: "low-priority",
        render: (): VNode => h("span", {}, "Low"),
        priority: 10,
      });
      slotRegistry.register("footer-top", {
        pluginId: "high-priority",
        render: (): VNode => h("span", {}, "High"),
        priority: 100,
      });
      slotRegistry.register("footer-top", {
        pluginId: "medium-priority",
        render: (): VNode => h("span", {}, "Medium"),
        priority: 50,
      });

      const LayoutWithSlots: LayoutComponent = ({ sections, slots }) => {
        return h("main", {}, [
          ...sections,
          h(
            "div",
            { id: "slot-container" },
            slots?.getSlot("footer-top").map((entry) => entry.render()),
          ),
        ]);
      };

      const viewRegistry = {
        getViewTemplate: (_name: string): ViewTemplate => ({
          name: "test",
          schema: z.object({}),
          pluginId: "test-plugin",
          renderers: { web: (): VNode => h("div", {}, "Content") },
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
            id: "test",
            path: "/",
            title: "Test",
            description: "Test",
            layout: "default",
            sections: [{ id: "content", template: "test", content: {} }],
          },
        ],
        getViewTemplate: (name: string) => viewRegistry.getViewTemplate(name),
        pluginContext: createMockServicePluginContext(),
        siteConfig: { title: "Test", description: "Test" },
        getContent: async (_route, section) => section.content ?? null,
        layouts: { default: LayoutWithSlots },
        getSiteInfo: async () => ({
          title: "Test",
          description: "Test",
          navigation: { primary: [], secondary: [] },
          copyright: "© 2025 Test",
        }),
        slots: slotRegistry,
      };

      await builder.build(buildContext, () => {});

      const html = await fs.readFile(join(outputDir, "index.html"), "utf-8");
      // Verify order: High should come before Medium, Medium before Low
      const highPos = html.indexOf("High");
      const mediumPos = html.indexOf("Medium");
      const lowPos = html.indexOf("Low");
      expect(highPos).toBeLessThan(mediumPos);
      expect(mediumPos).toBeLessThan(lowPos);
    });

    it("should handle empty slot registry gracefully", async () => {
      const builder = createPreactBuilder({
        logger,
        outputDir,
        workingDir,
        cssProcessor: new MockCSSProcessor(),
      });

      const emptySlotRegistry = new UISlotRegistry();

      const LayoutWithSlots: LayoutComponent = ({ sections, slots }) => {
        return h("main", {}, [
          ...sections,
          // Should handle empty slots gracefully
          slots?.hasSlot("footer-top")
            ? h(
                "footer",
                {},
                slots.getSlot("footer-top").map((entry) => entry.render()),
              )
            : h("footer", { id: "empty-footer" }, "Default footer"),
        ]);
      };

      const viewRegistry = {
        getViewTemplate: (_name: string): ViewTemplate => ({
          name: "test",
          schema: z.object({}),
          pluginId: "test-plugin",
          renderers: { web: (): VNode => h("div", {}, "Content") },
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
            id: "test",
            path: "/",
            title: "Test",
            description: "Test",
            layout: "default",
            sections: [{ id: "content", template: "test", content: {} }],
          },
        ],
        getViewTemplate: (name: string) => viewRegistry.getViewTemplate(name),
        pluginContext: createMockServicePluginContext(),
        siteConfig: { title: "Test", description: "Test" },
        getContent: async (_route, section) => section.content ?? null,
        layouts: { default: LayoutWithSlots },
        getSiteInfo: async () => ({
          title: "Test",
          description: "Test",
          navigation: { primary: [], secondary: [] },
          copyright: "© 2025 Test",
        }),
        slots: emptySlotRegistry,
      };

      await builder.build(buildContext, () => {});

      const html = await fs.readFile(join(outputDir, "index.html"), "utf-8");
      // Should render default footer since no slots registered
      expect(html).toContain('id="empty-footer"');
      expect(html).toContain("Default footer");
    });

    it("should work without slots (backwards compatibility)", async () => {
      const builder = createPreactBuilder({
        logger,
        outputDir,
        workingDir,
        cssProcessor: new MockCSSProcessor(),
      });

      // Layout that handles missing slots prop
      const LayoutWithOptionalSlots: LayoutComponent = ({
        sections,
        slots,
      }) => {
        return h("main", {}, [
          ...sections,
          slots?.hasSlot("footer-top")
            ? h("footer", {}, "Has slots")
            : h("footer", {}, "No slots"),
        ]);
      };

      const viewRegistry = {
        getViewTemplate: (_name: string): ViewTemplate => ({
          name: "test",
          schema: z.object({}),
          pluginId: "test-plugin",
          renderers: { web: (): VNode => h("div", {}, "Content") },
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

      // BuildContext without slots property
      const buildContext: BuildContext = {
        routes: [
          {
            id: "test",
            path: "/",
            title: "Test",
            description: "Test",
            layout: "default",
            sections: [{ id: "content", template: "test", content: {} }],
          },
        ],
        getViewTemplate: (name: string) => viewRegistry.getViewTemplate(name),
        pluginContext: createMockServicePluginContext(),
        siteConfig: { title: "Test", description: "Test" },
        getContent: async (_route, section) => section.content ?? null,
        layouts: { default: LayoutWithOptionalSlots },
        getSiteInfo: async () => ({
          title: "Test",
          description: "Test",
          navigation: { primary: [], secondary: [] },
          copyright: "© 2025 Test",
        }),
        // No slots property - testing backwards compatibility
      };

      await builder.build(buildContext, () => {});

      const html = await fs.readFile(join(outputDir, "index.html"), "utf-8");
      expect(html).toContain("No slots");
    });
  });
});
