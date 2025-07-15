import { test, expect, beforeEach, mock } from "bun:test";
import { EntityQueryService } from "./entity-query";
import { createSilentLogger } from "@brains/utils";
import type { EntityService } from "@brains/entity-service";

// Mock dependencies
const mockGetEntity = mock();
const mockListEntities = mock();

const mockEntityService = {
  getEntity: mockGetEntity,
  listEntities: mockListEntities,
  createEntitySync: mock(),
  updateEntitySync: mock(),
  deleteEntity: mock(),
  createEntityAsync: mock(),
  updateEntityAsync: mock(),
  getAsyncJobStatus: mock(),
  waitForAsyncJob: mock(),
  listAsyncJobs: mock(),
  cancelAsyncJob: mock(),
  search: mock(),
  deriveEntity: mock(),
  getEntityTypes: mock(),
  serializeEntity: mock(),
  deserializeEntity: mock(),
} as unknown as EntityService;

const mockLogger = createSilentLogger("entity-query-test");

const mockGenerateId = (
  type: string,
  routeId: string,
  sectionId: string,
): string => `${type}:${routeId}:${sectionId}`;

let queryService: EntityQueryService;

beforeEach((): void => {
  // Reset all mocks
  mockGetEntity.mockClear();
  mockListEntities.mockClear();

  EntityQueryService.resetInstance();
  queryService = EntityQueryService.createFresh(mockEntityService, mockLogger);
});

test("getContent should return entity when found", async () => {
  const mockEntity = {
    id: "site-content-preview:landing:hero",
    entityType: "site-content-preview",
    routeId: "landing",
    sectionId: "hero",
    content: "Test content",
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };

  mockGetEntity.mockResolvedValue(mockEntity);

  const result = await queryService.getContent(
    "site-content-preview",
    "site-content-preview:landing:hero",
  );

  expect(result).toEqual(mockEntity);
  expect(mockGetEntity).toHaveBeenCalledWith(
    "site-content-preview",
    "site-content-preview:landing:hero",
  );
});

test("getContent should return null when entity not found", async () => {
  mockGetEntity.mockResolvedValue(null);

  const result = await queryService.getContent(
    "site-content-preview",
    "nonexistent-id",
  );

  expect(result).toBeNull();
});

test("getContent should handle errors gracefully", async () => {
  mockGetEntity.mockRejectedValue(new Error("Database error"));

  const result = await queryService.getContent(
    "site-content-preview",
    "test-id",
  );

  expect(result).toBeNull();
  // Silent logger doesn't need to be tested for specific calls
});

test("getRouteContent should return entities for route", async () => {
  const mockEntities = [
    {
      id: "site-content-preview:landing:hero",
      entityType: "site-content-preview",
      routeId: "landing",
      sectionId: "hero",
      content: "Hero content",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
    {
      id: "site-content-preview:landing:features",
      entityType: "site-content-preview",
      routeId: "landing",
      sectionId: "features",
      content: "Features content",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
  ];

  mockListEntities.mockResolvedValue(mockEntities);

  const result = await queryService.getRouteContent(
    "site-content-preview",
    "landing",
  );

  expect(result).toEqual(mockEntities);
  expect(mockListEntities).toHaveBeenCalledWith("site-content-preview", {
    filter: { metadata: { routeId: "landing" } },
  });
});

test("getRouteContent should handle errors gracefully", async () => {
  mockListEntities.mockRejectedValue(new Error("Query error"));

  const result = await queryService.getRouteContent(
    "site-content-preview",
    "landing",
  );

  expect(result).toEqual([]);
  // Silent logger doesn't need to be tested for specific calls
});

test("getSectionContent should generate ID and get entity", async () => {
  const mockEntity = {
    id: "site-content-preview:landing:hero",
    entityType: "site-content-preview",
    routeId: "landing",
    sectionId: "hero",
    content: "Section content",
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };

  mockGetEntity.mockResolvedValue(mockEntity);

  const result = await queryService.getSectionContent(
    "site-content-preview",
    "landing",
    "hero",
    mockGenerateId,
  );

  expect(result).toEqual(mockEntity);
  expect(mockGetEntity).toHaveBeenCalledWith(
    "site-content-preview",
    "site-content-preview:landing:hero",
  );
});

test("getAllContent should return all entities of type", async () => {
  const mockEntities = [
    {
      id: "entity1",
      entityType: "site-content-preview",
      routeId: "route1",
      sectionId: "section1",
      content: "Content 1",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
    {
      id: "entity2",
      entityType: "site-content-preview",
      routeId: "route2",
      sectionId: "section2",
      content: "Content 2",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
  ];

  mockListEntities.mockResolvedValue(mockEntities);

  const result = await queryService.getAllContent("site-content-preview");

  expect(result).toEqual(mockEntities);
  expect(mockListEntities).toHaveBeenCalledWith("site-content-preview", {});
});

test("contentExists should return true when content exists", async () => {
  const mockEntity = { id: "site-content-preview:landing:hero" };
  mockGetEntity.mockResolvedValue(mockEntity);

  const result = await queryService.contentExists(
    "site-content-preview",
    "landing",
    "hero",
    mockGenerateId,
  );

  expect(result).toBe(true);
});

test("contentExists should return false when content does not exist", async () => {
  mockGetEntity.mockResolvedValue(null);

  const result = await queryService.contentExists(
    "site-content-preview",
    "landing",
    "hero",
    mockGenerateId,
  );

  expect(result).toBe(false);
});

test("queryContent should return entities matching criteria", async () => {
  const mockEntities = [
    {
      id: "entity1",
      entityType: "site-content-preview",
      routeId: "landing",
      sectionId: "hero",
      content: "Query content",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
  ];

  mockListEntities.mockResolvedValue(mockEntities);

  const result = await queryService.queryContent("site-content-preview", {
    routeId: "landing",
    sectionId: "hero",
  });

  expect(result).toEqual(mockEntities);
  expect(mockListEntities).toHaveBeenCalledWith("site-content-preview", {
    filter: { metadata: { routeId: "landing", sectionId: "hero" } },
  });
});

test("getRouteStats should return stats for multiple entity types", async () => {
  const previewEntities = [
    {
      id: "preview1",
      entityType: "site-content-preview",
      routeId: "landing",
      sectionId: "hero",
      content: "Preview 1",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
    {
      id: "preview2",
      entityType: "site-content-preview",
      routeId: "landing",
      sectionId: "features",
      content: "Preview 2",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
  ];
  const productionEntities = [
    {
      id: "production1",
      entityType: "site-content-production",
      routeId: "landing",
      sectionId: "hero",
      content: "Production 1",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
  ];

  mockListEntities
    .mockResolvedValueOnce(previewEntities)
    .mockResolvedValueOnce(productionEntities);

  const result = await queryService.getRouteStats("landing", [
    "site-content-preview",
    "site-content-production",
  ]);

  expect(result).toEqual({
    "site-content-preview": 2,
    "site-content-production": 1,
    total: 3,
  });

  expect(mockListEntities).toHaveBeenCalledTimes(2);
  expect(mockListEntities).toHaveBeenCalledWith("site-content-preview", {
    filter: { metadata: { routeId: "landing" } },
  });
  expect(mockListEntities).toHaveBeenCalledWith("site-content-production", {
    filter: { metadata: { routeId: "landing" } },
  });
});

test("getRouteStats should handle errors gracefully", async () => {
  mockListEntities.mockRejectedValue(new Error("Query error"));

  const result = await queryService.getRouteStats("landing", [
    "site-content-preview",
    "site-content-production",
  ]);

  expect(result).toEqual({
    "site-content-preview": 0,
    "site-content-production": 0,
    total: 0,
  });

  // Silent logger doesn't need to be tested for specific calls
});
