import { describe, it, expect, beforeEach, mock } from "bun:test";
import { z } from "zod";
import { ContentGenerator } from "../src/content-generator";
import type {
  ContentGeneratorDependencies,
  ProgressInfo,
} from "../src/content-generator";
import type {
  ContentTemplate,
  RouteDefinition,
  SectionDefinition,
} from "@brains/types";
import { createSilentLogger } from "@brains/utils";

describe("ContentGenerator", () => {
  let mockDependencies: ContentGeneratorDependencies;
  let contentGenerator: ContentGenerator;

  beforeEach(() => {
    // Reset singleton before each test
    ContentGenerator.resetInstance();

    const mockLogger = createSilentLogger();

    mockDependencies = {
      generateWithTemplate: mock(),
      getTemplate: mock(),
      listRoutes: mock(),
      logger: mockLogger,
    };

    contentGenerator = ContentGenerator.createFresh(mockDependencies);
  });

  describe("singleton pattern", () => {
    it("should return the same instance when called multiple times", () => {
      const instance1 = ContentGenerator.getInstance(mockDependencies);
      const instance2 = ContentGenerator.getInstance(mockDependencies);
      expect(instance1).toBe(instance2);
    });

    it("should create fresh instances independently", () => {
      const fresh1 = ContentGenerator.createFresh(mockDependencies);
      const fresh2 = ContentGenerator.createFresh(mockDependencies);
      expect(fresh1).not.toBe(fresh2);
    });

    it("should reset instance correctly", () => {
      const instance1 = ContentGenerator.getInstance(mockDependencies);
      ContentGenerator.resetInstance();
      const instance2 = ContentGenerator.getInstance(mockDependencies);
      expect(instance1).not.toBe(instance2);
    });
  });

  describe("generateContent", () => {
    const mockTemplate: ContentTemplate = {
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
      mockDependencies.getTemplate.mockReturnValue(mockTemplate);
      mockDependencies.generateWithTemplate.mockResolvedValue("raw content");
    });

    it("should generate content successfully", async () => {
      const result = await contentGenerator.generateContent("test-template");

      expect(mockDependencies.getTemplate).toHaveBeenCalledWith("test-template");
      expect(mockDependencies.generateWithTemplate).toHaveBeenCalledWith(
        mockTemplate,
        {
          prompt: "Generate test content",
          data: undefined,
        },
      );
      expect(mockTemplate.formatter?.format).toHaveBeenCalledWith("raw content");
      expect(result).toBe("formatted: raw content");
    });

    it("should combine template prompt with additional prompt", async () => {
      await contentGenerator.generateContent("test-template", {
        prompt: "Additional instructions",
      });

      expect(mockDependencies.generateWithTemplate).toHaveBeenCalledWith(
        mockTemplate,
        {
          prompt: "Generate test content\n\nAdditional instructions: Additional instructions",
          data: undefined,
        },
      );
    });

    it("should pass context data correctly", async () => {
      const contextData = { key: "value" };
      await contentGenerator.generateContent("test-template", {
        data: contextData,
      });

      expect(mockDependencies.generateWithTemplate).toHaveBeenCalledWith(
        mockTemplate,
        {
          prompt: "Generate test content",
          data: contextData,
        },
      );
    });

    it("should handle templates without formatters", async () => {
      const templateWithoutFormatter: ContentTemplate = {
        name: "test-template-no-formatter",
        description: "Test template without formatter",
        basePrompt: "Generate test content",
        schema: z.string(),
      };
      mockDependencies.getTemplate.mockReturnValue(templateWithoutFormatter);
      mockDependencies.generateWithTemplate.mockResolvedValue("string content");

      const result = await contentGenerator.generateContent("test-template");

      expect(result).toBe("string content");
    });

    it("should stringify non-string content when no formatter", async () => {
      const templateWithoutFormatter: ContentTemplate = {
        name: "test-template-object",
        description: "Test template for object content",
        basePrompt: "Generate test content",
        schema: z.object({ data: z.string() }),
      };
      mockDependencies.getTemplate.mockReturnValue(templateWithoutFormatter);
      mockDependencies.generateWithTemplate.mockResolvedValue({ data: "object" });

      const result = await contentGenerator.generateContent("test-template");

      expect(result).toBe('{"data":"object"}');
    });

    it("should throw error when template not found", async () => {
      mockDependencies.getTemplate.mockReturnValue(null);

      expect(
        contentGenerator.generateContent("non-existent-template"),
      ).rejects.toThrow("Template not found: non-existent-template");
    });
  });

  describe("generateWithRoute", () => {
    const mockTemplate: ContentTemplate = {
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
      mockDependencies.getTemplate.mockReturnValue(mockTemplate);
      mockDependencies.generateWithTemplate.mockResolvedValue("route content");
    });

    it("should generate content with route context", async () => {
      const additionalContext = { siteTitle: "My Site" };

      const result = await contentGenerator.generateWithRoute(
        mockRoute,
        mockSection,
        mockProgress,
        additionalContext,
      );

      expect(mockDependencies.getTemplate).toHaveBeenCalledWith("site-builder:dashboard");
      expect(mockDependencies.generateWithTemplate).toHaveBeenCalledWith(
        mockTemplate,
        {
          prompt: "Generate route content",
          data: {
            pageTitle: "Test Route",
            pageDescription: "Test route description",
            sectionId: "test-section",
            progressInfo: {
              currentSection: 1,
              totalSections: 5,
              processingStage: "Processing...",
            },
            siteTitle: "My Site",
          },
        },
      );
      expect(result).toBe("formatted: route content");
    });

    it("should handle templates with namespace prefix", async () => {
      const sectionWithNamespace: SectionDefinition = {
        id: "test-section",
        template: "custom-plugin:dashboard",
      };

      await contentGenerator.generateWithRoute(
        mockRoute,
        sectionWithNamespace,
        mockProgress,
      );

      expect(mockDependencies.getTemplate).toHaveBeenCalledWith("custom-plugin:dashboard");
    });

    it("should throw error when section has no template", async () => {
      const sectionWithoutTemplate: SectionDefinition = {
        id: "test-section",
      };

      expect(
        contentGenerator.generateWithRoute(
          mockRoute,
          sectionWithoutTemplate,
          mockProgress,
        ),
      ).rejects.toThrow("No template specified for section test-section");
    });
  });

  describe("regenerateContent", () => {
    const mockTemplate: ContentTemplate = {
      name: "site-builder:dashboard",
      description: "Dashboard template for regeneration",
      basePrompt: "Regenerate content",
      schema: z.string(),
      formatter: {
        format: mock((content) => `regenerated: ${content}`),
        parse: mock(),
      },
    };

    const mockRoutes: RouteDefinition[] = [
      {
        id: "test-page",
        path: "/test",
        title: "Test Page",
        description: "Test description",
        sections: [
          {
            id: "test-section",
            template: "dashboard",
          },
        ],
      },
    ];

    const mockProgress: ProgressInfo = {
      current: 1,
      total: 3,
      message: "Regenerating...",
    };

    beforeEach(() => {
      mockDependencies.listRoutes.mockReturnValue(mockRoutes);
      mockDependencies.getTemplate.mockReturnValue(mockTemplate);
      mockDependencies.generateWithTemplate.mockResolvedValue("new content");
    });

    it("should regenerate content with 'new' mode", async () => {
      const result = await contentGenerator.regenerateContent(
        "site-content-preview",
        "test-page",
        "test-section",
        "new",
        mockProgress,
      );

      expect(mockDependencies.generateWithTemplate).toHaveBeenCalledWith(
        mockTemplate,
        {
          prompt: "Regenerate content\n\nAdditional instructions: Regenerate content",
          data: {
            pageTitle: "test-page",
            sectionId: "test-section",
            regenerationMode: "new",
            progressInfo: {
              currentSection: 1,
              totalSections: 3,
              processingStage: "Regenerating...",
            },
          },
        },
      );

      expect(result).toEqual({
        entityId: "site-content-preview:test-page:test-section",
        content: "regenerated: new content",
      });
    });

    it("should include current content in 'with-current' mode", async () => {
      const currentContent = "existing content";

      await contentGenerator.regenerateContent(
        "site-content-preview",
        "test-page",
        "test-section",
        "with-current",
        mockProgress,
        currentContent,
      );

      expect(mockDependencies.generateWithTemplate).toHaveBeenCalledWith(
        mockTemplate,
        {
          prompt: "Regenerate content\n\nAdditional instructions: Regenerate content\n\nCurrent content to improve:\nexisting content",
          data: {
            pageTitle: "test-page",
            sectionId: "test-section",
            regenerationMode: "with-current",
            progressInfo: {
              currentSection: 1,
              totalSections: 3,
              processingStage: "Regenerating...",
            },
          },
        },
      );
    });

    it("should throw error when route not found", async () => {
      expect(
        contentGenerator.regenerateContent(
          "site-content-preview",
          "non-existent-page",
          "test-section",
          "new",
          mockProgress,
        ),
      ).rejects.toThrow("Template not found for page: non-existent-page, section: test-section");
    });

    it("should throw error when section not found", async () => {
      expect(
        contentGenerator.regenerateContent(
          "site-content-preview",
          "test-page",
          "non-existent-section",
          "new",
          mockProgress,
        ),
      ).rejects.toThrow("Template not found for page: test-page, section: non-existent-section");
    });

    it("should throw error when template not found", async () => {
      mockDependencies.getTemplate.mockReturnValue(null);

      expect(
        contentGenerator.regenerateContent(
          "site-content-preview",
          "test-page",
          "test-section",
          "new",
          mockProgress,
        ),
      ).rejects.toThrow("Template not found for page: test-page, section: test-section");
    });
  });
});