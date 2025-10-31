import { describe, it, expect, beforeEach, mock } from "bun:test";
import { SiteBuilder } from "../../src/lib/site-builder";
import type { ServicePluginContext } from "@brains/plugins";
import { createSilentLogger } from "@brains/utils";
import type { RouteRegistry } from "../../src/lib/route-registry";
import type { RouteDefinition } from "../../src/types/routes";
import type { SiteInfoService } from "../../src/services/site-info-service";
import { TestLayout } from "../test-helpers";

describe("SiteBuilder dataQuery handling", () => {
  let siteBuilder: SiteBuilder;
  let mockContext: Partial<ServicePluginContext>;
  let mockRouteRegistry: Partial<RouteRegistry>;
  let mockSiteInfoService: Partial<SiteInfoService>;
  let logger: ReturnType<typeof createSilentLogger>;
  let mockStaticSiteBuilder: {
    build: ReturnType<typeof mock>;
    clean: ReturnType<typeof mock>;
  };

  beforeEach(() => {
    logger = createSilentLogger();

    // Create mock context with resolveContent method
    mockContext = {
      logger,
      resolveContent: mock(),
      getViewTemplate: mock().mockReturnValue({
        name: "test-template",
        component: () => "<div>Test</div>",
      }),
      listViewTemplates: mock().mockReturnValue([]),
      registerTemplates: mock(),
      entityService: {
        listEntities: mock().mockResolvedValue([]),
        getEntityTypes: mock().mockReturnValue([]),
      } as unknown as ServicePluginContext["entityService"],
    };

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
    siteBuilder = SiteBuilder.createFresh(
      logger,
      mockContext as ServicePluginContext,
      mockRouteRegistry as RouteRegistry,
      mockSiteInfoService as SiteInfoService,
      { getProfile: () => ({ name: "Test" }) } as any, // Mock ProfileService
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
      mockContext.resolveContent = mock().mockResolvedValue({
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
      expect(mockContext.resolveContent).toHaveBeenCalledWith(
        "topics:topic-list",
        {
          dataParams: {
            entityType: "topic",
            query: { limit: 100 },
          },
          fallback: undefined,
        },
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
      mockContext.resolveContent = mock().mockResolvedValue({
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
      expect(mockContext.resolveContent).toHaveBeenCalledWith(
        "topics:topic-detail",
        {
          dataParams: {
            entityType: "topic",
            query: { id: "test-topic" },
          },
          fallback: undefined,
        },
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
      mockContext.resolveContent = mock().mockImplementation((template) => {
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
      expect(mockContext.resolveContent).toHaveBeenCalledWith("hero", {
        savedContent: {
          entityType: "site-content",
          entityId: "mixed:static",
        },
        fallback: { title: "Static Hero" },
      });

      // Verify dynamic content used dataQuery params
      expect(mockContext.resolveContent).toHaveBeenCalledWith(
        "topics:topic-list",
        {
          dataParams: {
            entityType: "topic",
            query: { limit: 5 },
          },
          fallback: { fallbackTitle: "No topics" },
        },
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
      mockContext.resolveContent = mock().mockResolvedValue({
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
      expect(mockContext.resolveContent).toHaveBeenCalledWith(
        "topics:topic-list",
        {
          dataParams: {
            entityType: "topic",
          },
          fallback: undefined,
        },
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
              } as Record<string, unknown>,
            },
          },
        ],
      };

      mockRouteRegistry.list = mock().mockReturnValue([route]);
      mockContext.resolveContent = mock().mockResolvedValue({
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
      expect(mockContext.resolveContent).toHaveBeenCalledWith(
        "topics:topic-list",
        {
          dataParams: {
            entityType: "topic",
            query: {
              limit: 10,
              offset: 20,
              customParam: "value",
              anotherParam: 123,
            },
          },
          fallback: undefined,
        },
      );
    });
  });
});
