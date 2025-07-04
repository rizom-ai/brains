import { test, expect, beforeEach, mock } from "bun:test";
import { DerivationOperations } from "./derivation";
import { createSilentLogger } from "@brains/utils";
import type { IEntityService as EntityService } from "@brains/entity-service";

// Mock dependencies
const mockDeriveEntity = mock();

const mockEntityService = {
  getEntity: mock(),
  createEntityAsync: mock(),
  updateEntityAsync: mock(),
  listEntities: mock(),
  createEntitySync: mock(),
  updateEntitySync: mock(),
  deleteEntity: mock(),
  getAsyncJobStatus: mock(),
  waitForAsyncJob: mock(),
  listAsyncJobs: mock(),
  cancelAsyncJob: mock(),
  search: mock(),
  deriveEntity: mockDeriveEntity,
  getEntityTypes: mock(),
  serializeEntity: mock(),
  deserializeEntity: mock(),
} as unknown as EntityService;

const mockLogger = createSilentLogger("derivation-test");

let operations: DerivationOperations;

beforeEach((): void => {
  // Reset all mocks
  mockDeriveEntity.mockClear();

  DerivationOperations.resetInstance();
  operations = DerivationOperations.createFresh(mockEntityService, mockLogger);
});

test("should implement singleton pattern", () => {
  const instance1 = DerivationOperations.getInstance(
    mockEntityService,
    mockLogger,
  );
  const instance2 = DerivationOperations.getInstance(
    mockEntityService,
    mockLogger,
  );

  expect(instance1).toBe(instance2);
});

test("should reset instance", () => {
  const instance1 = DerivationOperations.getInstance(
    mockEntityService,
    mockLogger,
  );
  DerivationOperations.resetInstance();
  const instance2 = DerivationOperations.getInstance(
    mockEntityService,
    mockLogger,
  );

  expect(instance1).not.toBe(instance2);
});

test("should create fresh instance", () => {
  const instance1 = DerivationOperations.getInstance(
    mockEntityService,
    mockLogger,
  );
  const instance2 = DerivationOperations.createFresh(
    mockEntityService,
    mockLogger,
  );

  expect(instance1).not.toBe(instance2);
});

test("deriveSync should derive content from preview to production", async () => {
  const mockDerivedEntity = {
    id: "site-content-production:landing:hero",
    entityType: "site-content-production",
    pageId: "landing",
    sectionId: "hero",
    content: "Derived content",
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };

  mockDeriveEntity.mockResolvedValue(mockDerivedEntity);

  const result = await operations.deriveSync(
    "site-content-preview:landing:hero",
    "site-content-preview",
    "site-content-production",
    { deleteSource: false },
  );

  expect(result).toEqual({
    sourceEntityId: "site-content-preview:landing:hero",
    sourceEntityType: "site-content-preview",
    derivedEntityId: "site-content-production:landing:hero",
    derivedEntityType: "site-content-production",
    sourceDeleted: false,
  });

  expect(mockDeriveEntity).toHaveBeenCalledWith(
    "site-content-preview:landing:hero",
    "site-content-preview",
    "site-content-production",
    { deleteSource: false },
  );
});

test("deriveSync should derive content from production to preview", async () => {
  const mockDerivedEntity = {
    id: "site-content-preview:landing:hero",
    entityType: "site-content-preview",
    pageId: "landing",
    sectionId: "hero",
    content: "Rolled back content",
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };

  mockDeriveEntity.mockResolvedValue(mockDerivedEntity);

  const result = await operations.deriveSync(
    "site-content-production:landing:hero",
    "site-content-production",
    "site-content-preview",
    { deleteSource: true },
  );

  expect(result).toEqual({
    sourceEntityId: "site-content-production:landing:hero",
    sourceEntityType: "site-content-production",
    derivedEntityId: "site-content-preview:landing:hero",
    derivedEntityType: "site-content-preview",
    sourceDeleted: true,
  });

  expect(mockDeriveEntity).toHaveBeenCalledWith(
    "site-content-production:landing:hero",
    "site-content-production",
    "site-content-preview",
    { deleteSource: true },
  );
});

test("deriveSync should handle errors gracefully", async () => {
  mockDeriveEntity.mockRejectedValue(new Error("Source entity not found"));

  expect(
    operations.deriveSync(
      "site-content-preview:nonexistent:section",
      "site-content-preview",
      "site-content-production",
    ),
  ).rejects.toThrow("Content derivation failed: Source entity not found");

  expect(mockDeriveEntity).toHaveBeenCalledWith(
    "site-content-preview:nonexistent:section",
    "site-content-preview",
    "site-content-production",
    {},
  );
});

test("deriveSync should use default options when none provided", async () => {
  const mockDerivedEntity = {
    id: "site-content-production:landing:hero",
    entityType: "site-content-production",
    pageId: "landing",
    sectionId: "hero",
    content: "Derived content",
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };

  mockDeriveEntity.mockResolvedValue(mockDerivedEntity);

  const result = await operations.deriveSync(
    "site-content-preview:landing:hero",
    "site-content-preview",
    "site-content-production",
  );

  expect(result.sourceDeleted).toBe(false);
  expect(mockDeriveEntity).toHaveBeenCalledWith(
    "site-content-preview:landing:hero",
    "site-content-preview",
    "site-content-production",
    {},
  );
});

test("deriveAsync should return job ID", async () => {
  const mockDerivedEntity = {
    id: "site-content-production:landing:hero",
    entityType: "site-content-production",
    pageId: "landing",
    sectionId: "hero",
    content: "Derived content",
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };

  mockDeriveEntity.mockResolvedValue(mockDerivedEntity);

  const result = await operations.deriveAsync(
    "site-content-preview:landing:hero",
    "site-content-preview",
    "site-content-production",
    { deleteSource: false },
  );

  expect(result.jobId).toMatch(
    /^derive-site-content-preview:landing:hero-site-content-production-\d+$/,
  );

  // Give the background job a moment to execute
  await new Promise((resolve) => setTimeout(resolve, 10));

  expect(mockDeriveEntity).toHaveBeenCalledWith(
    "site-content-preview:landing:hero",
    "site-content-preview",
    "site-content-production",
    { deleteSource: false },
  );
});

test("deriveAsync should handle errors in background job", async () => {
  mockDeriveEntity.mockRejectedValue(new Error("Derivation failed"));

  const result = await operations.deriveAsync(
    "site-content-preview:landing:hero",
    "site-content-preview",
    "site-content-production",
  );

  expect(result.jobId).toMatch(
    /^derive-site-content-preview:landing:hero-site-content-production-\d+$/,
  );

  // Give the background job a moment to execute and fail
  await new Promise((resolve) => setTimeout(resolve, 10));

  expect(mockDeriveEntity).toHaveBeenCalled();
});
