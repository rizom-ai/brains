import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { ContentGenerationService } from "../../src/content/contentGenerationService";
import { QueryProcessor } from "../../src/query/queryProcessor";
import { createSilentLogger } from "@brains/utils";
import { z } from "zod";
import type { EntityService } from "../../src/entity/entityService";
import type { AIService } from "../../src/ai/aiService";
import type { BaseEntity } from "@brains/types";
import type { ContentTypeRegistry } from "../../src/content/contentTypeRegistry";

describe("ContentGenerationService", () => {
  let service: ContentGenerationService;
  let mockQueryProcessor: QueryProcessor;
  let mockEntityService: EntityService;
  let mockContentTypeRegistry: ContentTypeRegistry;

  beforeEach(() => {
    // Reset singletons
    ContentGenerationService.resetInstance();
    QueryProcessor.resetInstance();

    // Create minimal mocks for what QueryProcessor needs
    mockEntityService = {
      search: mock(async () => []),
      getEntityTypes: mock(() => ["base", "generated-content"]),
      hasAdapter: mock(() => true),
      getAdapter: mock(() => ({
        fromMarkdown: mock(() => ({})),
        extractMetadata: mock(() => ({})),
      })),
      createEntity: mock(async () => ({ id: "test-id" })),
      getEntity: mock(async () => null),
      listEntities: mock(async () => []),
    } as unknown as EntityService;

    // Create mock for ContentTypeRegistry
    mockContentTypeRegistry = {
      has: mock(() => true), // Default to true since we're mocking registered types
      register: mock(() => {}),
      get: mock(() => null),
      list: mock(() => []),
      clear: mock(() => {}),
    } as unknown as ContentTypeRegistry;

    const mockAIService = {
      generateObject: mock(
        async <T>(
          _systemPrompt: string,
          userPrompt: string,
          _schema: z.ZodType<T>,
        ): Promise<{
          object: T;
          usage: {
            promptTokens: number;
            completionTokens: number;
            totalTokens: number;
          };
        }> => {
          // Mock AI response based on prompt
          let object: unknown;
          if (userPrompt.includes("hero section")) {
            object = {
              headline: "Welcome to Your Brain",
              subheadline: "Organize your knowledge",
              ctaText: "Get Started",
              ctaLink: "/dashboard",
            };
          } else if (userPrompt.includes("First")) {
            object = { message: "First response" };
          } else if (userPrompt.includes("Second")) {
            object = { message: "Second response" };
          } else if (userPrompt.includes("Process this request")) {
            object = { processed: true };
          } else if (
            userPrompt.includes("Example 1") &&
            userPrompt.includes("Example 2")
          ) {
            object = {
              title: "Generated with examples",
              content: "Based on examples",
            };
          } else if (userPrompt.includes("Generate content")) {
            // For validation test - return invalid data
            object = { title: "Hi", count: -1 };
          } else {
            object = { message: "Generated content" };
          }

          return {
            object: object as T,
            usage: {
              promptTokens: 100,
              completionTokens: 50,
              totalTokens: 150,
            },
          };
        },
      ),
    };

    // Create query processor with mocks
    mockQueryProcessor = QueryProcessor.createFresh({
      entityService: mockEntityService as unknown as EntityService,
      logger: createSilentLogger("test"),
      aiService: mockAIService as unknown as AIService,
    });

    // Get service instance
    service = ContentGenerationService.getInstance();
  });

  afterEach(() => {
    ContentGenerationService.resetInstance();
    QueryProcessor.resetInstance();
  });

  describe("Component Interface Standardization", () => {
    it("should implement singleton pattern", () => {
      const instance1 = ContentGenerationService.getInstance();
      const instance2 = ContentGenerationService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it("should reset instance", () => {
      const instance1 = ContentGenerationService.getInstance();
      ContentGenerationService.resetInstance();
      const instance2 = ContentGenerationService.getInstance();
      expect(instance1).not.toBe(instance2);
    });

    it("should create fresh instance", () => {
      const instance1 = ContentGenerationService.getInstance();
      const instance2 = ContentGenerationService.createFresh();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe("Initialization", () => {
    it("should initialize with QueryProcessor", () => {
      expect(() =>
        service.initialize(
          mockQueryProcessor,
          mockEntityService,
          mockContentTypeRegistry,
        ),
      ).not.toThrow();
    });

    it("should throw error when generating without initialization", async () => {
      const uninitializedService = ContentGenerationService.createFresh();
      const schema = z.object({ message: z.string() });

      // eslint-disable-next-line @typescript-eslint/await-thenable
      await expect(
        uninitializedService.generate({
          schema,
          prompt: "Test prompt",
          contentType: "test:content",
        }),
      ).rejects.toThrow("ContentGenerationService not initialized");
    });
  });

  describe("Content Generation", () => {
    beforeEach(() => {
      service.initialize(
        mockQueryProcessor,
        mockEntityService,
        mockContentTypeRegistry,
      );
    });

    it("should generate content with basic prompt", async () => {
      const schema = z.object({
        message: z.string(),
      });

      const result = await service.generate({
        schema,
        prompt: "Generate a welcome message",
        contentType: "test:message",
      });

      expect(result).toEqual({ message: "Generated content" });
    });

    it("should generate content with context", async () => {
      const schema = z.object({
        headline: z.string(),
        subheadline: z.string(),
        ctaText: z.string(),
        ctaLink: z.string(),
      });

      const result = await service.generate({
        schema,
        prompt: "Generate a hero section",
        contentType: "test:hero",
        context: {
          data: {
            siteTitle: "My Brain",
            siteDescription: "Knowledge management",
          },
          style: "professional",
        },
      });

      expect(result).toEqual({
        headline: "Welcome to Your Brain",
        subheadline: "Organize your knowledge",
        ctaText: "Get Started",
        ctaLink: "/dashboard",
      });
    });

    it("should pass context to QueryProcessor", async () => {
      const schema = z.object({ processed: z.boolean() });
      const testEntities: BaseEntity[] = [
        {
          id: "1",
          entityType: "note",
          content: "Test note content",
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        },
      ];

      // Verify that context is passed through to generate method
      const result = await service.generate({
        schema,
        prompt: "Process this request",
        contentType: "test:context",
        context: {
          entities: testEntities,
          data: { test: true },
          style: "formal",
        },
      });

      // The mock just needs to return a valid response
      expect(result).toBeDefined();
    });

    it("should include examples in context", async () => {
      const schema = z.object({ title: z.string(), content: z.string() });
      const examples = [
        { title: "Example 1", content: "Content 1" },
        { title: "Example 2", content: "Content 2" },
      ];

      const result = await service.generate({
        schema,
        prompt: "Generate similar content",
        contentType: "test:examples",
        context: {
          examples,
        },
      });

      expect(result.title).toBe("Generated with examples");
    });

    it("should validate generated content against schema", async () => {
      const strictSchema = z.object({
        title: z.string().min(5),
        count: z.number().positive(),
      });

      // The mock returns invalid data for "Generate content" prompt
      // which should be caught by schema validation
      expect(
        service.generate({
          schema: strictSchema,
          prompt: "Generate content",
          contentType: "test:validation",
        }),
      ).rejects.toThrow(); // Schema validation should throw ZodError
    });

    it("should build enhanced prompt with all context", () => {
      service.initialize(
        mockQueryProcessor,
        mockEntityService,
        mockContentTypeRegistry,
      );

      // Access private method via array notation
      const buildPrompt = (
        service as unknown as { buildPrompt: (options: unknown) => string }
      )["buildPrompt"].bind(service);

      const prompt = buildPrompt({
        schema: z.object({ message: z.string() }),
        prompt: "Base prompt",
        context: {
          // Note: entities are handled by QueryProcessor, not in buildPrompt
          data: { key: "value" },
          examples: [{ message: "Example message" }],
          style: "casual",
        },
      });

      expect(prompt).toContain("Base prompt");
      expect(prompt).toContain("Style guidelines: casual");
      expect(prompt).toContain("key");
      expect(prompt).toContain("value");
      expect(prompt).toContain("Example message");
    });
  });

  describe("Batch Generation", () => {
    beforeEach(() => {
      service.initialize(
        mockQueryProcessor,
        mockEntityService,
        mockContentTypeRegistry,
      );
    });

    it("should generate multiple content pieces", async () => {
      const schema = z.object({ message: z.string() });

      const results = await service.generateBatch({
        schema,
        contentType: "test:batch",
        items: [
          { prompt: "First prompt" },
          { prompt: "Second prompt", context: { key: "value" } },
        ],
      });

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ message: "First response" });
      expect(results[1]).toEqual({ message: "Second response" });
    });
  });

  describe("Template Management", () => {
    beforeEach(() => {
      service.initialize(
        mockQueryProcessor,
        mockEntityService,
        mockContentTypeRegistry,
      );
    });

    it("should register and retrieve templates", () => {
      const template = {
        name: "test-template",
        description: "Test template",
        schema: z.object({ title: z.string() }),
        basePrompt: "Generate a title",
      };

      service.registerTemplate("test-template", template);

      const retrieved = service.getTemplate("test-template");
      expect(retrieved).toBe(template);
    });

    it("should list all templates", () => {
      const template1 = {
        name: "template1",
        description: "Template 1",
        schema: z.object({ a: z.string() }),
        basePrompt: "Prompt 1",
      };

      const template2 = {
        name: "template2",
        description: "Template 2",
        schema: z.object({ b: z.string() }),
        basePrompt: "Prompt 2",
      };

      service.registerTemplate("template1", template1);
      service.registerTemplate("template2", template2);

      const templates = service.listTemplates();
      expect(templates).toHaveLength(2);
      expect(templates).toContain(template1);
      expect(templates).toContain(template2);
    });

    it("should generate content from template", async () => {
      const template = {
        name: "hero-template",
        description: "Hero section template",
        schema: z.object({
          headline: z.string(),
          subheadline: z.string(),
        }),
        basePrompt: "Generate a hero section with engaging content",
      };

      service.registerTemplate("hero-template", template);

      const result = await service.generateFromTemplate("hero-template", {
        prompt: "for a knowledge management tool",
        contentType: "test:hero",
        context: { style: "professional" },
      });

      expect(result).toBeDefined();
    });

    it("should throw error for non-existent template", async () => {
      expect(
        service.generateFromTemplate("non-existent", {
          prompt: "test",
          contentType: "test:missing",
        }),
      ).rejects.toThrow("Template not found: non-existent");
    });
  });

  describe("Error Handling", () => {
    beforeEach(() => {
      service.initialize(
        mockQueryProcessor,
        mockEntityService,
        mockContentTypeRegistry,
      );
    });

    it("should handle QueryProcessor errors gracefully", async () => {
      // Make QueryProcessor throw an error
      mockQueryProcessor.processQuery = mock(() =>
        Promise.reject(new Error("Query processing failed")),
      );

      const schema = z.object({ message: z.string() });

      expect(
        service.generate({
          schema,
          prompt: "Test prompt",
          contentType: "test:error",
        }),
      ).rejects.toThrow("Query processing failed");
    });

    it("should handle invalid JSON from AI service", async () => {
      // Create a new AI service mock that throws
      const errorAIService = {
        generateObject: mock(async () => {
          throw new Error("Invalid JSON");
        }),
      };

      // Create a new QueryProcessor with the error-throwing AI service
      const errorQueryProcessor = QueryProcessor.createFresh({
        entityService: {
          search: mock(async () => []),
          getEntityTypes: mock(() => []),
          hasAdapter: mock(() => true),
          getAdapter: mock(() => ({
            fromMarkdown: mock(() => ({})),
            extractMetadata: mock(() => ({})),
          })),
        } as unknown as EntityService,
        logger: createSilentLogger("test"),
        aiService: errorAIService as unknown as AIService,
      });

      service.initialize(
        errorQueryProcessor,
        mockEntityService,
        mockContentTypeRegistry,
      );

      const schema = z.object({ message: z.string() });

      expect(
        service.generate({
          schema,
          prompt: "Test prompt",
          contentType: "test:json-error",
        }),
      ).rejects.toThrow();
    });
  });
});
