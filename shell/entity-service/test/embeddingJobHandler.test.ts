import { describe, expect, test, beforeEach } from "bun:test";
import { EmbeddingJobHandler } from "../src/handlers/embeddingJobHandler";
import type {
  EntityService as IEntityService,
  EmbeddingJobData,
  BaseEntity,
} from "../src/types";
import type { IEmbeddingService } from "@brains/embedding-service";
import { computeContentHash } from "@brains/utils";
import type { ProgressReporter } from "@brains/utils";

// Mock embedding service
const mockEmbeddingService: IEmbeddingService = {
  generateEmbedding: async () => new Float32Array(384).fill(0.1),
  generateEmbeddings: async (texts: string[]) =>
    texts.map(() => new Float32Array(384).fill(0.1)),
};

// Mock progress reporter - partial mock is fine since we only use report()
const mockProgressReporter = {
  report: async () => {},
} as unknown as ProgressReporter;

describe("EmbeddingJobHandler", () => {
  beforeEach(() => {
    EmbeddingJobHandler.resetInstance();
  });

  describe("CREATE operation handling", () => {
    test("should process CREATE job even when entity does not exist yet", async () => {
      let storeEntityCalled = false;

      const mockEntityService = {
        getEntity: async () => null, // Entity doesn't exist yet - expected for CREATE
        storeEntityWithEmbedding: async () => {
          storeEntityCalled = true;
        },
      } as unknown as IEntityService;

      const handler = EmbeddingJobHandler.createFresh(
        mockEntityService,
        mockEmbeddingService,
      );

      const jobData: EmbeddingJobData = {
        id: "new-entity",
        entityType: "note",
        content: "new entity content",
        metadata: { coverImageId: "my-cover" },
        created: Date.now(),
        updated: Date.now(),
        contentWeight: 1.0,
        operation: "create", // CREATE operation
      };

      await handler.process(jobData, "job-123", mockProgressReporter);

      // storeEntityWithEmbedding SHOULD be called for CREATE
      expect(storeEntityCalled).toBe(true);
    });

    test("should process CREATE job and store all data including metadata", async () => {
      let storedMetadata: Record<string, unknown> | undefined;

      const mockEntityService = {
        getEntity: async () => null,
        storeEntityWithEmbedding: async (data: {
          metadata: Record<string, unknown>;
        }) => {
          storedMetadata = data.metadata;
        },
      } as unknown as IEntityService;

      const handler = EmbeddingJobHandler.createFresh(
        mockEntityService,
        mockEmbeddingService,
      );

      const jobData: EmbeddingJobData = {
        id: "new-entity",
        entityType: "post",
        content: "---\ntitle: Test\ncoverImageId: my-cover\n---\nBody",
        metadata: { title: "Test", coverImageId: "my-cover" },
        created: Date.now(),
        updated: Date.now(),
        contentWeight: 1.0,
        operation: "create",
      };

      await handler.process(jobData, "job-123", mockProgressReporter);

      // Verify metadata was stored
      expect(storedMetadata).toEqual({
        title: "Test",
        coverImageId: "my-cover",
      });
    });
  });

  describe("UPDATE operation - stale content handling", () => {
    test("should skip UPDATE job when entity content has changed since job creation", async () => {
      // Job was created with content "old content"
      const jobContent = "old content";

      // But current entity in DB has "new content"
      const currentContent = "new content";
      const currentContentHash = computeContentHash(currentContent);

      let storeEntityCalled = false;

      const currentEntity: BaseEntity = {
        id: "test-entity",
        entityType: "note",
        content: currentContent,
        contentHash: currentContentHash,
        metadata: { coverImageId: "should-be-preserved" },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const mockEntityService = {
        getEntity: async () => currentEntity,
        storeEntityWithEmbedding: async () => {
          storeEntityCalled = true;
        },
      } as unknown as IEntityService;

      const handler = EmbeddingJobHandler.createFresh(
        mockEntityService,
        mockEmbeddingService,
      );

      const jobData: EmbeddingJobData = {
        id: "test-entity",
        entityType: "note",
        content: jobContent, // Stale content
        metadata: {}, // Missing coverImageId
        created: Date.now(),
        updated: Date.now(),
        contentWeight: 1.0,
        operation: "update",
      };

      await handler.process(jobData, "job-123", mockProgressReporter);

      // storeEntityWithEmbedding should NOT have been called because content changed
      expect(storeEntityCalled).toBe(false);
    });

    test("should process job when entity content matches", async () => {
      const content = "same content";
      const contentHash = computeContentHash(content);

      let storeEntityCalled = false;

      const currentEntity: BaseEntity = {
        id: "test-entity",
        entityType: "note",
        content,
        contentHash,
        metadata: { coverImageId: "preserved" },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const mockEntityService = {
        getEntity: async () => currentEntity,
        storeEntityWithEmbedding: async () => {
          storeEntityCalled = true;
        },
      } as unknown as IEntityService;

      const handler = EmbeddingJobHandler.createFresh(
        mockEntityService,
        mockEmbeddingService,
      );

      const jobData: EmbeddingJobData = {
        id: "test-entity",
        entityType: "note",
        content, // Same content
        metadata: {},
        created: Date.now(),
        updated: Date.now(),
        contentWeight: 1.0,
        operation: "update",
      };

      await handler.process(jobData, "job-123", mockProgressReporter);

      // storeEntityWithEmbedding SHOULD have been called
      expect(storeEntityCalled).toBe(true);
    });

    test("should skip job when entity no longer exists", async () => {
      let storeEntityCalled = false;

      const mockEntityService = {
        getEntity: async () => null, // Entity doesn't exist
        storeEntityWithEmbedding: async () => {
          storeEntityCalled = true;
        },
      } as unknown as IEntityService;

      const handler = EmbeddingJobHandler.createFresh(
        mockEntityService,
        mockEmbeddingService,
      );

      const jobData: EmbeddingJobData = {
        id: "deleted-entity",
        entityType: "note",
        content: "some content",
        metadata: {},
        created: Date.now(),
        updated: Date.now(),
        contentWeight: 1.0,
        operation: "update",
      };

      await handler.process(jobData, "job-123", mockProgressReporter);

      // storeEntityWithEmbedding should NOT have been called
      expect(storeEntityCalled).toBe(false);
    });
  });
});
