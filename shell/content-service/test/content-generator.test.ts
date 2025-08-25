import { describe, it, expect, beforeEach, mock } from "bun:test";
import { z } from "zod";
import { ContentService } from "../src/content-service";
import type {
  ContentServiceDependencies,
  ProgressInfo,
} from "../src/content-service";
import { TemplateRegistry, type Template } from "@brains/templates";
import type { RouteDefinition, SectionDefinition } from "@brains/view-registry";
import type { EntityService } from "@brains/entity-service";
import type { AIService } from "@brains/ai-service";
import type { IConversationService } from "@brains/conversation-service";
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

    const mockConversationService = {
      startConversation: mock(),
      addMessage: mock(),
      getMessages: mockGetMessages,
      getConversation: mock(),
      searchConversations: mock(),
    };

    // Create a fresh TemplateRegistry for each test
    templateRegistry = TemplateRegistry.createFresh(mockLogger);

    mockDependencies = {
      logger: mockLogger,
      entityService: mockEntityService as EntityService,
      aiService: mockAIService as AIService,
      conversationService: mockConversationService as IConversationService,
      templateRegistry,
    };

    contentService = new ContentService(mockDependencies);
  });

  describe("generateContent", () => {
    const mockTemplate: Template = {
      name: "test-template",
      description: "Test template for content generation",
      basePrompt: "Generate test content",
      schema: z.string(),
      formatter: {
        format: mock((content) => `formatted: ${content}`),
        parse: mock(),
      },
    };

    beforeEach(() => {
      // Register the mock template with the registry
      templateRegistry.register("test-template", mockTemplate);
      mockAIGenerateObject.mockResolvedValue({ object: "raw content" });
    });

    it("should generate content successfully", async () => {
      const result = await contentService.generateContent("test-template");

      expect(mockAIGenerateObject).toHaveBeenCalledWith(
        "Generate test content",
        "Generate test content",
        mockTemplate.schema,
      );
      expect(result).toBe("raw content");
    });

    it("should include conversation context when conversationId is provided", async () => {
      mockDependencies.conversationService.getMessages = mock(() =>
        Promise.resolve([
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi there!" },
        ]),
      );

      await contentService.generateContent("test-template", {
        conversationId: "test-conversation-123",
      });

      expect(
        mockDependencies.conversationService.getMessages,
      ).toHaveBeenCalledWith("test-conversation-123", { limit: 20 });
      expect(mockAIGenerateObject).toHaveBeenCalledWith(
        "Generate test content",
        expect.stringContaining(
          "Recent conversation context:\nUser: Hello\n\nAssistant: Hi there!",
        ),
        mockTemplate.schema,
      );
    });

    it("should handle missing conversation context gracefully", async () => {
      mockDependencies.conversationService.getMessages = mock(() =>
        Promise.reject(new Error("Conversation not found")),
      );

      const result = await contentService.generateContent("test-template", {
        conversationId: "non-existent-conversation",
      });

      // Should still generate content without conversation context
      expect(
        mockDependencies.conversationService.getMessages,
      ).toHaveBeenCalledWith("non-existent-conversation", { limit: 20 });
      expect(mockAIGenerateObject).toHaveBeenCalledWith(
        "Generate test content",
        "Generate test content", // No conversation context added
        mockTemplate.schema,
      );
      expect(result).toBe("raw content");
    });

    it("should combine template prompt with additional prompt", async () => {
      await contentService.generateContent("test-template", {
        prompt: "Additional instructions",
      });

      expect(mockAIGenerateObject).toHaveBeenCalledWith(
        "Generate test content",
        "Generate test content\n\nAdditional instructions: Additional instructions",
        mockTemplate.schema,
      );
    });

    it("should pass context data correctly", async () => {
      const contextData = { key: "value" };
      await contentService.generateContent("test-template", {
        data: contextData,
      });

      expect(mockAIGenerateObject).toHaveBeenCalledWith(
        "Generate test content",
        expect.stringContaining("Generate test content"),
        mockTemplate.schema,
      );

      // Verify the enhanced prompt includes the context data
      const actualCall = mockAIGenerateObject.mock.calls[0];
      const enhancedPrompt = actualCall[1] as string;
      expect(enhancedPrompt).toContain("Context data:");
      expect(enhancedPrompt).toContain('"key": "value"');
    });

    it("should handle templates without formatters", async () => {
      const templateWithoutFormatter: Template = {
        name: "test-template-no-formatter",
        description: "Test template without formatter",
        basePrompt: "Generate test content",
        schema: z.string(),
      };
      templateRegistry.register(
        "test-template-no-formatter",
        templateWithoutFormatter,
      );
      mockAIGenerateObject.mockResolvedValue({ object: "string content" });

      const result = await contentService.generateContent(
        "test-template-no-formatter",
      );

      expect(result).toBe("string content");
    });

    it("should handle object content from AI service", async () => {
      const templateWithSchema: Template = {
        name: "test-template-object",
        description: "Test template for object content",
        basePrompt: "Generate test content",
        schema: z.object({ data: z.string() }),
      };
      templateRegistry.register(
        "test-template-object",
        templateWithSchema,
      );
      mockAIGenerateObject.mockResolvedValue({
        object: { data: "object" },
      });

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
      schema: z.string(),
      formatter: {
        format: mock((content) => `formatted: ${content}`),
        parse: mock(),
      },
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
      mockAIGenerateObject.mockResolvedValue({ object: "route content" });
    });

    it("should generate content with route context", async () => {
      const additionalContext = { siteTitle: "My Site" };

      const result = await contentService.generateWithRoute(
        mockRoute,
        mockSection,
        mockProgress,
        additionalContext,
      );

      expect(mockAIGenerateObject).toHaveBeenCalledWith(
        "Generate route content",
        expect.stringContaining("Generate route content"),
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

      expect(mockAIGenerateObject).toHaveBeenCalledWith(
        "Generate route content",
        expect.stringContaining("Generate route content"),
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
