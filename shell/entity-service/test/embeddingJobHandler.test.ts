import { describe, expect, test, beforeEach } from "bun:test";
import { EmbeddingJobHandler } from "../src/handlers/embeddingJobHandler";
import type {
  EntityService as IEntityService,
  EmbeddingJobData,
  BaseEntity,
} from "../src/types";
import { createTestEntity } from "@brains/test-utils";
import type { ProgressReporter } from "@brains/utils";
import { computeContentHash } from "@brains/utils";
import { mockEmbeddingService } from "./helpers/mock-services";

const mockProgressReporter = {
  report: async () => {},
} as unknown as ProgressReporter;

function createMockEntityService(overrides: {
  getEntity: () => Promise<BaseEntity | null>;
}): { service: IEntityService; storeEmbeddingCalled: () => boolean } {
  let called = false;
  const service = {
    getEntity: overrides.getEntity,
    storeEmbedding: async () => {
      called = true;
    },
  } as unknown as IEntityService;
  return { service, storeEmbeddingCalled: () => called };
}

describe("EmbeddingJobHandler", () => {
  beforeEach(() => {
    EmbeddingJobHandler.resetInstance();
  });

  describe("CREATE operation handling", () => {
    test("should skip when entity does not exist", async () => {
      const { service, storeEmbeddingCalled } = createMockEntityService({
        getEntity: async () => null,
      });

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

      expect(storeEmbeddingCalled()).toBe(false);
    });

    test("should process when entity exists and content matches", async () => {
      const content = "new entity content";
      const currentEntity = createTestEntity<BaseEntity>("note", {
        id: "new-entity",
        content,
        metadata: { coverImageId: "my-cover" },
      });

      const { service, storeEmbeddingCalled } = createMockEntityService({
        getEntity: async () => currentEntity,
      });

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

      expect(storeEmbeddingCalled()).toBe(true);
    });
  });

  describe("UPDATE operation - stale content handling", () => {
    test("should skip when entity content has changed since job creation", async () => {
      const currentEntity = createTestEntity<BaseEntity>("note", {
        id: "test-entity",
        content: "new content",
        metadata: { coverImageId: "should-be-preserved" },
      });

      const { service, storeEmbeddingCalled } = createMockEntityService({
        getEntity: async () => currentEntity,
      });

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

      expect(storeEmbeddingCalled()).toBe(false);
    });

    test("should process when entity content matches", async () => {
      const content = "same content";
      const currentEntity = createTestEntity<BaseEntity>("note", {
        id: "test-entity",
        content,
        metadata: { coverImageId: "preserved" },
      });

      const { service, storeEmbeddingCalled } = createMockEntityService({
        getEntity: async () => currentEntity,
      });

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

      expect(storeEmbeddingCalled()).toBe(true);
    });

    test("should skip when entity no longer exists", async () => {
      const { service, storeEmbeddingCalled } = createMockEntityService({
        getEntity: async () => null,
      });

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

      expect(storeEmbeddingCalled()).toBe(false);
    });
  });
});
