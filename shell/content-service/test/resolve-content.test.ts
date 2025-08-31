import { describe, it, expect, beforeEach, mock } from "bun:test";
import { z } from "@brains/utils";
import { ContentService } from "../src/content-service";
import type { ContentServiceDependencies } from "../src/content-service";
import { TemplateRegistry, type Template } from "@brains/templates";
import type { EntityService } from "@brains/entity-service";
import type { AIService } from "@brains/ai-service";
import type { DataSourceRegistry, DataSource } from "@brains/datasource";
import { createSilentLogger } from "@brains/utils";

describe("ContentService.resolveContent", () => {
  let mockDependencies: ContentServiceDependencies;
  let contentService: ContentService;
  let templateRegistry: TemplateRegistry;
  let mockEntityService: {
    getEntity: ReturnType<typeof mock>;
  };
  let mockDataSourceRegistry: {
    get: ReturnType<typeof mock>;
  };

  beforeEach(() => {
    const mockLogger = createSilentLogger();

    mockEntityService = {
      getEntity: mock(),
    };

    const mockAIService = {
      generateObject: mock(),
    };

    // Create a fresh TemplateRegistry for each test
    templateRegistry = TemplateRegistry.createFresh(mockLogger);

    // Create mock DataSourceRegistry
    mockDataSourceRegistry = {
      get: mock(),
      register: mock(),
      has: mock(),
      getIds: mock(),
      list: mock(),
    };

    mockDependencies = {
      logger: mockLogger,
      entityService: mockEntityService as EntityService,
      aiService: mockAIService as AIService,
      templateRegistry,
      dataSourceRegistry: mockDataSourceRegistry as DataSourceRegistry,
    };

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
      mockDataSourceRegistry.get.mockReturnValue(mockDataSource);

      const result = await contentService.resolveContent("dashboard", {
        dataParams: { timeRange: "24h" },
      });

      expect(result).toEqual({
        cpu: 45.5,
        memory: 72.3,
      });
      expect(mockDataSource.fetch).toHaveBeenCalledWith({ timeRange: "24h" });
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
      mockDataSourceRegistry.get.mockReturnValue(mockDataSource);

      const result = await contentService.resolveContent("article", {
        fallback: "Default content",
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
      mockEntityService.getEntity.mockResolvedValue({
        id: "article-123",
        type: "site-content-preview",
        content: JSON.stringify(savedArticle),
      });

      const result = await contentService.resolveContent("article", {
        savedContent: {
          entityType: "site-content-preview",
          entityId: "article-123",
        },
      });

      expect(result).toEqual(savedArticle);
      expect(mockEntityService.getEntity).toHaveBeenCalledWith(
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
      mockEntityService.getEntity.mockResolvedValue({
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
      });

      // Should skip to fallback since no formatter
      expect(result).toEqual({ cpu: 0, memory: 0 });
      expect(mockEntityService.getEntity).not.toHaveBeenCalled();
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
      mockDataSourceRegistry.get.mockReturnValue(mockDataSource);
      mockEntityService.getEntity.mockResolvedValue({
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
      });

      expect(result).toBe("Fresh data");
      expect(mockDataSource.fetch).toHaveBeenCalled();
      expect(mockEntityService.getEntity).not.toHaveBeenCalled(); // Skipped
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
      mockEntityService.getEntity.mockResolvedValue({
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
      });

      expect(result).toBe("Saved data");
      expect(mockEntityService.getEntity).toHaveBeenCalled();
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
      mockDataSourceRegistry.get.mockReturnValue(mockDataSource);

      const result = await contentService.resolveContent("error-test", {
        fallback: "Fallback after error",
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
      mockEntityService.getEntity.mockResolvedValue(null);

      const result = await contentService.resolveContent("entity-error", {
        savedContent: {
          entityType: "test",
          entityId: "missing",
        },
        fallback: "Fallback after missing entity",
      });

      expect(result).toBe("Fallback after missing entity");
      expect(mockEntityService.getEntity).toHaveBeenCalled();
    });
  });

  describe("DataSource fetch + transform pattern", () => {
    it("should use fetch + transform when transformFormat is provided", async () => {
      const mockTemplate: Template = {
        name: "entity-sourced",
        description: "Template with entity DataSource",
        dataSourceId: "topics:entities",
        schema: z.object({ title: z.string(), count: z.number() }),
        requiredPermission: "public",
      };

      const rawData = [
        { id: "topic-1", title: "Topic 1" },
        { id: "topic-2", title: "Topic 2" },
      ];

      const transformedData = {
        title: "Topics List",
        count: 2,
      };

      const mockDataSource: Partial<DataSource> = {
        id: "topics:entities",
        fetch: mock().mockResolvedValue(rawData),
        transform: mock().mockResolvedValue(transformedData),
      };

      templateRegistry.register("entity-sourced", mockTemplate);
      mockDataSourceRegistry.get.mockReturnValue(mockDataSource);

      const result = await contentService.resolveContent("entity-sourced", {
        dataParams: { entityType: "topic", query: { limit: 10 } },
        transformFormat: "list",
      });

      expect(result).toEqual(transformedData);
      expect(mockDataSource.fetch).toHaveBeenCalledWith({
        entityType: "topic",
        query: { limit: 10 },
      });
      expect(mockDataSource.transform).toHaveBeenCalledWith(
        rawData,
        "list",
        mockTemplate.schema,
      );
    });

    it("should fallback to simple fetch when transform is not available", async () => {
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
        // No transform method
      };

      templateRegistry.register("simple-sourced", mockTemplate);
      mockDataSourceRegistry.get.mockReturnValue(mockDataSource);

      const result = await contentService.resolveContent("simple-sourced", {
        dataParams: { test: true },
        transformFormat: "detail", // Format provided but will be ignored
      });

      expect(result).toBe("Simple data");
      expect(mockDataSource.fetch).toHaveBeenCalledWith({ test: true });
    });

    it("should handle transform errors gracefully", async () => {
      const mockTemplate: Template = {
        name: "error-transform",
        description: "Template with failing transform",
        dataSourceId: "topics:entities",
        schema: z.object({ title: z.string() }),
        requiredPermission: "public",
      };

      const rawData = { id: "topic-1", title: "Topic 1" };

      const mockDataSource: Partial<DataSource> = {
        id: "topics:entities",
        fetch: mock().mockResolvedValue(rawData),
        transform: mock().mockRejectedValue(new Error("Transform failed")),
      };

      templateRegistry.register("error-transform", mockTemplate);
      mockDataSourceRegistry.get.mockReturnValue(mockDataSource);

      const result = await contentService.resolveContent("error-transform", {
        dataParams: { entityType: "topic", query: { id: "topic-1" } },
        transformFormat: "detail",
        fallback: { title: "Fallback Title" },
      });

      // Should fall back to fallback content
      expect(result).toEqual({ title: "Fallback Title" });
      expect(mockDataSource.fetch).toHaveBeenCalled();
      expect(mockDataSource.transform).toHaveBeenCalled();
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
        },
        "otherplugin", // Different plugin, but shouldn't double-scope
      );

      expect(result).toBe("Content");
    });
  });
});
