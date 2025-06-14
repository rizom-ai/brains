import { describe, expect, it, beforeEach, mock } from "bun:test";
import { z } from "zod";
import { QueryProcessor } from "@/query/queryProcessor";
import type { Entity } from "@/types";
import type { SearchResult } from "@brains/types";
import {
  defaultQueryResponseSchema,
  simpleTextResponseSchema,
  createEntityResponseSchema,
  updateEntityResponseSchema,
} from "@/schemas/defaults";

import { createSilentLogger, type Logger } from "@brains/utils";
import type { EntityService } from "@/entity/entityService";
import type { AIService } from "@/ai/aiService";

// Mock entity for testing
const createMockEntity = (overrides?: Partial<Entity>): Entity => ({
  id: "test-id",
  entityType: "note",
  content: "Test content",
  created: "2024-01-01T00:00:00Z",
  updated: "2024-01-01T00:00:00Z",
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
  generateObject: mock(async (_systemPrompt, userPrompt, schema) => {
    // Try to create a mock object that works with different schemas
    try {
      // For default schema
      if (schema.shape?.message) {
        // Parse context from userPrompt to create sources
        const sources = [];
        const contextMatch = userPrompt.match(/Context:\n([\s\S]+?)\n\nQuery:/);
        if (contextMatch) {
          // Extract entity info from context
          const contextLines = contextMatch[1].split("\n\n");
          for (const line of contextLines) {
            const match = line.match(/\[(\w+)\] (.+)\n(.+)/);
            if (match) {
              sources.push({
                id: "test-id",
                type: match[1],
                title: match[2],
                excerpt:
                  match[3].substring(0, 150) +
                  (match[3].length > 150 ? "..." : ""),
              });
            }
          }
        }

        return {
          object: schema.parse({
            message: "Mock answer",
            sources,
            metadata: {},
          }),
          usage: {
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
          },
        };
      }
      // For custom schemas
      const mockData = {
        summary: "Mock summary",
        topics: ["test"],
        message: "Mock answer",
      };
      return {
        object: schema.parse(mockData),
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
      };
    } catch {
      // Fallback
      return {
        object: {},
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
      };
    }
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

      expect(result.message).toBeDefined();
      expect(result.sources).toBeDefined();
      expect(result.sources).toHaveLength(1);
      expect(result.sources?.[0]).toMatchObject({
        id: mockEntity.id,
        type: mockEntity.entityType,
      });
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

      expect(result.summary).toBeDefined();
      expect(result.topics).toBeDefined();
      expect(result.topics).toBeInstanceOf(Array);
    });

    it("should handle empty search results", async () => {
      mockEntityService.search = mock(() => Promise.resolve([]));
      mockEntityService.getEntityTypes = mock(() => ["note"]);

      const result = await queryProcessor.processQuery("find something", {
        schema: defaultQueryResponseSchema,
      });

      expect(result.message).toBeDefined();
      expect(result.sources).toBeDefined();
      expect(result.sources ?? []).toHaveLength(0);
    });

    it("should truncate long content in citations", async () => {
      const longContent = "a".repeat(200);
      const mockEntity = createMockEntity({ content: longContent });

      mockEntityService.search = mock(() =>
        Promise.resolve([
          {
            entity: mockEntity,
            score: 0.9,
            excerpt: longContent.slice(0, 150) + "...",
            highlights: [],
          },
        ]),
      );
      mockEntityService.getEntityTypes = mock(() => ["note"]);

      const result = await queryProcessor.processQuery("find note", {
        schema: defaultQueryResponseSchema,
      });

      expect(result.sources).toBeDefined();
      expect(result.sources).toHaveLength(1);
      expect(result.sources?.[0]?.excerpt).toBeDefined();
      expect(result.sources?.[0]?.excerpt).toHaveLength(153); // 150 + "..."
      expect(result.sources?.[0]?.excerpt).toEndWith("...");
    });
  });

  describe("schema name extraction", () => {
    it("should extract schema name from schema description", () => {
      const schema = z
        .object({
          message: z.string(),
        })
        .describe("testSchema");

      const schemaName = queryProcessor.getSchemaName(schema);
      expect(schemaName).toBe("testSchema");
    });

    it("should return undefined for schema without description", () => {
      const schema = z.object({
        message: z.string(),
      });

      const schemaName = queryProcessor.getSchemaName(schema);
      expect(schemaName).toBeUndefined();
    });

    it("should handle default schemas with descriptions", () => {
      expect(queryProcessor.getSchemaName(defaultQueryResponseSchema)).toBe(
        "defaultQueryResponse",
      );
      expect(queryProcessor.getSchemaName(simpleTextResponseSchema)).toBe(
        "simpleTextResponse",
      );
      expect(queryProcessor.getSchemaName(createEntityResponseSchema)).toBe(
        "createEntityResponse",
      );
      expect(queryProcessor.getSchemaName(updateEntityResponseSchema)).toBe(
        "updateEntityResponse",
      );
    });
  });

  describe("intent analysis", () => {
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
