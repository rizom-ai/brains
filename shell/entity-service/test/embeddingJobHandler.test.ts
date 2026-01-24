import { describe, expect, test, beforeEach } from "bun:test";
import { EmbeddingJobHandler } from "../src/handlers/embeddingJobHandler";
import type {
  EntityService as IEntityService,
  EmbeddingJobData,
  BaseEntity,
} from "../src/types";
import type { IEmbeddingService } from "@brains/embedding-service";
import { createTestEntity } from "@brains/test-utils";
import type { ProgressReporter } from "@brains/utils";
import { computeContentHash } from "@brains/utils";

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
    test("should skip when entity does not exist (with immediate persistence, entity should exist)", async () => {
      let storeEmbeddingCalled = false;
      const content = "new entity content";

      const mockEntityService = {
        getEntity: async () => null, // Entity doesn't exist - something went wrong
        storeEmbedding: async () => {
          storeEmbeddingCalled = true;
        },
      } as unknown as IEntityService;

      const handler = EmbeddingJobHandler.createFresh(
        mockEntityService,
        mockEmbeddingService,
      );

      // Job data is now minimal - no content, only contentHash
      const jobData: EmbeddingJobData = {
        id: "new-entity",
        entityType: "note",
        contentHash: computeContentHash(content),
        operation: "create",
      };

      await handler.process(jobData, "job-123", mockProgressReporter);

      // With immediate persistence, entity should exist. If not, we skip.
      expect(storeEmbeddingCalled).toBe(false);
    });

    test("should process CREATE job when entity exists and content matches", async () => {
      let storeEmbeddingCalled = false;
      const content = "new entity content";

      const currentEntity = createTestEntity<BaseEntity>("note", {
        id: "new-entity",
        content,
        metadata: { coverImageId: "my-cover" },
      });

      const mockEntityService = {
        getEntity: async () => currentEntity,
        storeEmbedding: async () => {
          storeEmbeddingCalled = true;
        },
      } as unknown as IEntityService;

      const handler = EmbeddingJobHandler.createFresh(
        mockEntityService,
        mockEmbeddingService,
      );

      // Job data has contentHash matching entity's contentHash
      const jobData: EmbeddingJobData = {
        id: "new-entity",
        entityType: "note",
        contentHash: currentEntity.contentHash,
        operation: "create",
      };

      await handler.process(jobData, "job-123", mockProgressReporter);

      // storeEmbedding SHOULD be called when entity exists and content matches
      expect(storeEmbeddingCalled).toBe(true);
    });
  });

  describe("UPDATE operation - stale content handling", () => {
    test("should skip UPDATE job when entity content has changed since job creation", async () => {
      // Job was created with hash of "old content"
      const oldContent = "old content";
      const oldContentHash = computeContentHash(oldContent);

      // But current entity in DB has "new content"
      const currentContent = "new content";

      let storeEmbeddingCalled = false;

      const currentEntity = createTestEntity<BaseEntity>("note", {
        id: "test-entity",
        content: currentContent,
        metadata: { coverImageId: "should-be-preserved" },
      });

      const mockEntityService = {
        getEntity: async () => currentEntity,
        storeEmbedding: async () => {
          storeEmbeddingCalled = true;
        },
      } as unknown as IEntityService;

      const handler = EmbeddingJobHandler.createFresh(
        mockEntityService,
        mockEmbeddingService,
      );

      // Job data has stale contentHash (from old content)
      const jobData: EmbeddingJobData = {
        id: "test-entity",
        entityType: "note",
        contentHash: oldContentHash,
        operation: "update",
      };

      await handler.process(jobData, "job-123", mockProgressReporter);

      // storeEmbedding should NOT have been called because content changed
      expect(storeEmbeddingCalled).toBe(false);
    });

    test("should process job when entity content matches", async () => {
      const content = "same content";

      let storeEmbeddingCalled = false;

      const currentEntity = createTestEntity<BaseEntity>("note", {
        id: "test-entity",
        content,
        metadata: { coverImageId: "preserved" },
      });

      const mockEntityService = {
        getEntity: async () => currentEntity,
        storeEmbedding: async () => {
          storeEmbeddingCalled = true;
        },
      } as unknown as IEntityService;

      const handler = EmbeddingJobHandler.createFresh(
        mockEntityService,
        mockEmbeddingService,
      );

      // Job data has matching contentHash
      const jobData: EmbeddingJobData = {
        id: "test-entity",
        entityType: "note",
        contentHash: currentEntity.contentHash,
        operation: "update",
      };

      await handler.process(jobData, "job-123", mockProgressReporter);

      // storeEmbedding SHOULD have been called
      expect(storeEmbeddingCalled).toBe(true);
    });

    test("should skip job when entity no longer exists", async () => {
      let storeEmbeddingCalled = false;

      const mockEntityService = {
        getEntity: async () => null, // Entity doesn't exist
        storeEmbedding: async () => {
          storeEmbeddingCalled = true;
        },
      } as unknown as IEntityService;

      const handler = EmbeddingJobHandler.createFresh(
        mockEntityService,
        mockEmbeddingService,
      );

      const jobData: EmbeddingJobData = {
        id: "deleted-entity",
        entityType: "note",
        contentHash: computeContentHash("some content"),
        operation: "update",
      };

      await handler.process(jobData, "job-123", mockProgressReporter);

      // storeEmbedding should NOT have been called
      expect(storeEmbeddingCalled).toBe(false);
    });
  });
});
