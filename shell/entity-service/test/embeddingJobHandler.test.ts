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
    test("should skip when entity does not exist (with immediate persistence, entity should exist)", async () => {
      let storeEmbeddingCalled = false;

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

      const jobData: EmbeddingJobData = {
        id: "new-entity",
        entityType: "note",
        content: "new entity content",
        metadata: { coverImageId: "my-cover" },
        created: Date.now(),
        updated: Date.now(),
        operation: "create",
      };

      await handler.process(jobData, "job-123", mockProgressReporter);

      // With immediate persistence, entity should exist. If not, we skip.
      expect(storeEmbeddingCalled).toBe(false);
    });

    test("should process CREATE job when entity exists and content matches", async () => {
      let storeEmbeddingCalled = false;
      const content = "new entity content";
      const contentHash = computeContentHash(content);

      const currentEntity: BaseEntity = {
        id: "new-entity",
        entityType: "note",
        content,
        contentHash,
        metadata: { coverImageId: "my-cover" },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

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

      const jobData: EmbeddingJobData = {
        id: "new-entity",
        entityType: "note",
        content,
        metadata: { coverImageId: "my-cover" },
        created: Date.now(),
        updated: Date.now(),
        operation: "create",
      };

      await handler.process(jobData, "job-123", mockProgressReporter);

      // storeEmbedding SHOULD be called when entity exists and content matches
      expect(storeEmbeddingCalled).toBe(true);
    });
  });

  describe("UPDATE operation - stale content handling", () => {
    test("should skip UPDATE job when entity content has changed since job creation", async () => {
      // Job was created with content "old content"
      const jobContent = "old content";

      // But current entity in DB has "new content"
      const currentContent = "new content";
      const currentContentHash = computeContentHash(currentContent);

      let storeEmbeddingCalled = false;

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
        storeEmbedding: async () => {
          storeEmbeddingCalled = true;
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
        operation: "update",
      };

      await handler.process(jobData, "job-123", mockProgressReporter);

      // storeEmbedding should NOT have been called because content changed
      expect(storeEmbeddingCalled).toBe(false);
    });

    test("should process job when entity content matches", async () => {
      const content = "same content";
      const contentHash = computeContentHash(content);

      let storeEmbeddingCalled = false;

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
        storeEmbedding: async () => {
          storeEmbeddingCalled = true;
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
        content: "some content",
        metadata: {},
        created: Date.now(),
        updated: Date.now(),
        operation: "update",
      };

      await handler.process(jobData, "job-123", mockProgressReporter);

      // storeEmbedding should NOT have been called
      expect(storeEmbeddingCalled).toBe(false);
    });
  });
});
