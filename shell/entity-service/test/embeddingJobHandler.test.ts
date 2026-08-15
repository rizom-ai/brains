import { describe, expect, test, beforeEach } from "bun:test";
import { createMockProgressReporter } from "@brains/test-utils";
import { EmbeddingJobHandler } from "../src/handlers/embeddingJobHandler";
import type {
  EntityService as IEntityService,
  EmbeddingJobData,
  BaseEntity,
} from "../src/types";
import { createMockEntityService, createTestEntity } from "@brains/test-utils";
import { computeContentHash } from "@brains/utils/hash";
import { mockEmbeddingService } from "./helpers/mock-services";

// The shared factory rather than a two-line stand-in: it stays in step with
// ProgressReporter and records what the handler reported.
const mockProgressReporter = createMockProgressReporter();

/**
 * The shared factory's members are recording spies, so `storeEmbedding` can be
 * asserted directly rather than through a hand-rolled call flag.
 */
function createEntityServiceStub(
  getEntity: () => Promise<BaseEntity | null>,
): IEntityService {
  return createMockEntityService({ getEntityImpl: getEntity });
}

describe("EmbeddingJobHandler", () => {
  beforeEach(() => {});

  describe("CREATE operation handling", () => {
    test("should skip when entity does not exist", async () => {
      const service = createEntityServiceStub(async () => null);

      const handler = EmbeddingJobHandler.createFresh(
        service,
        mockEmbeddingService,
      );

      const jobData: EmbeddingJobData = {
        id: "new-entity",
        entityType: "note",
        contentHash: computeContentHash("new entity content"),
        operation: "create",
      };

      await handler.process(jobData, "job-123", mockProgressReporter);

      expect(service.storeEmbedding).not.toHaveBeenCalled();
    });

    test("should process when entity exists and content matches", async () => {
      const content = "new entity content";
      const currentEntity = createTestEntity<BaseEntity>("note", {
        id: "new-entity",
        content,
        metadata: { coverImageId: "my-cover" },
      });

      const service = createEntityServiceStub(async () => currentEntity);

      const handler = EmbeddingJobHandler.createFresh(
        service,
        mockEmbeddingService,
      );

      const jobData: EmbeddingJobData = {
        id: "new-entity",
        entityType: "note",
        contentHash: currentEntity.contentHash,
        operation: "create",
      };

      await handler.process(jobData, "job-123", mockProgressReporter);

      expect(service.storeEmbedding).toHaveBeenCalled();
    });
  });

  describe("UPDATE operation - stale content handling", () => {
    test("should skip when entity content has changed since job creation", async () => {
      const currentEntity = createTestEntity<BaseEntity>("note", {
        id: "test-entity",
        content: "new content",
        metadata: { coverImageId: "should-be-preserved" },
      });

      const service = createEntityServiceStub(async () => currentEntity);

      const handler = EmbeddingJobHandler.createFresh(
        service,
        mockEmbeddingService,
      );

      const jobData: EmbeddingJobData = {
        id: "test-entity",
        entityType: "note",
        contentHash: computeContentHash("old content"),
        operation: "update",
      };

      await handler.process(jobData, "job-123", mockProgressReporter);

      expect(service.storeEmbedding).not.toHaveBeenCalled();
    });

    test("should process when entity content matches", async () => {
      const content = "same content";
      const currentEntity = createTestEntity<BaseEntity>("note", {
        id: "test-entity",
        content,
        metadata: { coverImageId: "preserved" },
      });

      const service = createEntityServiceStub(async () => currentEntity);

      const handler = EmbeddingJobHandler.createFresh(
        service,
        mockEmbeddingService,
      );

      const jobData: EmbeddingJobData = {
        id: "test-entity",
        entityType: "note",
        contentHash: currentEntity.contentHash,
        operation: "update",
      };

      await handler.process(jobData, "job-123", mockProgressReporter);

      expect(service.storeEmbedding).toHaveBeenCalled();
    });

    test("should skip when entity no longer exists", async () => {
      const service = createEntityServiceStub(async () => null);

      const handler = EmbeddingJobHandler.createFresh(
        service,
        mockEmbeddingService,
      );

      const jobData: EmbeddingJobData = {
        id: "deleted-entity",
        entityType: "note",
        contentHash: computeContentHash("some content"),
        operation: "update",
      };

      await handler.process(jobData, "job-123", mockProgressReporter);

      expect(service.storeEmbedding).not.toHaveBeenCalled();
    });
  });
});
