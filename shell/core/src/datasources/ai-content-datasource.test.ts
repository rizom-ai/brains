import { describe, it, expect, beforeEach, mock } from "bun:test";
import { AIContentDataSource } from "./ai-content-datasource";
import type { IAIService } from "@brains/ai-service";
import type { IConversationService } from "@brains/conversation-service";
import type { EntityService } from "@brains/entity-service";
import type { TemplateRegistry } from "@brains/templates";
import { createSilentLogger } from "@brains/utils";
import { z } from "zod";

// Mock dependencies
const generateObjectMock = mock();
const getMessagesMock = mock();
const searchMock = mock();
const getTemplateMock = mock();

const mockAIService = {
  generateObject: generateObjectMock,
} as unknown as IAIService;

const mockConversationService = {
  getMessages: getMessagesMock,
} as unknown as IConversationService;

const mockEntityService = {
  search: searchMock,
} as unknown as EntityService;

const mockTemplateRegistry = {
  get: getTemplateMock,
} as unknown as TemplateRegistry;

const logger = createSilentLogger();

describe("AIContentDataSource", () => {
  let dataSource: AIContentDataSource;

  beforeEach(() => {
    generateObjectMock.mockReset();
    getMessagesMock.mockReset();
    searchMock.mockReset();
    getTemplateMock.mockReset();
    
    dataSource = new AIContentDataSource(
      mockAIService,
      mockConversationService,
      mockEntityService,
      mockTemplateRegistry,
      logger
    );
  });

  describe("metadata", () => {
    it("should have correct metadata", () => {
      expect(dataSource.id).toBe("ai-content");
      expect(dataSource.name).toBe("AI Content Generator");
      expect(dataSource.description).toBe("Generates content using AI based on templates and prompts");
    });
  });

  describe("generate", () => {
    const testSchema = z.object({ result: z.string() });

    it("should throw error if templateName is missing", async () => {
      const request = {};

      await expect(dataSource.generate(request, testSchema)).rejects.toThrow(
        "Required"
      );
    });

    it("should throw error if template is not found", async () => {
      const request = {
        templateName: "non-existent-template"
      };

      getTemplateMock.mockReturnValue(null);

      await expect(dataSource.generate(request, testSchema)).rejects.toThrow(
        "Template not found: non-existent-template"
      );
    });

    it("should throw error if template has no basePrompt", async () => {
      const request = {
        templateName: "test-template"
      };

      const template = {
        name: "test-template",
        description: "Test template",
        // no basePrompt
      };

      getTemplateMock.mockReturnValue(template);

      await expect(dataSource.generate(request, testSchema)).rejects.toThrow(
        "Template test-template must have basePrompt for content generation"
      );
    });

    it("should generate content using generateObject", async () => {
      const request = {
        templateName: "test-template",
        prompt: "Generate a summary",
        data: { topic: "AI" }
      };

      const schema = z.object({
        content: z.string(),
      });

      const template = {
        name: "test-template",
        basePrompt: "Generate content about:",
        schema: schema
      };

      const mockEntities = [
        {
          entity: { entityType: "note", id: "note-1" },
          excerpt: "AI is transformative"
        }
      ];

      const mockAIResponse = {
        object: { content: "Generated AI content about the topic" }
      };

      getTemplateMock.mockReturnValue(template);
      searchMock.mockResolvedValue(mockEntities);
      generateObjectMock.mockResolvedValue(mockAIResponse);

      const result = await dataSource.generate(request, schema);

      expect(getTemplateMock).toHaveBeenCalledWith("test-template");
      expect(searchMock).toHaveBeenCalledWith(
        "Generate content about: Generate a summary",
        { limit: 5 }
      );
      expect(result).toEqual({ content: "Generated AI content about the topic" });
    });

    it("should generate structured content for templates with schema", async () => {
      const request = {
        templateName: "structured-template",
        conversationId: "conv-123"
      };

      const schema = z.object({
        title: z.string(),
        content: z.string(),
      });

      const template = {
        name: "structured-template",
        basePrompt: "Generate structured content:",
        schema: schema
      };

      const mockStructuredResponse = {
        object: {
          title: "Generated Title",
          content: "Generated content"
        }
      };

      getTemplateMock.mockReturnValue(template);
      searchMock.mockResolvedValue([]);
      generateObjectMock.mockResolvedValue(mockStructuredResponse);

      const result = await dataSource.generate(request, schema);

      expect(generateObjectMock).toHaveBeenCalledWith(
        "Generate structured content:",
        expect.stringContaining("Generate structured content:"),
        schema
      );
      expect(result).toEqual({
        title: "Generated Title",
        content: "Generated content"
      });
    });
  });
});