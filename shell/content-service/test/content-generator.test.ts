import { describe, it, expect, beforeEach, mock } from "bun:test";
import { z } from "@brains/utils";
import { ContentService } from "../src/content-service";
import type { ContentServiceDependencies } from "../src/content-service";
import { TemplateRegistry, type Template } from "@brains/templates";
import type { EntityService } from "@brains/entity-service";
import type { AIService } from "@brains/ai-service";
import type { DataSourceRegistry } from "@brains/datasource";
import { createSilentLogger } from "@brains/utils";

describe("ContentService", () => {
  let mockDependencies: ContentServiceDependencies;
  let contentService: ContentService;
  let templateRegistry: TemplateRegistry;
  let mockEntitySearch: ReturnType<typeof mock>;
  let mockEntityGetTypes: ReturnType<typeof mock>;
  let mockAIGenerateObject: ReturnType<typeof mock>;

  beforeEach(() => {
    const mockLogger = createSilentLogger();

    mockEntitySearch = mock();
    mockEntityGetTypes = mock(() => ["note", "link", "project"]);
    mockAIGenerateObject = mock();

    const mockEntityService = {
      search: mockEntitySearch,
      getEntityTypes: mockEntityGetTypes,
    };

    const mockAIService = {
      generateObject: mockAIGenerateObject,
    };

    const mockGetMessages = mock();
    mockGetMessages.mockResolvedValue([
      { role: "user", content: "Test message 1" },
      { role: "assistant", content: "Test response 1" },
    ]);

    // Create a fresh TemplateRegistry for each test
    templateRegistry = TemplateRegistry.createFresh(mockLogger);

    // Create mock DataSourceRegistry
    const mockDataSourceRegistry = {
      get: mock(),
      register: mock(),
      has: mock(),
      getIds: mock(),
      list: mock(),
      registerWithId: mock(),
      getAll: mock(),
      reset: mock(),
      clear: mock(),
      dataSources: new Map(),
      logger: mockLogger,
    };

    mockDependencies = {
      logger: mockLogger,
      entityService: mockEntityService as unknown as EntityService,
      aiService: mockAIService as unknown as AIService,
      templateRegistry,
      dataSourceRegistry: mockDataSourceRegistry as unknown as DataSourceRegistry,
    };

    contentService = new ContentService(mockDependencies);
  });

  describe("generateContent", () => {
    const mockTemplate: Template = {
      name: "test-template",
      description: "Test template for content generation",
      basePrompt: "Generate test content",
      dataSourceId: "shell:ai-content",
      schema: z.string(),
      formatter: {
        format: mock((content) => `formatted: ${content}`),
        parse: mock(),
      },
      requiredPermission: "public",
    };

    const mockDataSource = {
      id: "shell:ai-content",
      name: "AI Content DataSource",
      generate: mock(),
    };

    beforeEach(() => {
      // Register the mock template with the registry
      templateRegistry.register("test-template", mockTemplate);
      // Setup DataSource registry mock to return our mock DataSource
      (mockDependencies.dataSourceRegistry.get as ReturnType<typeof mock>).mockReturnValue(mockDataSource);
      mockDataSource.generate.mockResolvedValue("raw content");
    });

    it("should generate content successfully using DataSource", async () => {
      const result = await contentService.generateContent("test-template");

      expect(mockDependencies.dataSourceRegistry.get).toHaveBeenCalledWith(
        "shell:ai-content",
      );
      expect(mockDataSource.generate).toHaveBeenCalledWith(
        { templateName: "test-template" },
        mockTemplate.schema,
      );
      expect(result).toBe("raw content");
    });

    it("should pass context including conversationHistory to DataSource", async () => {
      const context = {
        conversationHistory: "User: Hello\n\nAssistant: Hi there!",
        prompt: "Additional prompt",
      };

      await contentService.generateContent("test-template", context);

      expect(mockDataSource.generate).toHaveBeenCalledWith(
        {
          templateName: "test-template",
          conversationHistory: "User: Hello\n\nAssistant: Hi there!",
          prompt: "Additional prompt",
        },
        mockTemplate.schema,
      );
    });

    it("should throw error for templates without dataSourceId", async () => {
      const templateWithoutDataSource: Template = {
        name: "no-datasource-template",
        description: "Template without DataSource",
        basePrompt: "Generate content",
        schema: z.string(),
        requiredPermission: "public",
      };

      templateRegistry.register(
        "no-datasource-template",
        templateWithoutDataSource,
      );

      expect(
        contentService.generateContent("no-datasource-template"),
      ).rejects.toThrow(
        "Template no-datasource-template doesn't support content generation. Add dataSourceId to enable generation through DataSource pattern.",
      );
    });

    it("should pass additional prompt to DataSource", async () => {
      await contentService.generateContent("test-template", {
        prompt: "Additional instructions",
      });

      expect(mockDataSource.generate).toHaveBeenCalledWith(
        {
          templateName: "test-template",
          prompt: "Additional instructions",
        },
        mockTemplate.schema,
      );
    });

    it("should pass context data to DataSource", async () => {
      const contextData = { key: "value" };
      await contentService.generateContent("test-template", {
        data: contextData,
      });

      expect(mockDataSource.generate).toHaveBeenCalledWith(
        {
          templateName: "test-template",
          data: contextData,
        },
        mockTemplate.schema,
      );
    });

    it("should handle templates without formatters", async () => {
      const templateWithoutFormatter: Template = {
        name: "test-template-no-formatter",
        description: "Test template without formatter",
        basePrompt: "Generate test content",
        dataSourceId: "shell:ai-content",
        schema: z.string(),
        requiredPermission: "public",
      };
      templateRegistry.register(
        "test-template-no-formatter",
        templateWithoutFormatter,
      );
      mockDataSource.generate.mockResolvedValue("string content");

      const result = await contentService.generateContent(
        "test-template-no-formatter",
      );

      expect(result).toBe("string content");
    });

    it("should handle object content from DataSource", async () => {
      const templateWithSchema: Template = {
        name: "test-template-object",
        description: "Test template for object content",
        basePrompt: "Generate test content",
        dataSourceId: "shell:ai-content",
        schema: z.object({ data: z.string() }),
        requiredPermission: "public",
      };
      templateRegistry.register("test-template-object", templateWithSchema);
      mockDataSource.generate.mockResolvedValue({ data: "object" });

      const result = await contentService.generateContent(
        "test-template-object",
      );

      expect(result).toEqual({ data: "object" });
    });

    it("should throw error when template not found", async () => {
      expect(
        contentService.generateContent("non-existent-template"),
      ).rejects.toThrow("Template not found: non-existent-template");
    });
  });

  describe("parseContent", () => {
    const mockTemplate: Template = {
      name: "test-template",
      description: "Test template with formatter",
      basePrompt: "Generate test content",
      schema: z.object({ title: z.string(), content: z.string() }),
      formatter: {
        format: mock((content) => `# ${content.title}\n\n${content.content}`),
        parse: mock((content: string) => {
          const lines = content.split("\n");
          const title = lines[0]?.replace("# ", "") ?? "";
          const contentText = lines.slice(2).join("\n");
          return { title, content: contentText };
        }),
      },
      requiredPermission: "public",
    };

    beforeEach(() => {
      templateRegistry.register("test-template", mockTemplate);
    });

    it("should parse content using template formatter", () => {
      const markdownContent = "# Test Title\n\nThis is test content";

      const result = contentService.parseContent(
        "test-template",
        markdownContent,
      );

      expect(mockTemplate.formatter?.parse).toHaveBeenCalledWith(
        markdownContent,
      );
      expect(result).toEqual({
        title: "Test Title",
        content: "This is test content",
      });
    });

    it("should throw error when template not found", () => {
      expect(() => {
        contentService.parseContent("non-existent-template", "content");
      }).toThrow("Template not found: non-existent-template");
    });

    it("should throw error when template has no formatter", () => {
      const templateWithoutFormatter: Template = {
        name: "no-formatter-template",
        description: "Template without formatter",
        basePrompt: "Generate content",
        schema: z.string(),
        requiredPermission: "public",
      };
      templateRegistry.register(
        "no-formatter-template",
        templateWithoutFormatter,
      );

      expect(() => {
        contentService.parseContent("no-formatter-template", "content");
      }).toThrow(
        "Template no-formatter-template does not have a formatter for parsing",
      );
    });
  });
});
