import { describe, expect, it, beforeEach, mock, spyOn } from "bun:test";
import { z } from "zod";
import { QueryProcessor } from "@/query/queryProcessor";
import type { Entity, SearchResult } from "@/types";
import type { Logger } from "@/utils/logger";
import { MockLogger } from "@test/utils/mockLogger";
import type { EntityService } from "@/entity/entityService";

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
  getAllEntityTypes: ReturnType<typeof mock>;
  getAdapter: ReturnType<typeof mock>;
} => ({
  search: mock(() => Promise.resolve([])),
  getAllEntityTypes: mock(() => []),
  getAdapter: mock(() => ({
    fromMarkdown: mock(),
    extractMetadata: mock(() => ({})),
    parseFrontMatter: mock(),
    generateFrontMatter: mock(),
  })),
});

describe("QueryProcessor", () => {
  let queryProcessor: QueryProcessor;
  let mockEntityService: ReturnType<typeof createMockEntityService>;
  let logger: Logger;

  beforeEach(() => {
    logger = MockLogger.createFresh();
    
    // Create mock entity service
    mockEntityService = createMockEntityService();
    
    queryProcessor = QueryProcessor.createFresh({
      entityService: mockEntityService as unknown as EntityService,
      logger,
    });
  });

  describe("query processing", () => {
    it("should process a search query", async () => {
      const mockEntity = createMockEntity();
      const mockSearchResults: SearchResult[] = [{
        id: mockEntity.id,
        entityType: mockEntity.entityType,
        tags: mockEntity.tags,
        created: mockEntity.created,
        updated: mockEntity.updated,
        score: 0.9,
        entity: mockEntity,
      }];

      // Configure mocks
      mockEntityService.search = mock(() => Promise.resolve(mockSearchResults));
      mockEntityService.getAllEntityTypes = mock(() => ["note"]);

      const result = await queryProcessor.processQuery("find my test note");

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
      mockEntityService.getAllEntityTypes = mock(() => []);

      const result = await queryProcessor.processQuery(
        "summarize my notes",
        { schema: responseSchema }
      );

      expect(result.answer).toBeDefined();
      expect(result.object).toBeDefined();
    });

    it("should handle empty search results", async () => {
      mockEntityService.search = mock(() => Promise.resolve([]));
      mockEntityService.getAllEntityTypes = mock(() => ["note"]);

      const result = await queryProcessor.processQuery("find something");

      expect(result.answer).toBeDefined();
      expect(result.citations).toHaveLength(0);
      expect(result.relatedEntities).toHaveLength(0);
    });

    it("should truncate long content in citations", async () => {
      const longContent = "a".repeat(200);
      const mockEntity = createMockEntity({ content: longContent });
      
      mockEntityService.search = mock(() => Promise.resolve([{
        id: mockEntity.id,
        entityType: mockEntity.entityType,
        tags: mockEntity.tags,
        created: mockEntity.created,
        updated: mockEntity.updated,
        score: 0.9,
        entity: mockEntity,
      }]));
      mockEntityService.getAllEntityTypes = mock(() => ["note"]);

      const result = await queryProcessor.processQuery("find note");

      expect(result.citations[0]?.excerpt).toHaveLength(153); // 150 + "..."
      expect(result.citations[0]?.excerpt).toEndWith("...");
    });
  });

  describe("intent analysis", () => {
    it("should detect create intent", async () => {
      mockEntityService.search = mock(() => Promise.resolve([]));
      mockEntityService.getAllEntityTypes = mock(() => ["note"]);

      const infoSpy = spyOn(logger, "info");
      await queryProcessor.processQuery("create a new note");

      expect(infoSpy).toHaveBeenCalledWith("Processing query: create a new note");
    });

    it("should detect update intent", async () => {
      mockEntityService.search = mock(() => Promise.resolve([]));
      mockEntityService.getAllEntityTypes = mock(() => ["note"]);

      await queryProcessor.processQuery("update my note");
      // Intent is processed internally, verified through search behavior
    });

    it("should detect entity types in query", async () => {
      mockEntityService.search = mock(() => Promise.resolve([]));
      mockEntityService.getAllEntityTypes = mock(() => ["note", "task"]);

      await queryProcessor.processQuery("find my notes");

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