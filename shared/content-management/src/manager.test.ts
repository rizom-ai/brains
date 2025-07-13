import { test, expect, beforeEach, afterEach, mock } from "bun:test";
import { ContentManager } from "./manager";
import { createSilentLogger } from "@brains/utils";
import { PluginTestHarness } from "@brains/test-utils";
import type { IEntityService as EntityService } from "@brains/entity-service";
import type { PluginContext } from "@brains/plugin-utils";
import type { RouteDefinition, SectionDefinition } from "@brains/view-registry";
import type { JobOptions } from "@brains/db";

// Test JobOptions for manager.generate calls
const testJobOptions: JobOptions = {
  source: "test",
  metadata: {
    interfaceId: "test",
    userId: "test-user",
    operationType: "content_generation",
  },
};

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

test("generate should queue jobs and return job array", async () => {
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

  const result = await contentManager.generate(
    { dryRun: false },
    routes,
    templateResolver,
    "site-content-preview",
    testJobOptions,
  );

  expect(result.totalSections).toBe(1);
  expect(result.queuedSections).toBe(1);
  expect(result.jobs).toHaveLength(1);
  expect(mockEnqueueContentGeneration).toHaveBeenCalled();
});

test("generate should handle dry run without queuing jobs", async () => {
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

  const result = await contentManager.generate(
    { dryRun: true },
    routes,
    templateResolver,
    "site-content-preview",
    testJobOptions,
  );

  expect(result.totalSections).toBe(1);
  expect(result.queuedSections).toBe(0);
  expect(result.jobs).toHaveLength(0);
  expect(mockEnqueueContentGeneration).not.toHaveBeenCalled();
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

test("derive should return job ID immediately", async () => {
  const result = await contentManager.derive(
    "site-content-preview:landing:hero",
    "site-content-preview",
    "site-content-production",
    { deleteSource: false },
  );

  expect(result.jobId).toMatch(/^derive-.*-\d+$/);

  // Should not call deriveEntity since it's async
  expect(mockDeriveEntity).not.toHaveBeenCalled();
});

test("derive should handle different options", async () => {
  const result = await contentManager.derive(
    "site-content-preview:landing:hero",
    "site-content-preview",
    "site-content-production",
    { deleteSource: true },
  );

  expect(result.jobId).toBeDefined();
  expect(typeof result.jobId).toBe("string");
});

// ========================================
// Batch Async Operations Tests
// ========================================

test("generateAll should queue batch operation for all sections", async () => {
  const mockRoutes: RouteDefinition[] = [
    {
      id: "landing",
      path: "/",
      title: "Landing Page",
      description: "Main landing page",
      sections: [
        { id: "hero", template: "hero" },
        { id: "features", template: "features" },
      ],
    },
    {
      id: "about",
      path: "/about",
      title: "About Page",
      description: "About us page",
      sections: [{ id: "content", template: "content" }],
    },
  ];

  const mockBatchId = "batch-123";
  const mockEnqueueBatch = mock().mockResolvedValue(mockBatchId);
  mockPluginContext.enqueueBatch = mockEnqueueBatch;

  const templateResolver = (section: SectionDefinition): string =>
    section.template;

  const batchId = await contentManager.generateAll(
    {
      dryRun: false,
      source: "test",
      metadata: {
        interfaceId: "test",
        userId: "user-123",
        operationType: "content_generation",
      },
    },
    mockRoutes,
    templateResolver,
    "site-content-preview",
    { siteTitle: "Test Site" },
  );

  expect(batchId).toBe(mockBatchId);
  expect(mockEnqueueBatch).toHaveBeenCalledWith(
    [
      {
        type: "content-generation",
        entityId: "landing:hero",
        entityType: "site-content-preview",
        options: {
          templateName: "hero",
          context: {
            data: {
              jobId: expect.stringMatching(/^generate-landing:hero-\d+$/),
              entityId: "landing:hero",
              entityType: "site-content-preview",
              operation: "generate",
              pageId: "landing",
              sectionId: "hero",
              templateName: "hero",
              siteConfig: { siteTitle: "Test Site" },
            },
          },
          entityId: "landing:hero",
          entityType: "site-content-preview",
        },
      },
      {
        type: "content-generation",
        entityId: "landing:features",
        entityType: "site-content-preview",
        options: {
          templateName: "features",
          context: {
            data: {
              jobId: expect.stringMatching(/^generate-landing:features-\d+$/),
              entityId: "landing:features",
              entityType: "site-content-preview",
              operation: "generate",
              pageId: "landing",
              sectionId: "features",
              templateName: "features",
              siteConfig: { siteTitle: "Test Site" },
            },
          },
          entityId: "landing:features",
          entityType: "site-content-preview",
        },
      },
      {
        type: "content-generation",
        entityId: "about:content",
        entityType: "site-content-preview",
        options: {
          templateName: "content",
          context: {
            data: {
              jobId: expect.stringMatching(/^generate-about:content-\d+$/),
              entityId: "about:content",
              entityType: "site-content-preview",
              operation: "generate",
              pageId: "about",
              sectionId: "content",
              templateName: "content",
              siteConfig: { siteTitle: "Test Site" },
            },
          },
          entityId: "about:content",
          entityType: "site-content-preview",
        },
      },
    ],
    {
      source: "test",
      metadata: {
        interfaceId: "test",
        userId: "user-123",
        operationType: "content_generation",
      },
    },
  );
});

test("generateAll should respect pageId filter", async () => {
  const mockRoutes: RouteDefinition[] = [
    {
      id: "landing",
      path: "/",
      title: "Landing Page",
      description: "Main landing page",
      sections: [{ id: "hero", template: "hero" }],
    },
    {
      id: "about",
      path: "/about",
      title: "About Page",
      description: "About us page",
      sections: [{ id: "content", template: "content" }],
    },
  ];

  const mockBatchId = "batch-456";
  const mockEnqueueBatch = mock().mockResolvedValue(mockBatchId);
  mockPluginContext.enqueueBatch = mockEnqueueBatch;

  const templateResolver = (section: SectionDefinition): string =>
    section.template;

  const batchId = await contentManager.generateAll(
    {
      pageId: "landing",
      dryRun: false,
      source: "test",
      metadata: {
        interfaceId: "test",
        userId: "system",
        operationType: "content_generation",
      },
    },
    mockRoutes,
    templateResolver,
    "site-content-preview",
  );

  expect(batchId).toBe(mockBatchId);
  expect(mockEnqueueBatch).toHaveBeenCalledWith(
    [
      {
        type: "content-generation",
        entityId: "landing:hero",
        entityType: "site-content-preview",
        options: {
          templateName: "hero",
          context: {
            data: {
              jobId: expect.stringMatching(/^generate-landing:hero-\d+$/),
              entityId: "landing:hero",
              entityType: "site-content-preview",
              operation: "generate",
              pageId: "landing",
              sectionId: "hero",
              templateName: "hero",
              siteConfig: undefined,
            },
          },
          entityId: "landing:hero",
          entityType: "site-content-preview",
        },
      },
    ],
    {
      source: "test",
      metadata: {
        interfaceId: "test",
        userId: "system",
        operationType: "content_generation",
      },
    },
  );
});

test("generateAll should throw for empty operations", async () => {
  const mockRoutes: RouteDefinition[] = [];
  const templateResolver = (section: SectionDefinition): string =>
    section.template;

  void expect(
    contentManager.generateAll(
      {
        dryRun: false,
        source: "test",
        metadata: {
          interfaceId: "test",
          userId: "system",
          operationType: "content_generation",
        },
      },
      mockRoutes,
      templateResolver,
      "site-content-preview",
    ),
  ).rejects.toThrow("No operations to perform");
});

test("promote should queue batch promotion operations", async () => {
  const previewIds = [
    "site-content-preview:landing:hero",
    "site-content-preview:landing:features",
    "site-content-preview:about:content",
  ];

  const mockBatchId = "batch-promote-123";
  const mockEnqueueBatch = mock().mockResolvedValue(mockBatchId);
  mockPluginContext.enqueueBatch = mockEnqueueBatch;

  const batchId = await contentManager.promote(previewIds, {
    priority: 10,
    source: "test",
    metadata: {
      interfaceId: "test",
      userId: "admin-123",
      operationType: "content_generation",
    },
  });

  expect(batchId).toBe(mockBatchId);
  expect(mockEnqueueBatch).toHaveBeenCalledWith(
    [
      {
        type: "content-derivation",
        entityId: "site-content-preview:landing:hero",
        entityType: "site-content-preview",
        options: {
          entityId: "site-content-preview:landing:hero",
          sourceEntityType: "site-content-preview",
          targetEntityType: "site-content-production",
        },
      },
      {
        type: "content-derivation",
        entityId: "site-content-preview:landing:features",
        entityType: "site-content-preview",
        options: {
          entityId: "site-content-preview:landing:features",
          sourceEntityType: "site-content-preview",
          targetEntityType: "site-content-production",
        },
      },
      {
        type: "content-derivation",
        entityId: "site-content-preview:about:content",
        entityType: "site-content-preview",
        options: {
          entityId: "site-content-preview:about:content",
          sourceEntityType: "site-content-preview",
          targetEntityType: "site-content-production",
        },
      },
    ],
    {
      source: "test",
      metadata: {
        interfaceId: "test",
        userId: "admin-123",
        operationType: "content_generation",
      },
      priority: 10,
    },
  );
});

test("promote should throw for empty ids", async () => {
  void expect(
    contentManager.promote([], {
      source: "test",
      metadata: {
        interfaceId: "test",
        userId: "system",
        operationType: "content_generation",
      },
    }),
  ).rejects.toThrow("No entities to promote");
});

test("rollback should queue batch rollback operations", async () => {
  const productionIds = [
    "site-content-production:landing:hero",
    "site-content-production:about:content",
  ];

  const mockBatchId = "batch-rollback-789";
  const mockEnqueueBatch = mock().mockResolvedValue(mockBatchId);
  mockPluginContext.enqueueBatch = mockEnqueueBatch;

  const batchId = await contentManager.rollback(productionIds, {
    source: "test",
    metadata: {
      interfaceId: "test",
      userId: "system",
      operationType: "content_generation",
    },
  });

  expect(batchId).toBe(mockBatchId);
  expect(mockEnqueueBatch).toHaveBeenCalledWith(
    [
      {
        type: "content-derivation",
        entityId: "site-content-production:landing:hero",
        entityType: "site-content-production",
        options: {
          entityId: "site-content-production:landing:hero",
          sourceEntityType: "site-content-production",
          targetEntityType: "site-content-preview",
        },
      },
      {
        type: "content-derivation",
        entityId: "site-content-production:about:content",
        entityType: "site-content-production",
        options: {
          entityId: "site-content-production:about:content",
          sourceEntityType: "site-content-production",
          targetEntityType: "site-content-preview",
        },
      },
    ],
    {
      source: "test",
      metadata: {
        interfaceId: "test",
        userId: "system",
        operationType: "content_generation",
      },
    },
  );
});

test("rollback should throw for empty ids", async () => {
  void expect(
    contentManager.rollback([], {
      source: "test",
      metadata: {
        interfaceId: "test",
        userId: "system",
        operationType: "content_generation",
      },
    }),
  ).rejects.toThrow("No entities to rollback");
});

test("getBatchStatus should delegate to plugin context", async () => {
  const mockBatchStatus = {
    batchId: "batch-123",
    totalOperations: 10,
    completedOperations: 5,
    failedOperations: 1,
    errors: ["Failed to generate content"],
    status: "processing" as const,
  };

  const mockGetBatchStatus = mock().mockResolvedValue(mockBatchStatus);
  mockPluginContext.getBatchStatus = mockGetBatchStatus;

  const status = await contentManager.getBatchStatus("batch-123");

  expect(status).toBe(mockBatchStatus);
  expect(mockGetBatchStatus).toHaveBeenCalledWith("batch-123");
});
