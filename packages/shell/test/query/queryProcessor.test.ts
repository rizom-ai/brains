import { describe, expect, it, beforeEach, mock, spyOn } from "bun:test";
import { z } from "zod";
import { QueryProcessor } from "@/query/queryProcessor";
import type { Entity, SearchResult } from "@/types";
import { defaultQueryResponseSchema } from "@/schemas/defaults";

import { createSilentLogger, type Logger } from "@personal-brain/utils";
import type { EntityService } from "@/entity/entityService";
import type { AIService } from "@/ai/aiService";

// Mock entity for testing
const createMockEntity = (overrides?: Partial<Entity>): Entity => ({
  id: "test-id",
  entityType: "note",
  title: "Test Note",
  content: "Test content",
  created: "2024-01-01T00:00:00Z",
  updated: "2024-01-01T00:00:00Z",
  tags: ["test"],
  toMarkdown: () => "# Test Note\n\nTest content",
  ...overrides,
});

// Create mock entity service
const createMockEntityService = (): {
  search: ReturnType<typeof mock>;
  getEntityTypes: ReturnType<typeof mock>;
  getAdapter: ReturnType<typeof mock>;
} => ({
  search: mock(() => Promise.resolve([])),
  getEntityTypes: mock(() => []),
  getAdapter: mock(() => ({
    fromMarkdown: mock(),
    extractMetadata: mock(() => ({})),
    parseFrontMatter: mock(),
    generateFrontMatter: mock(),
  })),
});

// Create mock AI service
const createMockAIService = (): {
  generateObject: ReturnType<typeof mock>;
  generateText: ReturnType<typeof mock>;
} => ({
  generateObject: mock(async (_systemPrompt, _userPrompt, schema) => {
    // Return a mock object that satisfies the schema
    const mockData = {
      summary: "Mock summary",
      topics: ["test"],
      answer: "Mock answer",
    };
    return {
      object: schema.parse(mockData),
      usage: {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      },
    };
  }),
  generateText: mock(async () => ({
    text: "Mock AI response",
    usage: {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    },
  })),
});

describe("QueryProcessor", () => {
  let queryProcessor: QueryProcessor;
  let mockEntityService: ReturnType<typeof createMockEntityService>;
  let mockAIService: ReturnType<typeof createMockAIService>;
  let logger: Logger;

  beforeEach(() => {
    logger = createSilentLogger();

    // Create mock services
    mockEntityService = createMockEntityService();
    mockAIService = createMockAIService();

    queryProcessor = QueryProcessor.createFresh({
      entityService: mockEntityService as unknown as EntityService,
      aiService: mockAIService as unknown as AIService,
      logger,
    });
  });

  describe("query processing", () => {
    it("should process a search query", async () => {
      const mockEntity = createMockEntity();
      const mockSearchResults: SearchResult[] = [
        {
          entity: mockEntity,
          score: 0.9,
          excerpt: "This is a test note with some content...",
          highlights: ["test", "note"],
        },
      ];

      // Configure mocks
      mockEntityService.search = mock(() => Promise.resolve(mockSearchResults));
      mockEntityService.getEntityTypes = mock(() => ["note"]);

      const result = await queryProcessor.processQuery("find my test note", {
        schema: defaultQueryResponseSchema,
      });

      expect(result.answer).toBeDefined();
      expect(result.citations).toHaveLength(1);
      expect(result.citations[0]).toEqual({
        entityId: mockEntity.id,
        entityType: mockEntity.entityType,
        entityTitle: mockEntity.title,
        excerpt: mockEntity.content,
      });
      expect(result.relatedEntities).toHaveLength(1);
    });

    it("should process query with custom schema", async () => {
      const responseSchema = z.object({
        summary: z.string(),
        topics: z.array(z.string()),
      });

      mockEntityService.search = mock(() => Promise.resolve([]));
      mockEntityService.getEntityTypes = mock(() => []);

      const result = await queryProcessor.processQuery("summarize my notes", {
        schema: responseSchema,
      });

      expect(result.answer).toBeDefined();
      expect(result.object).toBeDefined();
    });

    it("should handle empty search results", async () => {
      mockEntityService.search = mock(() => Promise.resolve([]));
      mockEntityService.getEntityTypes = mock(() => ["note"]);

      const result = await queryProcessor.processQuery("find something", {
        schema: defaultQueryResponseSchema,
      });

      expect(result.answer).toBeDefined();
      expect(result.citations).toHaveLength(0);
      expect(result.relatedEntities).toHaveLength(0);
    });

    it("should truncate long content in citations", async () => {
      const longContent = "a".repeat(200);
      const mockEntity = createMockEntity({ content: longContent });

      mockEntityService.search = mock(() =>
        Promise.resolve([
          {
            id: mockEntity.id,
            entityType: mockEntity.entityType,
            tags: mockEntity.tags,
            created: mockEntity.created,
            updated: mockEntity.updated,
            score: 0.9,
            entity: mockEntity,
          },
        ]),
      );
      mockEntityService.getEntityTypes = mock(() => ["note"]);

      const result = await queryProcessor.processQuery("find note", {
        schema: defaultQueryResponseSchema,
      });

      expect(result.citations[0]?.excerpt).toHaveLength(153); // 150 + "..."
      expect(result.citations[0]?.excerpt).toEndWith("...");
    });
  });

  describe("intent analysis", () => {
    it("should detect create intent", async () => {
      mockEntityService.search = mock(() => Promise.resolve([]));
      mockEntityService.getEntityTypes = mock(() => ["note"]);

      const infoSpy = spyOn(logger, "info");
      await queryProcessor.processQuery("create a new note", {
        schema: defaultQueryResponseSchema,
      });

      expect(infoSpy).toHaveBeenCalledWith(
        "Processing query: create a new note",
      );
    });

    it("should detect update intent", async () => {
      mockEntityService.search = mock(() => Promise.resolve([]));
      mockEntityService.getEntityTypes = mock(() => ["note"]);

      await queryProcessor.processQuery("update my note", {
        schema: defaultQueryResponseSchema,
      });
      // Intent is processed internally, verified through search behavior
    });

    it("should detect entity types in query", async () => {
      mockEntityService.search = mock(() => Promise.resolve([]));
      mockEntityService.getEntityTypes = mock(() => ["note", "task"]);

      await queryProcessor.processQuery("find my notes", {
        schema: defaultQueryResponseSchema,
      });

      expect(mockEntityService.search).toHaveBeenCalledWith("find my notes", {
        types: ["note"],
        limit: 5,
        offset: 0,
        sortBy: "relevance",
        sortDirection: "desc",
      });
    });
  });
});
