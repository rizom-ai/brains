import { test, expect, beforeEach, mock } from "bun:test";
import { ContentManager } from "./manager";
import { createSilentLogger } from "@brains/utils";
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

const mockEntityService = {
  getEntity: mockGetEntity,
  createEntityAsync: mockCreateEntityAsync,
  updateEntityAsync: mockUpdateEntityAsync,
  listEntities: mockListEntities,
  createEntitySync: mock(),
  updateEntitySync: mock(),
  deleteEntity: mock(),
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

const mockPluginContext = {
  pluginId: "test-plugin",
  logger: createSilentLogger("content-manager-test"),
  enqueueContentGeneration: mockEnqueueContentGeneration,
  getJobStatus: mockGetJobStatus,
  waitForJob: mock(),
  sendMessage: mock(),
  subscribe: mock(),
  unsubscribe: mock(),
  getPluginConfig: mock(),
  updatePluginConfig: mock(),
  getGlobalConfig: mock(),
  updateGlobalConfig: mock(),
  getSecrets: mock(),
  updateSecrets: mock(),
  listPlugins: mock(),
  getPluginStatus: mock(),
  enablePlugin: mock(),
  disablePlugin: mock(),
  installPlugin: mock(),
  uninstallPlugin: mock(),
  updatePlugin: mock(),
  getPluginMetadata: mock(),
  validatePluginConfig: mock(),
  getPluginDependencies: mock(),
  resolvePluginDependencies: mock(),
  getPluginPermissions: mock(),
  requestPluginPermissions: mock(),
  revokePluginPermissions: mock(),
  registerEntityType: mock(),
  generateContent: mock(),
  parseContent: mock(),
  formatContent: mock(),
  validateContent: mock(),
  getContentTypes: mock(),
  getContentMetadata: mock(),
  updateContentMetadata: mock(),
  deleteContentMetadata: mock(),
  getContentHistory: mock(),
  getContentDiff: mock(),
  applyContentPatch: mock(),
  getContentStats: mock(),
  searchContent: mock(),
  indexContent: mock(),
  deleteContentIndex: mock(),
  getContentIndex: mock(),
  updateContentIndex: mock(),
} as unknown as PluginContext;

const mockLogger = createSilentLogger("content-manager-test");

const mockGenerateId = (
  type: string,
  pageId: string,
  sectionId: string,
): string => `${type}:${pageId}:${sectionId}`;

let contentManager: ContentManager;

beforeEach((): void => {
  // Reset all mocks
  mockGetEntity.mockClear();
  mockCreateEntityAsync.mockClear();
  mockUpdateEntityAsync.mockClear();
  mockListEntities.mockClear();
  mockEnqueueContentGeneration.mockClear();
  mockGetJobStatus.mockClear();

  ContentManager.resetInstance();

  // Create content manager - all dependencies are now required
  contentManager = ContentManager.createFresh(mockEntityService, mockLogger, mockPluginContext);
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
    mockGenerateId,
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
    mockGenerateId,
  );

  expect(result.totalSections).toBe(1);
  expect(result.queuedSections).toBe(1);
  expect(result.jobs).toHaveLength(1);
  expect(mockEnqueueContentGeneration).toHaveBeenCalled();
});

test("regenerateSync should delegate to GenerationOperations", async () => {
  const existingEntity = {
    id: "site-content-preview:landing:hero",
    entityType: "site-content-preview",
    pageId: "landing",
    sectionId: "hero",
    content: "Old content",
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };

  const regenerateCallback = mock().mockResolvedValue({
    entityId: "site-content-preview:landing:hero",
    content: "New content",
  });

  mockGetEntity.mockResolvedValue(existingEntity);
  mockUpdateEntityAsync.mockResolvedValue(undefined);

  const result = await contentManager.regenerateSync(
    {
      pageId: "landing",
      sectionId: "hero",
      environment: "preview",
      mode: "new",
      dryRun: false,
    },
    regenerateCallback,
    "site-content-preview",
    mockGenerateId,
  );

  expect(result.success).toBe(true);
  expect(result.regenerated).toHaveLength(1);
  expect(regenerateCallback).toHaveBeenCalled();
  expect(mockUpdateEntityAsync).toHaveBeenCalled();
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

  const result = await contentManager.getPageContent("site-content-preview", "landing");

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
  const resultWithPage = await contentManager.getPreviewEntities({ pageId: "landing" });
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
  const resultWithPage = await contentManager.getProductionEntities({ pageId: "landing" });
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
  const result2 = await contentManager.exists("landing", "hero", "production", customGenerateId);
  expect(result2).toBe(true);
  expect(customGenerateId).toHaveBeenCalledWith("site-content-production", "landing", "hero");
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

  mockGetJobStatus.mockResolvedValue({
    status: "completed",
    result: "Generated content",
  });

  const result = await contentManager.waitForContentJobs(mockJobs, undefined, 5000);

  expect(result).toHaveLength(1);
  expect(result[0]?.success).toBe(true);
  expect(result[0]?.jobId).toBe("job-1");
  expect(mockGetJobStatus).toHaveBeenCalledWith("job-1");
});

test("getContentJobStatuses should delegate to JobTrackingService", async () => {
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

  expect(result.total).toBe(1);
  expect(result.completed).toBe(1);
  expect(result.jobs).toHaveLength(1);
  expect(result.jobs[0]?.status).toBe("completed");
  expect(mockGetJobStatus).toHaveBeenCalledWith("job-1");
});