import { describe, it, expect, beforeEach, mock } from "bun:test";
import { AIContentDataSource } from "./ai-content-datasource";
import type { IAIService } from "@brains/ai-service";
import type { EntityService } from "@brains/entity-service";
import type { TemplateRegistry } from "@brains/templates";
import { z } from "@brains/utils";

// Mock dependencies
const generateObjectMock = mock();
const searchMock = mock();
const getTemplateMock = mock();

const mockAIService = {
  generateObject: generateObjectMock,
} as unknown as IAIService;

const mockEntityService = {
  search: searchMock,
} as unknown as EntityService;

const mockTemplateRegistry = {
  get: getTemplateMock,
} as unknown as TemplateRegistry;

describe("AIContentDataSource", () => {
  let dataSource: AIContentDataSource;

  beforeEach(() => {
    generateObjectMock.mockReset();
    searchMock.mockReset();
    getTemplateMock.mockReset();

    dataSource = new AIContentDataSource(
      mockAIService,
      mockEntityService,
      mockTemplateRegistry,
    );
  });

  describe("metadata", () => {
    it("should have correct metadata", () => {
      expect(dataSource.id).toBe("ai-content");
      expect(dataSource.name).toBe("AI Content Generator");
      expect(dataSource.description).toBe(
        "Generates content using AI based on templates and prompts",
      );
    });
  });

  describe("generate", () => {
    const testSchema = z.object({ result: z.string() });

    it("should throw error if templateName is missing", async () => {
      const request = {};

      expect(dataSource.generate(request, testSchema)).rejects.toThrow(
        "Required",
      );
    });

    it("should throw error if template is not found", async () => {
      const request = {
        templateName: "non-existent-template",
      };

      getTemplateMock.mockReturnValue(null);

      expect(dataSource.generate(request, testSchema)).rejects.toThrow(
        "Template not found: non-existent-template",
      );
    });

    it("should throw error if template has no basePrompt", async () => {
      const request = {
        templateName: "test-template",
      };

      const template = {
        name: "test-template",
        description: "Test template",
        // no basePrompt
      };

      getTemplateMock.mockReturnValue(template);

      expect(dataSource.generate(request, testSchema)).rejects.toThrow(
        "Template test-template must have basePrompt for content generation",
      );
    });

    it("should generate content using generateObject", async () => {
      const request = {
        templateName: "test-template",
        prompt: "Generate a summary",
        data: { topic: "AI" },
      };

      const schema = z.object({
        content: z.string(),
      });

      const template = {
        name: "test-template",
        basePrompt: "Generate content about:",
        schema: schema,
      };

      const mockEntities = [
        {
          entity: { entityType: "note", id: "note-1" },
          excerpt: "AI is transformative",
        },
      ];

      const mockAIResponse = {
        object: { content: "Generated AI content about the topic" },
      };

      getTemplateMock.mockReturnValue(template);
      searchMock.mockResolvedValue(mockEntities);
      generateObjectMock.mockResolvedValue(mockAIResponse);

      const result = await dataSource.generate(request, schema);

      expect(getTemplateMock).toHaveBeenCalledWith("test-template");
      expect(searchMock).toHaveBeenCalledWith(
        "Generate content about: Generate a summary",
        { limit: 5 },
      );
      expect(result).toEqual({
        content: "Generated AI content about the topic",
      });
    });

    it("should generate structured content for templates with schema", async () => {
      const request = {
        templateName: "structured-template",
      };

      const schema = z.object({
        title: z.string(),
        content: z.string(),
      });

      const template = {
        name: "structured-template",
        basePrompt: "Generate structured content:",
        schema: schema,
      };

      const mockStructuredResponse = {
        object: {
          title: "Generated Title",
          content: "Generated content",
        },
      };

      getTemplateMock.mockReturnValue(template);
      searchMock.mockResolvedValue([]);
      generateObjectMock.mockResolvedValue(mockStructuredResponse);

      const result = await dataSource.generate(request, schema);

      expect(generateObjectMock).toHaveBeenCalledWith(
        "Generate structured content:",
        expect.stringContaining("Generate structured content:"),
        schema,
      );
      expect(result).toEqual({
        title: "Generated Title",
        content: "Generated content",
      });
    });

    it("should use conversation history if provided in context", async () => {
      const request = {
        templateName: "test-template",
        conversationHistory: "User: Hello\n\nAssistant: Hi there!",
      };

      const schema = z.object({
        content: z.string(),
      });

      const template = {
        name: "test-template",
        basePrompt: "Generate a response:",
        schema: schema,
      };

      const mockAIResponse = {
        object: { content: "Response with context" },
      };

      getTemplateMock.mockReturnValue(template);
      searchMock.mockResolvedValue([]);
      generateObjectMock.mockResolvedValue(mockAIResponse);

      await dataSource.generate(request, schema);

      // Verify the conversation history was included in the prompt
      expect(generateObjectMock).toHaveBeenCalledWith(
        "Generate a response:",
        expect.stringContaining("User: Hello\n\nAssistant: Hi there!"),
        schema,
      );
    });
  });
});
