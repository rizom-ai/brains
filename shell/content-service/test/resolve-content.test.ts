import { describe, it, expect, beforeEach, mock, spyOn } from "bun:test";
import { z } from "@brains/utils";
import { ContentService } from "../src/content-service";
import type { ContentServiceDependencies } from "../src/content-service";
import { TemplateRegistry, type Template } from "@brains/templates";
import type { DataSource } from "@brains/datasource";
import {
  createSilentLogger,
  createMockEntityService,
  createMockAIService,
  createMockDataSourceRegistry,
} from "@brains/test-utils";

// Helper function for tests - simple pluralization
const testGenerateEntityUrl = (entityType: string, slug: string): string => {
  const pluralName = entityType.endsWith("y")
    ? entityType.slice(0, -1) + "ies"
    : entityType + "s";
  return `/${pluralName}/${slug}`;
};

describe("ContentService.resolveContent", () => {
  let mockDependencies: ContentServiceDependencies;
  let contentService: ContentService;
  let templateRegistry: TemplateRegistry;
  let dataSourceGetSpy: ReturnType<typeof spyOn>;
  let getEntitySpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    const mockLogger = createSilentLogger();

    const mockEntityService = createMockEntityService();
    const mockAIService = createMockAIService();
    const mockDataSourceRegistry = createMockDataSourceRegistry();

    // Create a fresh TemplateRegistry for each test
    templateRegistry = TemplateRegistry.createFresh(mockLogger);

    mockDependencies = {
      logger: mockLogger,
      entityService: mockEntityService,
      aiService: mockAIService,
      templateRegistry,
      dataSourceRegistry: mockDataSourceRegistry,
    };

    // Set up spies
    dataSourceGetSpy = spyOn(mockDataSourceRegistry, "get");
    getEntitySpy = spyOn(mockEntityService, "getEntity");

    contentService = new ContentService(mockDependencies);
  });

  describe("DataSource fetch resolution", () => {
    it("should resolve content via DataSource fetch when available", async () => {
      const mockTemplate: Template = {
        name: "dashboard",
        description: "Dashboard template",
        dataSourceId: "shell:system-stats",
        schema: z.object({
          cpu: z.number(),
          memory: z.number(),
        }),
        requiredPermission: "public",
      };

      const mockDataSource: Partial<DataSource> = {
        id: "shell:system-stats",
        name: "System Stats DataSource",
        fetch: mock().mockResolvedValue({
          cpu: 45.5,
          memory: 72.3,
        }),
      };

      templateRegistry.register("dashboard", mockTemplate);
      dataSourceGetSpy.mockReturnValue(mockDataSource);

      const result = await contentService.resolveContent("dashboard", {
        dataParams: { timeRange: "24h" },
        generateEntityUrl: testGenerateEntityUrl,
      });

      expect(result).toEqual({
        cpu: 45.5,
        memory: 72.3,
      });
      expect(mockDataSource.fetch).toHaveBeenCalledWith(
        { timeRange: "24h" },
        mockTemplate.schema,
        expect.objectContaining({ entityService: expect.anything() }),
      );
    });

    it("should skip DataSource fetch for AI generation templates", async () => {
      const mockTemplate: Template = {
        name: "article",
        description: "Article template",
        basePrompt: "Generate an article",
        dataSourceId: "shell:ai-content", // AI content, not fetch
        schema: z.string(),
        requiredPermission: "public",
      };

      const mockDataSource: Partial<DataSource> = {
        id: "shell:ai-content",
        name: "AI Content DataSource",
        generate: mock(),
        // No fetch method
      };

      templateRegistry.register("article", mockTemplate);
      dataSourceGetSpy.mockReturnValue(mockDataSource);

      const result = await contentService.resolveContent("article", {
        fallback: "Default content",
        generateEntityUrl: testGenerateEntityUrl,
      });

      expect(result).toBe("Default content");
      expect(mockDataSource.generate).not.toHaveBeenCalled();
    });
  });

  describe("Saved content resolution", () => {
    it("should resolve saved content when formatter is available", async () => {
      const mockTemplate: Template = {
        name: "article",
        description: "Article template",
        schema: z.object({
          title: z.string(),
          content: z.string(),
        }),
        formatter: {
          format: (data) => JSON.stringify(data),
          parse: (content) => JSON.parse(content),
        },
        requiredPermission: "public",
      };

      const savedArticle = {
        title: "Test Article",
        content: "Article content",
      };

      templateRegistry.register("article", mockTemplate);
      getEntitySpy.mockResolvedValue({
        id: "article-123",
        type: "site-content-preview",
        content: JSON.stringify(savedArticle),
      });

      const result = await contentService.resolveContent("article", {
        savedContent: {
          entityType: "site-content-preview",
          entityId: "article-123",
        },
        generateEntityUrl: testGenerateEntityUrl,
      });

      expect(result).toEqual(savedArticle);
      expect(mockDependencies.entityService.getEntity).toHaveBeenCalledWith(
        "site-content-preview",
        "article-123",
      );
    });

    it("should skip saved content when no formatter is available", async () => {
      const mockTemplate: Template = {
        name: "dashboard",
        description: "Dashboard template",
        schema: z.object({
          cpu: z.number(),
          memory: z.number(),
        }),
        // No formatter!
        requiredPermission: "public",
      };

      templateRegistry.register("dashboard", mockTemplate);
      getEntitySpy.mockResolvedValue({
        id: "dashboard-123",
        type: "site-content",
        content: '{"cpu": 50, "memory": 80}',
      });

      const result = await contentService.resolveContent("dashboard", {
        savedContent: {
          entityType: "site-content",
          entityId: "dashboard-123",
        },
        fallback: { cpu: 0, memory: 0 },
        generateEntityUrl: testGenerateEntityUrl,
      });

      // Should skip to fallback since no formatter
      expect(result).toEqual({ cpu: 0, memory: 0 });
      expect(mockDependencies.entityService.getEntity).not.toHaveBeenCalled();
    });
  });

  describe("Fallback resolution", () => {
    it("should use fallback when other strategies fail", async () => {
      const mockTemplate: Template = {
        name: "simple",
        description: "Simple template",
        schema: z.string(),
        requiredPermission: "public",
      };

      templateRegistry.register("simple", mockTemplate);

      const result = await contentService.resolveContent("simple", {
        fallback: "Fallback content",
        generateEntityUrl: testGenerateEntityUrl,
      });

      expect(result).toBe("Fallback content");
    });

    it("should validate fallback against schema", async () => {
      const mockTemplate: Template = {
        name: "typed",
        description: "Typed template",
        schema: z.object({
          value: z.number(),
        }),
        requiredPermission: "public",
      };

      templateRegistry.register("typed", mockTemplate);

      // Invalid fallback (string instead of object)
      const result = await contentService.resolveContent("typed", {
        fallback: "invalid",
        generateEntityUrl: testGenerateEntityUrl,
      });

      expect(result).toBeNull();
    });
  });

  describe("Resolution priority", () => {
    it("should prioritize DataSource fetch over saved content", async () => {
      const mockTemplate: Template = {
        name: "priority-test",
        description: "Priority test template",
        dataSourceId: "shell:test-source",
        schema: z.string(),
        formatter: {
          format: (data) => String(data),
          parse: (content) => content,
        },
        requiredPermission: "public",
      };

      const mockDataSource: Partial<DataSource> = {
        id: "shell:test-source",
        fetch: mock().mockResolvedValue("Fresh data"),
      };

      templateRegistry.register("priority-test", mockTemplate);
      dataSourceGetSpy.mockReturnValue(mockDataSource);
      getEntitySpy.mockResolvedValue({
        id: "test-123",
        type: "test",
        content: "Saved data",
      });

      const result = await contentService.resolveContent("priority-test", {
        savedContent: {
          entityType: "test",
          entityId: "test-123",
        },
        fallback: "Fallback data",
        generateEntityUrl: testGenerateEntityUrl,
      });

      expect(result).toBe("Fresh data");
      expect(mockDataSource.fetch).toHaveBeenCalled();
      expect(mockDependencies.entityService.getEntity).not.toHaveBeenCalled(); // Skipped
    });

    it("should prioritize saved content over fallback", async () => {
      const mockTemplate: Template = {
        name: "priority-test2",
        description: "Priority test template 2",
        schema: z.string(),
        formatter: {
          format: (data) => String(data),
          parse: (content) => content,
        },
        requiredPermission: "public",
      };

      templateRegistry.register("priority-test2", mockTemplate);
      getEntitySpy.mockResolvedValue({
        id: "test-456",
        type: "test",
        content: "Saved data",
      });

      const result = await contentService.resolveContent("priority-test2", {
        savedContent: {
          entityType: "test",
          entityId: "test-456",
        },
        fallback: "Fallback data",
        generateEntityUrl: testGenerateEntityUrl,
      });

      expect(result).toBe("Saved data");
      expect(mockDependencies.entityService.getEntity).toHaveBeenCalled();
    });
  });

  describe("Error handling", () => {
    it("should return null when template not found", async () => {
      const result = await contentService.resolveContent("non-existent");
      expect(result).toBeNull();
    });

    it("should continue to next strategy when DataSource fetch fails", async () => {
      const mockTemplate: Template = {
        name: "error-test",
        description: "Error test template",
        dataSourceId: "shell:failing-source",
        schema: z.string(),
        requiredPermission: "public",
      };

      const mockDataSource: Partial<DataSource> = {
        id: "shell:failing-source",
        fetch: mock().mockRejectedValue(new Error("Fetch failed")),
      };

      templateRegistry.register("error-test", mockTemplate);
      dataSourceGetSpy.mockReturnValue(mockDataSource);

      const result = await contentService.resolveContent("error-test", {
        fallback: "Fallback after error",
        generateEntityUrl: testGenerateEntityUrl,
      });

      expect(result).toBe("Fallback after error");
      expect(mockDataSource.fetch).toHaveBeenCalled();
    });

    it("should continue to next strategy when entity not found", async () => {
      const mockTemplate: Template = {
        name: "entity-error",
        description: "Entity error template",
        schema: z.string(),
        formatter: {
          format: (data) => String(data),
          parse: (content) => content,
        },
        requiredPermission: "public",
      };

      templateRegistry.register("entity-error", mockTemplate);
      getEntitySpy.mockResolvedValue(null);

      const result = await contentService.resolveContent("entity-error", {
        savedContent: {
          entityType: "test",
          entityId: "missing",
        },
        fallback: "Fallback after missing entity",
        generateEntityUrl: testGenerateEntityUrl,
      });

      expect(result).toBe("Fallback after missing entity");
      expect(mockDependencies.entityService.getEntity).toHaveBeenCalled();
    });
  });

  describe("DataSource fetch with parameters", () => {
    it("should pass dataParams and schema to fetch method", async () => {
      const mockTemplate: Template = {
        name: "simple-sourced",
        description: "Template with simple DataSource",
        dataSourceId: "shell:simple-source",
        schema: z.string(),
        requiredPermission: "public",
      };

      const mockDataSource: Partial<DataSource> = {
        id: "shell:simple-source",
        fetch: mock().mockResolvedValue("Simple data"),
      };

      templateRegistry.register("simple-sourced", mockTemplate);
      dataSourceGetSpy.mockReturnValue(mockDataSource);

      const result = await contentService.resolveContent("simple-sourced", {
        dataParams: { test: true },
        generateEntityUrl: testGenerateEntityUrl,
      });

      expect(result).toBe("Simple data");
      expect(mockDataSource.fetch).toHaveBeenCalledWith(
        { test: true },
        mockTemplate.schema,
        expect.objectContaining({ entityService: expect.anything() }),
      );
    });
  });

  describe("publishedOnly context with scoped entityService", () => {
    it("should pass scoped entityService that auto-applies publishedOnly in production", async () => {
      const mockTemplate: Template = {
        name: "prod-test",
        description: "Production test template",
        dataSourceId: "shell:test-source",
        schema: z.object({ items: z.array(z.string()) }),
        requiredPermission: "public",
      };

      let capturedContext: {
        publishedOnly?: boolean;
        entityService?: unknown;
      } = {};
      const mockDataSource: Partial<DataSource> = {
        id: "shell:test-source",
        fetch: mock().mockImplementation(async (_query, _schema, context) => {
          capturedContext = context;
          // Datasource uses context.entityService (not its own)
          const svc =
            context.entityService as typeof mockDependencies.entityService;
          await svc.listEntities("post", { limit: 10 });
          return { items: [] };
        }),
      };

      templateRegistry.register("prod-test", mockTemplate);
      dataSourceGetSpy.mockReturnValue(mockDataSource);

      const listEntitiesSpy = spyOn(
        mockDependencies.entityService,
        "listEntities",
      ).mockResolvedValue([]);

      await contentService.resolveContent("prod-test", {
        dataParams: { entityType: "post" },
        publishedOnly: true,
        generateEntityUrl: testGenerateEntityUrl,
      });

      // Context should have entityService
      expect(capturedContext.entityService).toBeDefined();
      // The scoped entityService should auto-add publishedOnly: true
      expect(listEntitiesSpy).toHaveBeenCalledWith(
        "post",
        expect.objectContaining({ publishedOnly: true }),
      );
    });

    it("should pass scoped entityService without filter in preview", async () => {
      const mockTemplate: Template = {
        name: "preview-test",
        description: "Preview test template",
        dataSourceId: "shell:test-source",
        schema: z.object({ items: z.array(z.string()) }),
        requiredPermission: "public",
      };

      const mockDataSource: Partial<DataSource> = {
        id: "shell:test-source",
        fetch: mock().mockImplementation(async (_query, _schema, context) => {
          const svc =
            context.entityService as typeof mockDependencies.entityService;
          await svc.listEntities("post", { limit: 10 });
          return { items: [] };
        }),
      };

      templateRegistry.register("preview-test", mockTemplate);
      dataSourceGetSpy.mockReturnValue(mockDataSource);

      const listEntitiesSpy = spyOn(
        mockDependencies.entityService,
        "listEntities",
      ).mockResolvedValue([]);

      await contentService.resolveContent("preview-test", {
        dataParams: { entityType: "post" },
        publishedOnly: false,
        generateEntityUrl: testGenerateEntityUrl,
      });

      // In preview, publishedOnly should NOT be added
      expect(listEntitiesSpy).toHaveBeenCalledWith("post", { limit: 10 });
    });

    it("should NOT add publishedOnly when datasource already filters on status (avoids conflict)", async () => {
      // Regression test: When a datasource filters on status (e.g., status='queued'),
      // adding publishedOnly would create conflicting WHERE clauses:
      // status='published' AND status='queued' - which returns nothing!
      const mockTemplate: Template = {
        name: "queue-test",
        description: "Queue test template",
        dataSourceId: "shell:queue-source",
        schema: z.object({ post: z.unknown().nullable() }),
        requiredPermission: "public",
      };

      const mockDataSource: Partial<DataSource> = {
        id: "shell:queue-source",
        fetch: mock().mockImplementation(async (_query, _schema, context) => {
          const svc =
            context.entityService as typeof mockDependencies.entityService;
          // Datasource explicitly filters for queued status
          await svc.listEntities("social-post", {
            filter: { metadata: { status: "queued" } },
            limit: 1,
          });
          return { post: null };
        }),
      };

      templateRegistry.register("queue-test", mockTemplate);
      dataSourceGetSpy.mockReturnValue(mockDataSource);

      const listEntitiesSpy = spyOn(
        mockDependencies.entityService,
        "listEntities",
      ).mockResolvedValue([]);

      await contentService.resolveContent("queue-test", {
        dataParams: {},
        publishedOnly: true, // Production mode
        generateEntityUrl: testGenerateEntityUrl,
      });

      // Should NOT add publishedOnly since datasource already filters on status
      expect(listEntitiesSpy).toHaveBeenCalledWith("social-post", {
        filter: { metadata: { status: "queued" } },
        limit: 1,
        // Note: publishedOnly should NOT be present here
      });
      // Explicitly verify publishedOnly was NOT added
      const callArgs = listEntitiesSpy.mock.calls[0];
      expect(callArgs?.[1]).not.toHaveProperty("publishedOnly");
    });

    it("should add publishedOnly when datasource filters on non-status metadata", async () => {
      // When filtering on other metadata (like slug, seriesName), publishedOnly should still apply
      const mockTemplate: Template = {
        name: "series-test",
        description: "Series test template",
        dataSourceId: "shell:series-source",
        schema: z.object({ posts: z.array(z.unknown()) }),
        requiredPermission: "public",
      };

      const mockDataSource: Partial<DataSource> = {
        id: "shell:series-source",
        fetch: mock().mockImplementation(async (_query, _schema, context) => {
          const svc =
            context.entityService as typeof mockDependencies.entityService;
          // Datasource filters on seriesName, not status
          await svc.listEntities("post", {
            filter: { metadata: { seriesName: "My Series" } },
            limit: 100,
          });
          return { posts: [] };
        }),
      };

      templateRegistry.register("series-test", mockTemplate);
      dataSourceGetSpy.mockReturnValue(mockDataSource);

      const listEntitiesSpy = spyOn(
        mockDependencies.entityService,
        "listEntities",
      ).mockResolvedValue([]);

      await contentService.resolveContent("series-test", {
        dataParams: {},
        publishedOnly: true, // Production mode
        generateEntityUrl: testGenerateEntityUrl,
      });

      // Should add publishedOnly since the filter is on seriesName, not status
      expect(listEntitiesSpy).toHaveBeenCalledWith("post", {
        filter: { metadata: { seriesName: "My Series" } },
        limit: 100,
        publishedOnly: true,
      });
    });

    it("should add publishedOnly to countEntities when no status filter", async () => {
      const mockTemplate: Template = {
        name: "count-test",
        description: "Count test template",
        dataSourceId: "shell:count-source",
        schema: z.object({ count: z.number() }),
        requiredPermission: "public",
      };

      const mockDataSource: Partial<DataSource> = {
        id: "shell:count-source",
        fetch: mock().mockImplementation(async (_query, _schema, context) => {
          const svc =
            context.entityService as typeof mockDependencies.entityService;
          await svc.countEntities("post");
          return { count: 0 };
        }),
      };

      templateRegistry.register("count-test", mockTemplate);
      dataSourceGetSpy.mockReturnValue(mockDataSource);

      const countEntitiesSpy = spyOn(
        mockDependencies.entityService,
        "countEntities",
      ).mockResolvedValue(0);

      await contentService.resolveContent("count-test", {
        dataParams: {},
        publishedOnly: true,
        generateEntityUrl: testGenerateEntityUrl,
      });

      // Should add publishedOnly to countEntities
      expect(countEntitiesSpy).toHaveBeenCalledWith("post", {
        publishedOnly: true,
      });
    });

    it("should NOT add publishedOnly to countEntities when status filter present", async () => {
      const mockTemplate: Template = {
        name: "count-status-test",
        description: "Count with status filter test template",
        dataSourceId: "shell:count-status-source",
        schema: z.object({ count: z.number() }),
        requiredPermission: "public",
      };

      const mockDataSource: Partial<DataSource> = {
        id: "shell:count-status-source",
        fetch: mock().mockImplementation(async (_query, _schema, context) => {
          const svc =
            context.entityService as typeof mockDependencies.entityService;
          // Count with explicit status filter
          await svc.countEntities("newsletter", {
            filter: { metadata: { status: "draft" } },
          });
          return { count: 0 };
        }),
      };

      templateRegistry.register("count-status-test", mockTemplate);
      dataSourceGetSpy.mockReturnValue(mockDataSource);

      const countEntitiesSpy = spyOn(
        mockDependencies.entityService,
        "countEntities",
      ).mockResolvedValue(0);

      await contentService.resolveContent("count-status-test", {
        dataParams: {},
        publishedOnly: true,
        generateEntityUrl: testGenerateEntityUrl,
      });

      // Should NOT add publishedOnly since status filter already present
      expect(countEntitiesSpy).toHaveBeenCalledWith("newsletter", {
        filter: { metadata: { status: "draft" } },
      });
      const callArgs = countEntitiesSpy.mock.calls[0];
      expect(callArgs?.[1]).not.toHaveProperty("publishedOnly");
    });

    it("should forward getEntity calls through scoped entityService", async () => {
      // Regression test: The scoped entityService must properly forward all methods,
      // not just listEntities/countEntities. If using object spread on a class instance,
      // prototype methods won't be copied and calls will fail.
      const mockTemplate: Template = {
        name: "forward-test",
        description: "Forward test template",
        dataSourceId: "shell:forward-source",
        schema: z.object({ entity: z.unknown().nullable() }),
        requiredPermission: "public",
      };

      const mockDataSource: Partial<DataSource> = {
        id: "shell:forward-source",
        fetch: mock().mockImplementation(async (_query, _schema, context) => {
          const svc =
            context.entityService as typeof mockDependencies.entityService;
          // Call getEntity - this should be forwarded to base service
          const entity = await svc.getEntity("post", "test-id");
          return { entity };
        }),
      };

      templateRegistry.register("forward-test", mockTemplate);
      dataSourceGetSpy.mockReturnValue(mockDataSource);

      const getEntitySpy = spyOn(
        mockDependencies.entityService,
        "getEntity",
      ).mockResolvedValue({
        id: "test-id",
        entityType: "post",
        content: "test",
        created: "2025-01-01",
        updated: "2025-01-01",
        metadata: {},
        contentHash: "abc",
      });

      await contentService.resolveContent("forward-test", {
        dataParams: {},
        publishedOnly: true, // Use scoped service
        generateEntityUrl: testGenerateEntityUrl,
      });

      // getEntity should be forwarded to base service
      expect(getEntitySpy).toHaveBeenCalledWith("post", "test-id");
    });

    it("should forward search calls through scoped entityService", async () => {
      const mockTemplate: Template = {
        name: "search-test",
        description: "Search test template",
        dataSourceId: "shell:search-source",
        schema: z.object({ results: z.array(z.unknown()) }),
        requiredPermission: "public",
      };

      const mockDataSource: Partial<DataSource> = {
        id: "shell:search-source",
        fetch: mock().mockImplementation(async (_query, _schema, context) => {
          const svc =
            context.entityService as typeof mockDependencies.entityService;
          // Call search - this should be forwarded to base service
          const results = await svc.search("test query");
          return { results };
        }),
      };

      templateRegistry.register("search-test", mockTemplate);
      dataSourceGetSpy.mockReturnValue(mockDataSource);

      const searchSpy = spyOn(
        mockDependencies.entityService,
        "search",
      ).mockResolvedValue([]);

      await contentService.resolveContent("search-test", {
        dataParams: {},
        publishedOnly: true, // Use scoped service
        generateEntityUrl: testGenerateEntityUrl,
      });

      // search should be forwarded to base service
      expect(searchSpy).toHaveBeenCalledWith("test query");
    });

    it("should properly proxy class-based entityService (regression for prototype methods)", async () => {
      // Regression test: When using object spread {...baseService} on a class instance,
      // prototype methods are NOT copied. This test uses a class-based mock to catch this.
      class MockEntityServiceClass {
        getEntity = mock((_type: string, _id: string) => Promise.resolve(null));
        listEntities = mock((_type: string, _options?: unknown) =>
          Promise.resolve([]),
        );
        countEntities = mock((_type: string, _options?: unknown) =>
          Promise.resolve(0),
        );
        search = mock((_query: string, _options?: unknown) =>
          Promise.resolve([]),
        );
        // Methods on prototype (simulating real class behavior)
        getEntityTypes(): string[] {
          return ["post", "deck"];
        }
        hasEntityType(type: string): boolean {
          return ["post", "deck"].includes(type);
        }
      }

      const classBasedService = new MockEntityServiceClass();

      // Create new ContentService with class-based entity service
      const classDependencies: ContentServiceDependencies = {
        ...mockDependencies,
        entityService:
          classBasedService as unknown as typeof mockDependencies.entityService,
      };
      const classContentService = new ContentService(classDependencies);

      const mockTemplate: Template = {
        name: "class-proxy-test",
        description: "Class proxy test template",
        dataSourceId: "shell:class-source",
        schema: z.object({ types: z.array(z.string()) }),
        requiredPermission: "public",
      };

      const mockDataSource: Partial<DataSource> = {
        id: "shell:class-source",
        fetch: mock().mockImplementation(async (_query, _schema, context) => {
          const svc = context.entityService as MockEntityServiceClass;
          // Call prototype method - this MUST work through the proxy
          const types = svc.getEntityTypes();
          const hasPost = svc.hasEntityType("post");
          // Also call instance methods
          await svc.listEntities("post", { limit: 5 });
          return { types, hasPost };
        }),
      };

      templateRegistry.register("class-proxy-test", mockTemplate);
      dataSourceGetSpy.mockReturnValue(mockDataSource);

      const result = await classContentService.resolveContent(
        "class-proxy-test",
        {
          dataParams: {},
          publishedOnly: true, // Use scoped service - triggers proxy
          generateEntityUrl: testGenerateEntityUrl,
        },
      );

      // Verify prototype methods were callable
      expect(result).toEqual({ types: ["post", "deck"], hasPost: true });
      // Verify listEntities was called with publishedOnly added
      expect(classBasedService.listEntities).toHaveBeenCalledWith("post", {
        limit: 5,
        publishedOnly: true,
      });
    });
  });

  describe("Plugin scoping", () => {
    it("should apply plugin scoping when provided", async () => {
      const mockTemplate: Template = {
        name: "scoped",
        description: "Scoped template",
        schema: z.string(),
        requiredPermission: "public",
      };

      templateRegistry.register("myplugin:scoped", mockTemplate);

      const result = await contentService.resolveContent(
        "scoped",
        {
          fallback: "Scoped content",
          generateEntityUrl: testGenerateEntityUrl,
        },
        "myplugin",
      );

      expect(result).toBe("Scoped content");
    });

    it("should not double-scope already scoped template names", async () => {
      const mockTemplate: Template = {
        name: "already-scoped",
        description: "Already scoped template",
        schema: z.string(),
        requiredPermission: "public",
      };

      templateRegistry.register("plugin:already-scoped", mockTemplate);

      const result = await contentService.resolveContent(
        "plugin:already-scoped",
        {
          fallback: "Content",
          generateEntityUrl: testGenerateEntityUrl,
        },
        "otherplugin", // Different plugin, but shouldn't double-scope
      );

      expect(result).toBe("Content");
    });
  });
});
