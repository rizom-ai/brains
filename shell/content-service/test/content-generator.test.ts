import { describe, it, expect, beforeEach, mock } from "bun:test";
import { z } from "zod";
import { ContentService } from "../src/content-service";
import type {
  ContentServiceDependencies,
  ProgressInfo,
} from "../src/content-service";
import { TemplateRegistry, type Template } from "@brains/templates";
import type {
  RouteDefinition,
  SectionDefinition,
} from "@brains/render-service";
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
      mockDependencies.dataSourceRegistry.get.mockReturnValue(mockDataSource);
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

    it("should pass context including conversationId to DataSource", async () => {
      const context = {
        conversationId: "test-conversation-123",
        prompt: "Additional prompt",
      };

      await contentService.generateContent("test-template", context);

      expect(mockDataSource.generate).toHaveBeenCalledWith(
        {
          templateName: "test-template",
          conversationId: "test-conversation-123",
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

  describe("generateWithRoute", () => {
    const mockTemplate: Template = {
      name: "site-builder:dashboard",
      description: "Dashboard template for site builder",
      basePrompt: "Generate route content",
      dataSourceId: "shell:ai-content",
      schema: z.string(),
      formatter: {
        format: mock((content) => `formatted: ${content}`),
        parse: mock(),
      },
    };

    const mockDataSource = {
      id: "shell:ai-content",
      name: "AI Content DataSource",
      generate: mock(),
    };

    const mockRoute: RouteDefinition = {
      id: "test-route",
      path: "/test",
      title: "Test Route",
      description: "Test route description",
      sections: [],
    };

    const mockSection: SectionDefinition = {
      id: "test-section",
      template: "dashboard",
    };

    const mockProgress: ProgressInfo = {
      current: 1,
      total: 5,
      message: "Processing...",
    };

    beforeEach(() => {
      templateRegistry.register("dashboard", mockTemplate);
      mockDependencies.dataSourceRegistry.get.mockReturnValue(mockDataSource);
      mockDataSource.generate.mockResolvedValue("route content");
    });

    it("should generate content with route context", async () => {
      const additionalContext = { siteTitle: "My Site" };

      const result = await contentService.generateWithRoute(
        mockRoute,
        mockSection,
        mockProgress,
        additionalContext,
      );

      expect(mockDependencies.dataSourceRegistry.get).toHaveBeenCalledWith(
        "shell:ai-content",
      );
      expect(mockDataSource.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          templateName: "dashboard",
          conversationId: "system",
          data: expect.objectContaining({
            routeId: "test-route",
            siteTitle: "My Site",
          }),
        }),
        mockTemplate.schema,
      );
      expect(result).toBe("formatted: route content");
    });

    it("should handle templates with namespace prefix", async () => {
      const sectionWithNamespace: SectionDefinition = {
        id: "test-section",
        template: "custom-plugin:dashboard",
      };

      templateRegistry.register("custom-plugin:dashboard", mockTemplate);

      await contentService.generateWithRoute(
        mockRoute,
        sectionWithNamespace,
        mockProgress,
      );

      expect(mockDataSource.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          templateName: "custom-plugin:dashboard",
        }),
        mockTemplate.schema,
      );
    });

    it("should throw error when section has no template", async () => {
      const sectionWithoutTemplate: SectionDefinition = {
        id: "test-section",
      };

      expect(
        contentService.generateWithRoute(
          mockRoute,
          sectionWithoutTemplate,
          mockProgress,
        ),
      ).rejects.toThrow("No template specified for section test-section");
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
