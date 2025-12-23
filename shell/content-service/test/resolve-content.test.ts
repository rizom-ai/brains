import { describe, it, expect, beforeEach, mock } from "bun:test";
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
      (
        mockDependencies.dataSourceRegistry.get as ReturnType<typeof mock>
      ).mockReturnValue(mockDataSource);

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
        {}, // BaseDataSourceContext (empty, no generateEntityUrl)
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
      (
        mockDependencies.dataSourceRegistry.get as ReturnType<typeof mock>
      ).mockReturnValue(mockDataSource);

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
      (
        mockDependencies.entityService.getEntity as ReturnType<typeof mock>
      ).mockResolvedValue({
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
      (
        mockDependencies.entityService.getEntity as ReturnType<typeof mock>
      ).mockResolvedValue({
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
      (
        mockDependencies.dataSourceRegistry.get as ReturnType<typeof mock>
      ).mockReturnValue(mockDataSource);
      (
        mockDependencies.entityService.getEntity as ReturnType<typeof mock>
      ).mockResolvedValue({
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
      (
        mockDependencies.entityService.getEntity as ReturnType<typeof mock>
      ).mockResolvedValue({
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
      (
        mockDependencies.dataSourceRegistry.get as ReturnType<typeof mock>
      ).mockReturnValue(mockDataSource);

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
      (
        mockDependencies.entityService.getEntity as ReturnType<typeof mock>
      ).mockResolvedValue(null);

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
      (
        mockDependencies.dataSourceRegistry.get as ReturnType<typeof mock>
      ).mockReturnValue(mockDataSource);

      const result = await contentService.resolveContent("simple-sourced", {
        dataParams: { test: true },
        generateEntityUrl: testGenerateEntityUrl,
      });

      expect(result).toBe("Simple data");
      expect(mockDataSource.fetch).toHaveBeenCalledWith(
        { test: true },
        mockTemplate.schema,
        {}, // BaseDataSourceContext (empty object)
      );
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
