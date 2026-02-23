import { describe, it, expect, beforeEach, mock, spyOn } from "bun:test";
import { SiteBuilder } from "../../src/lib/site-builder";
import type { ServicePluginContext } from "@brains/plugins";
import {
  createSilentLogger,
  createMockServicePluginContext,
} from "@brains/test-utils";
import type { RouteRegistry } from "../../src/lib/route-registry";
import type { RouteDefinition } from "@brains/plugins";
import type { SiteInfoService } from "../../src/services/site-info-service";
import type { IAnchorProfileService } from "@brains/plugins";
import { TestLayout } from "../test-helpers";
import { z } from "@brains/utils";

describe("SiteBuilder dataQuery handling", () => {
  let siteBuilder: SiteBuilder;
  let mockContext: ServicePluginContext;
  let mockRouteRegistry: Partial<RouteRegistry>;
  let mockSiteInfoService: Partial<SiteInfoService>;
  let logger: ReturnType<typeof createSilentLogger>;
  let mockStaticSiteBuilder: {
    build: ReturnType<typeof mock>;
    clean: ReturnType<typeof mock>;
  };

  beforeEach(() => {
    logger = createSilentLogger();

    // Create mock context using factory
    mockContext = createMockServicePluginContext({ logger });
    // Override specific methods for this test
    spyOn(mockContext.views, "get").mockReturnValue({
      name: "test-template",
      pluginId: "test",
      schema: z.object({}),
      renderers: {},
      interactive: false,
    });

    // Create mock route registry
    mockRouteRegistry = {
      list: mock().mockReturnValue([]),
      register: mock(),
      getNavigationItems: mock().mockReturnValue([]),
    };

    // Create mock site info service
    mockSiteInfoService = {
      getSiteInfo: mock().mockReturnValue({
        title: "Test Site",
        description: "Test Description",
      }),
    };

    // Create mock static site builder
    mockStaticSiteBuilder = {
      build: mock().mockImplementation(async (buildContext) => {
        // Call getContent for each section of each route to trigger the logic
        for (const route of buildContext.routes) {
          for (const section of route.sections) {
            await buildContext.getContent(route, section);
          }
        }
        return { success: true };
      }),
      clean: mock().mockResolvedValue(undefined),
    };

    // Create SiteBuilder instance with mock static site builder
    const mockProfileService: IAnchorProfileService = {
      getProfile: () => ({ name: "Test" }),
    };

    siteBuilder = SiteBuilder.createFresh(
      logger,
      mockContext,
      mockRouteRegistry as RouteRegistry,
      mockSiteInfoService as SiteInfoService,
      mockProfileService,
      () => mockStaticSiteBuilder,
    );
  });

  describe("getContentForSection", () => {
    it("should use dataQuery params for dynamic content", async () => {
      const route: RouteDefinition = {
        id: "topics",
        path: "/topics",
        title: "Topics",
        description: "All topics",
        layout: "default",
        sections: [
          {
            id: "list",
            template: "topics:topic-list",
            dataQuery: {
              entityType: "topic",
              query: { limit: 100 },
            },
          },
        ],
      };

      mockRouteRegistry.list = mock().mockReturnValue([route]);
      mockContext.templates.resolve = mock().mockResolvedValue({
        topics: [
          { id: "topic-1", title: "Topic 1" },
          { id: "topic-2", title: "Topic 2" },
        ],
        totalCount: 2,
      });

      await siteBuilder.build({
        outputDir: "/tmp/test-build",
        environment: "preview",
        enableContentGeneration: false,
        cleanBeforeBuild: false,
        siteConfig: {
          title: "Test Site",
          description: "Test Description",
        },
        layouts: { default: TestLayout },
      });

      // Verify resolveContent was called with correct params (no transformFormat)
      expect(mockContext.templates.resolve).toHaveBeenCalledWith(
        "topics:topic-list",
        expect.objectContaining({
          dataParams: {
            entityType: "topic",
            query: { limit: 100 },
          },
          publishedOnly: false,
          fallback: undefined,
        }),
      );
    });

    it("should detect detail format when query.id is present", async () => {
      const route: RouteDefinition = {
        id: "topic-detail",
        path: "/topics/test-topic",
        title: "Test Topic",
        description: "Topic detail",
        layout: "default",
        sections: [
          {
            id: "detail",
            template: "topics:topic-detail",
            dataQuery: {
              entityType: "topic",
              query: { id: "test-topic" },
            },
          },
        ],
      };

      mockRouteRegistry.list = mock().mockReturnValue([route]);
      mockContext.templates.resolve = mock().mockResolvedValue({
        id: "test-topic",
        title: "Test Topic",
        summary: "Test summary",
        content: "Test content",
      });

      try {
        await siteBuilder.build({
          outputDir: "/tmp/test-build",
          environment: "preview",
          enableContentGeneration: false,
          cleanBeforeBuild: false,
          siteConfig: {
            title: "Test Site",
            description: "Test Description",
          },
          layouts: { default: TestLayout },
        });
      } catch {
        // Ignore build errors - we're just testing the content resolution
      }

      // Verify resolveContent was called without transformFormat
      expect(mockContext.templates.resolve).toHaveBeenCalledWith(
        "topics:topic-detail",
        expect.objectContaining({
          dataParams: {
            entityType: "topic",
            query: { id: "test-topic" },
          },
          publishedOnly: false,
          fallback: undefined,
        }),
      );
    });

    it("should handle sections with static content and dataQuery", async () => {
      const route: RouteDefinition = {
        id: "mixed",
        path: "/mixed",
        title: "Mixed Content",
        description: "Mixed content page",
        layout: "default",
        sections: [
          {
            id: "static",
            template: "hero",
            content: { title: "Static Hero" },
          },
          {
            id: "dynamic",
            template: "topics:topic-list",
            dataQuery: {
              entityType: "topic",
              query: { limit: 5 },
            },
            content: { fallbackTitle: "No topics" }, // Fallback content
          },
        ],
      };

      mockRouteRegistry.list = mock().mockReturnValue([route]);
      mockContext.templates.resolve = mock().mockImplementation((template) => {
        if (template === "hero") {
          return Promise.resolve({ title: "Static Hero" });
        }
        if (template === "topics:topic-list") {
          return Promise.resolve({ topics: [], totalCount: 0 });
        }
        return Promise.resolve(null);
      });

      try {
        await siteBuilder.build({
          outputDir: "/tmp/test-build",
          environment: "preview",
          enableContentGeneration: false,
          cleanBeforeBuild: false,
          siteConfig: {
            title: "Test Site",
            description: "Test Description",
          },
          layouts: { default: TestLayout },
        });
      } catch {
        // Ignore build errors - we're just testing the content resolution
      }

      // Verify static content was resolved normally
      expect(mockContext.templates.resolve).toHaveBeenCalledWith(
        "hero",
        expect.objectContaining({
          savedContent: {
            entityType: "site-content",
            entityId: "mixed:static",
          },
          fallback: { title: "Static Hero" },
        }),
      );

      // Verify dynamic content used dataQuery params
      expect(mockContext.templates.resolve).toHaveBeenCalledWith(
        "topics:topic-list",
        expect.objectContaining({
          dataParams: {
            entityType: "topic",
            query: { limit: 5 },
          },
          publishedOnly: false,
          fallback: { fallbackTitle: "No topics" },
        }),
      );
    });

    it("should handle dataQuery without query field", async () => {
      const route: RouteDefinition = {
        id: "no-query",
        path: "/topics",
        title: "Topics",
        description: "All topics",
        layout: "default",
        sections: [
          {
            id: "list",
            template: "topics:topic-list",
            dataQuery: {
              entityType: "topic",
              // No query field - should default to list format
            },
          },
        ],
      };

      mockRouteRegistry.list = mock().mockReturnValue([route]);
      mockContext.templates.resolve = mock().mockResolvedValue({
        topics: [],
        totalCount: 0,
      });

      try {
        await siteBuilder.build({
          outputDir: "/tmp/test-build",
          environment: "preview",
          enableContentGeneration: false,
          cleanBeforeBuild: false,
          siteConfig: {
            title: "Test Site",
            description: "Test Description",
          },
          layouts: { default: TestLayout },
        });
      } catch {
        // Ignore build errors - we're just testing the content resolution
      }

      // Should use list format when no query is present
      expect(mockContext.templates.resolve).toHaveBeenCalledWith(
        "topics:topic-list",
        expect.objectContaining({
          dataParams: {
            entityType: "topic",
          },
          publishedOnly: false,
          fallback: undefined,
        }),
      );
    });

    it("should set publishedOnly=true for list sections in production", async () => {
      const route: RouteDefinition = {
        id: "topics",
        path: "/topics",
        title: "Topics",
        description: "All topics",
        layout: "default",
        sections: [
          {
            id: "list",
            template: "topics:topic-list",
            dataQuery: {
              entityType: "topic",
              query: { limit: 100 },
            },
          },
        ],
      };

      mockRouteRegistry.list = mock().mockReturnValue([route]);
      mockContext.templates.resolve = mock().mockResolvedValue({
        topics: [],
        totalCount: 0,
      });

      await siteBuilder.build({
        outputDir: "/tmp/test-build",
        environment: "production",
        enableContentGeneration: false,
        cleanBeforeBuild: false,
        siteConfig: {
          title: "Test Site",
          description: "Test Description",
        },
        layouts: { default: TestLayout },
      });

      // List sections should have publishedOnly=true in production
      expect(mockContext.templates.resolve).toHaveBeenCalledWith(
        "topics:topic-list",
        expect.objectContaining({
          publishedOnly: true,
        }),
      );
    });

    it("should set publishedOnly=true for detail sections in production", async () => {
      const route: RouteDefinition = {
        id: "topic-detail",
        path: "/topics/test-topic",
        title: "Test Topic",
        description: "Topic detail",
        layout: "default",
        sections: [
          {
            id: "detail",
            template: "topics:topic-detail",
            dataQuery: {
              entityType: "topic",
              query: { id: "test-topic" },
            },
          },
        ],
      };

      mockRouteRegistry.list = mock().mockReturnValue([route]);
      mockContext.templates.resolve = mock().mockResolvedValue({
        id: "test-topic",
        title: "Test Topic",
      });

      await siteBuilder.build({
        outputDir: "/tmp/test-build",
        environment: "production",
        enableContentGeneration: false,
        cleanBeforeBuild: false,
        siteConfig: {
          title: "Test Site",
          description: "Test Description",
        },
        layouts: { default: TestLayout },
      });

      // Detail sections should also have publishedOnly=true in production
      expect(mockContext.templates.resolve).toHaveBeenCalledWith(
        "topics:topic-detail",
        expect.objectContaining({
          publishedOnly: true,
        }),
      );
    });

    it("should handle dataQuery with additional query params", async () => {
      const route: RouteDefinition = {
        id: "custom-query",
        path: "/topics/filtered",
        title: "Filtered Topics",
        description: "Filtered topics",
        layout: "default",
        sections: [
          {
            id: "list",
            template: "topics:topic-list",
            dataQuery: {
              entityType: "topic",
              query: {
                limit: 10,
                offset: 20,
                customParam: "value",
                anotherParam: 123,
              },
            },
          },
        ],
      };

      mockRouteRegistry.list = mock().mockReturnValue([route]);
      mockContext.templates.resolve = mock().mockResolvedValue({
        topics: [],
        totalCount: 0,
      });

      try {
        await siteBuilder.build({
          outputDir: "/tmp/test-build",
          environment: "preview",
          enableContentGeneration: false,
          cleanBeforeBuild: false,
          siteConfig: {
            title: "Test Site",
            description: "Test Description",
          },
          layouts: { default: TestLayout },
        });
      } catch {
        // Ignore build errors - we're just testing the content resolution
      }

      // Should pass all query params through
      expect(mockContext.templates.resolve).toHaveBeenCalledWith(
        "topics:topic-list",
        expect.objectContaining({
          dataParams: {
            entityType: "topic",
            query: {
              limit: 10,
              offset: 20,
              customParam: "value",
              anotherParam: 123,
            },
          },
          publishedOnly: false,
          fallback: undefined,
        }),
      );
    });
  });
});
