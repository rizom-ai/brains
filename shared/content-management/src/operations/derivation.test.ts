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

test("derive should return job ID for preview to production", async () => {
  const result = await operations.derive(
    "site-content-preview:landing:hero",
    "site-content-preview",
    "site-content-production",
    { deleteSource: false },
  );

  expect(result.jobId).toMatch(/^derive-.*-\d+$/);
  expect(result.jobId).toContain("site-content-preview:landing:hero");

  // Should not call deriveEntity directly in async mode
  expect(mockDeriveEntity).not.toHaveBeenCalled();
});

test("derive should return job ID for production to preview", async () => {
  const result = await operations.derive(
    "site-content-production:landing:hero",
    "site-content-production",
    "site-content-preview",
    { deleteSource: true },
  );

  expect(result.jobId).toBeDefined();
  expect(typeof result.jobId).toBe("string");

  // Should not call deriveEntity directly in async mode
  expect(mockDeriveEntity).not.toHaveBeenCalled();
});

test("derive should work with various entity IDs", async () => {
  const testIds = [
    "site-content-preview:nonexistent:section",
    "entity-with-special-chars:test@123",
    "simple-id",
  ];

  for (const entityId of testIds) {
    const result = await operations.derive(
      entityId,
      "site-content-preview",
      "site-content-production",
    );

    expect(result.jobId).toContain("derive-");
    expect(result.jobId).toContain(entityId);
  }
});

test("derive should use default options when none provided", async () => {
  const result = await operations.derive(
    "site-content-preview:landing:hero",
    "site-content-preview",
    "site-content-production",
  );

  expect(result.jobId).toBeDefined();
  expect(typeof result.jobId).toBe("string");
});

test("derive should generate unique job IDs", async () => {
  const result1 = await operations.derive(
    "site-content-preview:landing:hero",
    "site-content-preview",
    "site-content-production",
    { deleteSource: false },
  );

  // Add a small delay to ensure different timestamps
  await new Promise((resolve) => setTimeout(resolve, 10));

  const result2 = await operations.derive(
    "site-content-preview:landing:hero",
    "site-content-preview",
    "site-content-production",
    { deleteSource: false },
  );

  expect(result1.jobId).not.toBe(result2.jobId);
  expect(result1.jobId).toMatch(/^derive-.*-\d+$/);
  expect(result2.jobId).toMatch(/^derive-.*-\d+$/);
});

test("derive should handle different entity types", async () => {
  const testCases = [
    {
      source: "site-content-preview",
      target: "site-content-production",
    },
    {
      source: "site-content-production",
      target: "site-content-preview",
    },
  ];

  for (const { source, target } of testCases) {
    const result = await operations.derive(
      "test-entity-id",
      source as "site-content-preview" | "site-content-production",
      target as "site-content-preview" | "site-content-production",
    );

    expect(result.jobId).toBeDefined();
    expect(result.jobId).toContain("derive-");
  }
});
