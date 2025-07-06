import { test, expect, beforeEach, afterEach, mock } from "bun:test";
import { ContentManager } from "./manager";
import { createSilentLogger } from "@brains/utils";
import { PluginTestHarness } from "@brains/test-utils";
import type { IEntityService as EntityService } from "@brains/entity-service";
import type { PluginContext } from "@brains/plugin-utils";
import type { RouteDefinition } from "@brains/view-registry";

// Mock dependencies
const mockGetEntity = mock();
const mockCreateEntityAsync = mock();
const mockUpdateEntityAsync = mock();
const mockListEntities = mock();
const mockEnqueueContentGeneration = mock();
const mockGetJobStatus = mock();
const mockDeriveEntity = mock();

// Test harness instances
let harness: PluginTestHarness;
let mockPluginContext: PluginContext;
let mockEntityService: EntityService;

// Removed - using test harness instead

const mockLogger = createSilentLogger("content-manager-test");

const mockGenerateId = (
  type: string,
  pageId: string,
  sectionId: string,
): string => `${type}:${pageId}:${sectionId}`;

let contentManager: ContentManager;

beforeEach(async (): Promise<void> => {
  // Create test harness
  harness = new PluginTestHarness();
  mockPluginContext = harness.getPluginContext();
  mockEntityService = mockPluginContext.entityService;

  // Setup mocks on the harness services
  mockEntityService.getEntity = mockGetEntity;
  mockEntityService.createEntityAsync = mockCreateEntityAsync;
  mockEntityService.updateEntityAsync = mockUpdateEntityAsync;
  mockEntityService.listEntities = mockListEntities;
  mockEntityService.deriveEntity = mockDeriveEntity;

  // Setup job queue mocks
  mockPluginContext.getJobStatus = mockGetJobStatus;
  mockPluginContext.waitForJob = mock().mockResolvedValue("Generated content");
  mockPluginContext.enqueueJob = mockEnqueueContentGeneration;

  // Reset all mocks
  mockGetEntity.mockClear();
  mockCreateEntityAsync.mockClear();
  mockUpdateEntityAsync.mockClear();
  mockListEntities.mockClear();
  mockEnqueueContentGeneration.mockClear();
  mockGetJobStatus.mockClear();
  mockDeriveEntity.mockClear();

  ContentManager.resetInstance();

  // Create content manager - all dependencies are now required
  contentManager = ContentManager.createFresh(
    mockEntityService,
    mockLogger,
    mockPluginContext,
  );
});

afterEach(async (): Promise<void> => {
  await harness.cleanup();
});

// ========================================
// Content Generation Tests
// ========================================

test("generateSync should delegate to GenerationOperations", async () => {
  const routes: RouteDefinition[] = [
    {
      path: "/landing",
      id: "landing",
      description: "Landing page",
      title: "Landing Page",
      sections: [{ id: "hero", template: "hero-template" }],
    },
  ];

  const generateCallback = mock().mockResolvedValue({
    content: "Generated content",
  });

  mockGetEntity.mockResolvedValue(null);
  mockCreateEntityAsync.mockResolvedValue(undefined);

  const result = await contentManager.generateSync(
    { dryRun: false },
    routes,
    generateCallback,
    "site-content-preview",
  );

  expect(result.success).toBe(true);
  expect(result.sectionsGenerated).toBe(1);
  expect(generateCallback).toHaveBeenCalled();
  expect(mockCreateEntityAsync).toHaveBeenCalled();
});

test("generateAsync should delegate to GenerationOperations with PluginContext", async () => {
  const routes: RouteDefinition[] = [
    {
      path: "/landing",
      id: "landing",
      description: "Landing page",
      title: "Landing Page",
      sections: [{ id: "hero", template: "hero-template" }],
    },
  ];

  const templateResolver = mock().mockReturnValue("template-name");
  mockEnqueueContentGeneration.mockResolvedValue("job-id");

  const result = await contentManager.generateAsync(
    { dryRun: false },
    routes,
    templateResolver,
    "site-content-preview",
  );

  expect(result.totalSections).toBe(1);
  expect(result.queuedSections).toBe(1);
  expect(result.jobs).toHaveLength(1);
  expect(mockEnqueueContentGeneration).toHaveBeenCalled();
});

// ========================================
// Content Query Tests
// ========================================

test("getContent should delegate to EntityQueryService", async () => {
  const mockEntity = {
    id: "site-content-preview:landing:hero",
    entityType: "site-content-preview",
    pageId: "landing",
    sectionId: "hero",
    content: "Test content",
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };

  mockGetEntity.mockResolvedValue(mockEntity);

  const result = await contentManager.getContent(
    "site-content-preview",
    "site-content-preview:landing:hero",
  );

  expect(result).toEqual(mockEntity);
  expect(mockGetEntity).toHaveBeenCalledWith(
    "site-content-preview",
    "site-content-preview:landing:hero",
  );
});

test("getPageContent should delegate to EntityQueryService", async () => {
  const mockEntities = [
    {
      id: "site-content-preview:landing:hero",
      entityType: "site-content-preview",
      pageId: "landing",
      sectionId: "hero",
      content: "Hero content",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
  ];

  mockListEntities.mockResolvedValue(mockEntities);

  const result = await contentManager.getPageContent(
    "site-content-preview",
    "landing",
  );

  expect(result).toEqual(mockEntities);
  expect(mockListEntities).toHaveBeenCalledWith("site-content-preview", {
    filter: { metadata: { pageId: "landing" } },
  });
});

test("getSectionContent should delegate to EntityQueryService", async () => {
  const mockEntity = {
    id: "site-content-preview:landing:hero",
    entityType: "site-content-preview",
    pageId: "landing",
    sectionId: "hero",
    content: "Section content",
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };

  mockGetEntity.mockResolvedValue(mockEntity);

  const result = await contentManager.getSectionContent(
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

test("contentExists should delegate to EntityQueryService", async () => {
  mockGetEntity.mockResolvedValue({
    id: "site-content-preview:landing:hero",
    entityType: "site-content-preview",
    pageId: "landing",
    sectionId: "hero",
  });

  const result = await contentManager.contentExists(
    "site-content-preview",
    "landing",
    "hero",
    mockGenerateId,
  );

  expect(result).toBe(true);
  expect(mockGetEntity).toHaveBeenCalledWith(
    "site-content-preview",
    "site-content-preview:landing:hero",
  );
});

// ========================================
// Convenience Methods Tests
// ========================================

test("getPreviewEntities should work with and without pageId", async () => {
  const mockEntities = [
    {
      id: "site-content-preview:landing:hero",
      entityType: "site-content-preview",
      pageId: "landing",
      sectionId: "hero",
      content: "Content",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
  ];

  mockListEntities.mockResolvedValue(mockEntities);

  // With pageId
  const resultWithPage = await contentManager.getPreviewEntities({
    pageId: "landing",
  });
  expect(resultWithPage).toEqual(mockEntities);
  expect(mockListEntities).toHaveBeenCalledWith("site-content-preview", {
    filter: { metadata: { pageId: "landing" } },
  });

  mockListEntities.mockClear();

  // Without pageId
  const resultAll = await contentManager.getPreviewEntities({});
  expect(resultAll).toEqual(mockEntities);
  expect(mockListEntities).toHaveBeenCalledWith("site-content-preview", {});
});

test("getProductionEntities should work with and without pageId", async () => {
  const mockEntities = [
    {
      id: "site-content-production:landing:hero",
      entityType: "site-content-production",
      pageId: "landing",
      sectionId: "hero",
      content: "Content",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
  ];

  mockListEntities.mockResolvedValue(mockEntities);

  // With pageId
  const resultWithPage = await contentManager.getProductionEntities({
    pageId: "landing",
  });
  expect(resultWithPage).toEqual(mockEntities);
  expect(mockListEntities).toHaveBeenCalledWith("site-content-production", {
    filter: { metadata: { pageId: "landing" } },
  });

  mockListEntities.mockClear();

  // Without pageId
  const resultAll = await contentManager.getProductionEntities({});
  expect(resultAll).toEqual(mockEntities);
  expect(mockListEntities).toHaveBeenCalledWith("site-content-production", {});
});

test("exists convenience method should work with default and custom generateId", async () => {
  mockGetEntity.mockResolvedValue({
    id: "site-content-preview:landing:hero",
    entityType: "site-content-preview",
  });

  // With default generateId
  const result1 = await contentManager.exists("landing", "hero", "preview");
  expect(result1).toBe(true);
  expect(mockGetEntity).toHaveBeenCalledWith(
    "site-content-preview",
    "site-content-preview:landing:hero",
  );

  mockGetEntity.mockClear();

  // With custom generateId
  const customGenerateId = mock().mockReturnValue("custom:landing:hero");
  const result2 = await contentManager.exists(
    "landing",
    "hero",
    "production",
    customGenerateId,
  );
  expect(result2).toBe(true);
  expect(customGenerateId).toHaveBeenCalledWith(
    "site-content-production",
    "landing",
    "hero",
  );
});

// ========================================
// Job Tracking Tests (Async Only)
// ========================================

test("waitForContentJobs should delegate to JobTrackingService", async () => {
  const mockJobs = [
    {
      jobId: "job-1",
      entityId: "site-content-preview:landing:hero",
      entityType: "site-content-preview" as const,
      operation: "generate" as const,
      pageId: "landing",
      sectionId: "hero",
      templateName: "hero-template",
      route: {
        path: "/landing",
        id: "landing",
        description: "Landing page",
        title: "Landing Page",
        sections: [{ id: "hero", template: "hero-template" }],
      },
      sectionDefinition: { id: "hero", template: "hero-template" },
    },
  ];

  // waitForContentJobs uses waitForJob, not getJobStatus
  // The mock is already set up in beforeEach

  const result = await contentManager.waitForContentJobs(mockJobs, 5000);

  expect(result).toHaveLength(1);
  expect(result[0]?.success).toBe(true);
  expect(result[0]?.jobId).toBe("job-1");
  expect(result[0]?.content).toBe("Generated content");
  expect(mockPluginContext.waitForJob).toHaveBeenCalledWith("job-1", 5000);
});

test("getContentJobStatuses should return job status map", async () => {
  const mockJobs = [
    {
      jobId: "job-1",
      entityId: "site-content-preview:landing:hero",
      entityType: "site-content-preview" as const,
      operation: "generate" as const,
      pageId: "landing",
      sectionId: "hero",
      templateName: "hero-template",
      route: {
        path: "/landing",
        id: "landing",
        description: "Landing page",
        title: "Landing Page",
        sections: [{ id: "hero", template: "hero-template" }],
      },
      sectionDefinition: { id: "hero", template: "hero-template" },
    },
  ];

  mockGetJobStatus.mockResolvedValue({ status: "completed" });

  const result = await contentManager.getContentJobStatuses(mockJobs);

  expect(result.size).toBe(1);
  expect(result.get("job-1")?.status).toBe("completed");
  expect(mockGetJobStatus).toHaveBeenCalledWith("job-1");
});

// ========================================
// Content Derivation Tests
// ========================================

test("deriveSync should delegate to DerivationOperations", async () => {
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

  const result = await contentManager.deriveSync(
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

test("deriveAsync should delegate to DerivationOperations", async () => {
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

  const result = await contentManager.deriveAsync(
    "site-content-preview:landing:hero",
    "site-content-preview",
    "site-content-production",
    { deleteSource: true },
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
    { deleteSource: true },
  );
});
