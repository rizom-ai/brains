import { describe, it, expect, beforeEach, mock, afterEach } from "bun:test";
import { SiteBuilder } from "../../src/site-builder";
import { PageRegistry } from "../../src/page-registry";
import { LayoutRegistry } from "../../src/layout-registry";
import { createSilentLogger } from "@brains/utils";
import { mkdirSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { z } from "zod";
import type {
  PluginContext,
  PageDefinition,
  LayoutDefinition,
  SiteBuilderOptions,
  EntityService,
  ContentTypeRegistry,
  ContentGenerationService,
} from "@brains/types";

// Type for mocking Bun
type BunWithSpawn = { spawn: typeof Bun.spawn };

describe("SiteBuilder", () => {
  let siteBuilder: SiteBuilder;
  let testDir: string;
  let originalSpawn: typeof Bun.spawn;
  let mockContext: PluginContext;

  beforeEach(() => {
    // Create a temporary test directory
    testDir = join(import.meta.dir, "test-site-output");
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });

    // Mock Bun.spawn
    originalSpawn = Bun.spawn;
    (Bun as unknown as BunWithSpawn).spawn = mock(
      (_args: string[], _options: unknown): ReturnType<typeof Bun.spawn> => {
        return {
          exited: Promise.resolve(0),
          stdout: new ReadableStream(),
          stderr: new ReadableStream(),
        } as unknown as ReturnType<typeof Bun.spawn>;
      },
    ) as unknown as typeof Bun.spawn;

    // Create mock context
    mockContext = {
      registry: {
        register: mock(() => {}),
        get: mock(() => null),
      },
      entityService: {
        listEntities: mock(() => Promise.resolve([])),
        createEntity: mock(() =>
          Promise.resolve({
            id: "test",
            entityType: "test",
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
          }),
        ),
      } as unknown as EntityService,
      contentTypeRegistry: {
        getFormatter: mock(() => null),
      } as unknown as ContentTypeRegistry,
      contentGenerationService: {
        generateContent: mock(() => Promise.resolve({})),
        getTemplate: mock(() => null),
      } as unknown as ContentGenerationService,
      registerEntityType: mock(() => {}),
      generateContent: mock(() => Promise.resolve({})),
    } as unknown as PluginContext;

    siteBuilder = SiteBuilder.createFresh(
      createSilentLogger("test"),
      mockContext,
    );
  });

  afterEach(() => {
    // Restore original spawn
    (Bun as unknown as BunWithSpawn).spawn = originalSpawn;

    // Cleanup
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }

    // Reset registries
    PageRegistry.resetInstance();
    LayoutRegistry.resetInstance();
    SiteBuilder.resetInstance();
  });

  describe("build", () => {
    beforeEach(() => {
      // Register a test layout
      const testLayout: LayoutDefinition<unknown> = {
        name: "test-layout",
        description: "Test layout",
        component: "div",
        schema: z.object({ title: z.string() }),
      };
      siteBuilder.getLayoutRegistry().register(testLayout);

      // Register a test page
      const testPage: PageDefinition = {
        path: "/",
        title: "Test Page",
        description: "Test page description",
        pluginId: "test",
        sections: [
          {
            id: "test-section",
            layout: "test-layout",
            content: { title: "Test Content" },
          },
        ],
      };
      siteBuilder.getPageRegistry().register(testPage);
    });

    it("should build site successfully with valid configuration", async () => {
      const options: SiteBuilderOptions = {
        outputDir: testDir,
        enableContentGeneration: false,
        siteConfig: {
          title: "Test Site",
          description: "Test description",
        },
      };

      const result = await siteBuilder.build(options);

      expect(result.success).toBe(true);
      expect(result.pagesBuilt).toBe(1);
      expect(result.errors).toBeUndefined();
    });

    it("should handle no registered pages gracefully", async () => {
      // Clear registered pages
      PageRegistry.resetInstance();
      siteBuilder = SiteBuilder.createFresh(
        createSilentLogger("test"),
        mockContext,
      );

      const options: SiteBuilderOptions = {
        outputDir: testDir,
        enableContentGeneration: false,
        siteConfig: {
          title: "Test Site",
          description: "Test description",
        },
      };

      const result = await siteBuilder.build(options);

      expect(result.success).toBe(true);
      expect(result.pagesBuilt).toBe(0);
      expect(result.warnings).toContain("No pages registered for site build");
    });

    it("should handle unknown layout error", async () => {
      // Register a page with unknown layout
      const badPage: PageDefinition = {
        path: "/bad",
        title: "Bad Page",
        description: "Page with unknown layout",
        pluginId: "test",
        sections: [
          {
            id: "bad-section",
            layout: "unknown-layout",
            content: { title: "Test Content" },
          },
        ],
      };
      siteBuilder.getPageRegistry().register(badPage);

      const options: SiteBuilderOptions = {
        outputDir: testDir,
        enableContentGeneration: false,
        siteConfig: {
          title: "Test Site",
          description: "Test description",
        },
      };

      const result = await siteBuilder.build(options);

      expect(result.success).toBe(false);
      expect(result.errors).toContain(
        'Failed to build page /bad: Unknown layout "unknown-layout" in section "bad-section"',
      );
    });

    it("should generate content when enableContentGeneration is true", async () => {
      // Register a page with content entity
      const pageWithEntity: PageDefinition = {
        path: "/generated",
        title: "Generated Page",
        description: "Page with generated content",
        pluginId: "test",
        sections: [
          {
            id: "generated-section",
            layout: "test-layout",
            contentEntity: {
              entityType: "test-content",
              template: "test-template",
              query: { section: "test" },
            },
          },
        ],
      };
      siteBuilder.getPageRegistry().register(pageWithEntity);

      const options: SiteBuilderOptions = {
        outputDir: testDir,
        enableContentGeneration: true,
        siteConfig: {
          title: "Test Site",
          description: "Test description",
        },
      };

      const result = await siteBuilder.build(options);

      expect(result.success).toBe(true);
      expect(result.pagesBuilt).toBe(2); // Original test page + generated page
    });
  });

  describe("getPageRegistry", () => {
    it("should return page registry", () => {
      const registry = siteBuilder.getPageRegistry();
      expect(registry).toBeInstanceOf(PageRegistry);
    });
  });

  describe("getLayoutRegistry", () => {
    it("should return layout registry", () => {
      const registry = siteBuilder.getLayoutRegistry();
      expect(registry).toBeInstanceOf(LayoutRegistry);
    });
  });
});
