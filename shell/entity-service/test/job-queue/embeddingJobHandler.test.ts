import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { EmbeddingJobHandler } from "../../src/job-queue/handlers/embeddingJobHandler";
import { ErrorUtils } from "@brains/utils";
import type { EntityWithoutEmbedding, DrizzleDB } from "@brains/db";
import type { IEmbeddingService } from "@brains/embedding-service";

// Mock factory functions
const createMockEmbeddingService = (): IEmbeddingService => ({
  generateEmbedding: mock(() => Promise.resolve(new Float32Array(384))),
  generateEmbeddings: mock(() => Promise.resolve([new Float32Array(384)])),
});

const createMockDb = (): DrizzleDB => {
  const mockValues = mock(() => Promise.resolve());
  const mockInsert = mock(() => ({ values: mockValues }));

  return {
    insert: mockInsert,
  } as unknown as DrizzleDB;
};

describe("EmbeddingJobHandler", () => {
  let handler: EmbeddingJobHandler;
  let mockEmbeddingService: IEmbeddingService;
  let mockDb: DrizzleDB;

  // Test entity data
  const testEntity: EntityWithoutEmbedding = {
    id: "test-entity-123",
    entityType: "note",
    content: "# Test Note\n\nThis is test content for embedding generation.",
    metadata: { title: "Test Note", tags: ["test", "embedding"] },
    created: Date.now() - 86400000, // 24 hours ago
    updated: Date.now(),
    contentWeight: 0.8,
  };

  beforeEach(() => {
    // Reset all instances
    EmbeddingJobHandler.resetInstance();

    // Create fresh mocks for each test
    mockEmbeddingService = createMockEmbeddingService();
    mockDb = createMockDb();

    // Create fresh handler instance
    handler = EmbeddingJobHandler.createFresh(mockDb, mockEmbeddingService);
  });

  afterEach(() => {
    EmbeddingJobHandler.resetInstance();
  });

  describe("Singleton pattern", () => {
    it("should return the same instance when calling getInstance multiple times", () => {
      const instance1 = EmbeddingJobHandler.getInstance(
        mockDb,
        mockEmbeddingService,
      );
      const instance2 = EmbeddingJobHandler.getInstance(
        mockDb,
        mockEmbeddingService,
      );
      expect(instance1).toBe(instance2);
    });

    it("should create a fresh instance when calling createFresh", () => {
      const singleton = EmbeddingJobHandler.getInstance(
        mockDb,
        mockEmbeddingService,
      );
      const fresh = EmbeddingJobHandler.createFresh(
        mockDb,
        mockEmbeddingService,
      );
      expect(singleton).not.toBe(fresh);
    });

    it("should reset singleton when calling resetInstance", () => {
      const instance1 = EmbeddingJobHandler.getInstance(
        mockDb,
        mockEmbeddingService,
      );
      EmbeddingJobHandler.resetInstance();
      const instance2 = EmbeddingJobHandler.getInstance(
        mockDb,
        mockEmbeddingService,
      );
      expect(instance1).not.toBe(instance2);
    });
  });

  describe("validateAndParse", () => {
    it("should validate and return valid entity data", () => {
      const result = handler.validateAndParse(testEntity);

      expect(result).toEqual(testEntity);
      expect(result).not.toBeNull();
    });

    it("should return null for invalid data - missing required fields", () => {
      const invalidData = {
        id: "test-id",
        // missing entityType, content, etc.
      };

      const result = handler.validateAndParse(invalidData);
      expect(result).toBeNull();
    });

    it("should return null for invalid data - empty strings", () => {
      const invalidData = {
        ...testEntity,
        id: "", // Empty ID should fail
      };

      const result = handler.validateAndParse(invalidData);
      expect(result).toBeNull();
    });

    it("should return null for invalid data - invalid content weight", () => {
      const invalidData = {
        ...testEntity,
        contentWeight: 1.5, // Should be between 0 and 1
      };

      const result = handler.validateAndParse(invalidData);
      expect(result).toBeNull();
    });

    it("should return null for invalid data - negative timestamps", () => {
      const invalidData = {
        ...testEntity,
        created: -1, // Negative timestamp should fail
      };

      const result = handler.validateAndParse(invalidData);
      expect(result).toBeNull();
    });

    it("should use default empty metadata if not provided", () => {
      const dataWithoutMetadata = {
        ...testEntity,
        metadata: undefined,
      };

      const result = handler.validateAndParse(dataWithoutMetadata);
      expect(result?.metadata).toEqual({});
    });

    it("should return null for completely invalid data types", () => {
      const invalidData = "not an object";

      const result = handler.validateAndParse(invalidData);
      expect(result).toBeNull();
    });

    it("should return null for null/undefined input", () => {
      expect(handler.validateAndParse(null)).toBeNull();
      expect(handler.validateAndParse(undefined)).toBeNull();
    });
  });

  describe("process", () => {
    it("should successfully process embedding job", async () => {
      const jobId = "job-123";
      const mockEmbedding = new Float32Array(384);

      // Recreate service with specific return value
      mockEmbeddingService = {
        generateEmbedding: mock(() => Promise.resolve(mockEmbedding)),
        generateEmbeddings: mock(() => Promise.resolve([mockEmbedding])),
      };
      handler = EmbeddingJobHandler.createFresh(mockDb, mockEmbeddingService);

      await handler.process(testEntity, jobId);

      // Verify embedding service was called with content
      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith(
        testEntity.content,
      );
      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledTimes(1);

      // Verify database insert was called
      expect(mockDb.insert).toHaveBeenCalledTimes(1);
    });

    it("should throw error when embedding generation fails", async () => {
      const jobId = "job-123";
      const embeddingError = new Error("Embedding service failed");

      // Recreate service with error
      mockEmbeddingService = {
        generateEmbedding: mock(() => Promise.reject(embeddingError)),
        generateEmbeddings: mock(() =>
          Promise.resolve([new Float32Array(384)]),
        ),
      };
      handler = EmbeddingJobHandler.createFresh(mockDb, mockEmbeddingService);

      try {
        await handler.process(testEntity, jobId);
        expect().fail("Should have thrown an error");
      } catch (error) {
        expect(ErrorUtils.getErrorMessage(error)).toBe(
          "Embedding service failed",
        );
      }

      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledTimes(1);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it("should throw error when database insert fails", async () => {
      const jobId = "job-123";
      const mockEmbedding = new Float32Array(384);
      const insertError = new Error("Database insert failed");

      // Recreate service and db with specific behaviors
      mockEmbeddingService = {
        generateEmbedding: mock(() => Promise.resolve(mockEmbedding)),
        generateEmbeddings: mock(() => Promise.resolve([mockEmbedding])),
      };

      const mockValues = mock(() => Promise.reject(insertError));
      mockDb = {
        insert: mock(() => ({ values: mockValues })),
      } as unknown as DrizzleDB;

      handler = EmbeddingJobHandler.createFresh(mockDb, mockEmbeddingService);

      try {
        await handler.process(testEntity, jobId);
        expect().fail("Should have thrown an error");
      } catch (error) {
        expect(ErrorUtils.getErrorMessage(error)).toBe(
          "Database insert failed",
        );
      }

      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledTimes(1);
      expect(mockDb.insert).toHaveBeenCalledTimes(1);
    });

    it("should handle empty content gracefully", async () => {
      const entityWithEmptyContent = {
        ...testEntity,
        content: "",
      };
      const jobId = "job-123";
      const mockEmbedding = new Float32Array(384);

      // Recreate service with specific return value
      mockEmbeddingService = {
        generateEmbedding: mock(() => Promise.resolve(mockEmbedding)),
        generateEmbeddings: mock(() => Promise.resolve([mockEmbedding])),
      };
      handler = EmbeddingJobHandler.createFresh(mockDb, mockEmbeddingService);

      await handler.process(entityWithEmptyContent, jobId);

      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith("");
      expect(mockDb.insert).toHaveBeenCalledTimes(1);
    });

    it("should handle very long content", async () => {
      const entityWithLongContent = {
        ...testEntity,
        content: "a".repeat(10000), // Very long content
      };
      const jobId = "job-123";
      const mockEmbedding = new Float32Array(384);

      // Recreate service with specific return value
      mockEmbeddingService = {
        generateEmbedding: mock(() => Promise.resolve(mockEmbedding)),
        generateEmbeddings: mock(() => Promise.resolve([mockEmbedding])),
      };
      handler = EmbeddingJobHandler.createFresh(mockDb, mockEmbeddingService);

      await handler.process(entityWithLongContent, jobId);

      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith(
        entityWithLongContent.content,
      );
      expect(mockDb.insert).toHaveBeenCalledTimes(1);
    });
  });

  describe("onError", () => {
    it("should handle error gracefully without throwing", async () => {
      const error = new Error("Test error");
      const jobId = "job-123";

      // Should not throw
      expect(
        handler.onError(error, testEntity, jobId),
      ).resolves.toBeUndefined();
    });

    it("should log error details", async () => {
      const error = new Error("Test error");
      const jobId = "job-123";

      // This test verifies the method doesn't crash
      await handler.onError(error, testEntity, jobId);
    });

    it("should handle different error types", async () => {
      const jobId = "job-123";

      // Test with different error types
      await handler.onError(new Error("Standard error"), testEntity, jobId);
      await handler.onError(new TypeError("Type error"), testEntity, jobId);

      // All should complete without throwing
    });
  });

  describe("Integration scenarios", () => {
    it("should handle complete job workflow", async () => {
      const jobId = "job-integration-test";
      const mockEmbedding = new Float32Array(384);

      // Set up successful responses
      mockEmbeddingService = {
        generateEmbedding: mock(() => Promise.resolve(mockEmbedding)),
        generateEmbeddings: mock(() => Promise.resolve([mockEmbedding])),
      };
      handler = EmbeddingJobHandler.createFresh(mockDb, mockEmbeddingService);

      // 1. Validate data
      const validatedData = handler.validateAndParse(testEntity);
      expect(validatedData).not.toBeNull();

      // 2. Process job
      if (validatedData) {
        await handler.process(validatedData, jobId);
      }

      // 3. Verify both services were called
      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledTimes(1);
      expect(mockDb.insert).toHaveBeenCalledTimes(1);
    });

    it("should handle validation failure in workflow", () => {
      const invalidData = { invalid: "data" };

      // Validation should fail
      const validatedData = handler.validateAndParse(invalidData);
      expect(validatedData).toBeNull();

      // Process should not be called for invalid data
      // (This would be handled by the JobQueueService)
    });

    it("should handle different entity types", async () => {
      const jobId = "job-entity-types";
      const mockEmbedding = new Float32Array(384);

      // Set up successful responses
      mockEmbeddingService = {
        generateEmbedding: mock(() => Promise.resolve(mockEmbedding)),
        generateEmbeddings: mock(() => Promise.resolve([mockEmbedding])),
      };
      handler = EmbeddingJobHandler.createFresh(mockDb, mockEmbeddingService);

      // Test different entity types
      const entityTypes = ["note", "article", "task", "project"];

      for (const entityType of entityTypes) {
        const entity = { ...testEntity, entityType };
        await handler.process(entity, `${jobId}-${entityType}`);
      }

      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledTimes(
        entityTypes.length,
      );
      expect(mockDb.insert).toHaveBeenCalledTimes(entityTypes.length);
    });
  });
});
