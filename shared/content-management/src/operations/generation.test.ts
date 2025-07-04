import { test, expect, beforeEach, mock } from "bun:test";
import { GenerationOperations } from "./generation";
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

const mockLogger = createSilentLogger("generation-test");

const mockPluginContext = {
  pluginId: "test-plugin",
  logger: mockLogger,
  enqueueContentGeneration: mockEnqueueContentGeneration,
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
  // Add missing properties
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


let operations: GenerationOperations;

beforeEach((): void => {
  // Reset all mocks
  mockGetEntity.mockClear();
  mockCreateEntityAsync.mockClear();
  mockUpdateEntityAsync.mockClear();
  mockListEntities.mockClear();
  mockEnqueueContentGeneration.mockClear();

  GenerationOperations.resetInstance();
  operations = GenerationOperations.createFresh(
    mockEntityService,
    mockLogger,
    mockPluginContext,
  );
});

test("generateSync should generate content for routes", async () => {
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

  const result = await operations.generateSync(
    { dryRun: false },
    routes,
    generateCallback,
    "site-content-preview",
  );

  expect(result.success).toBe(true);
  expect(result.sectionsGenerated).toBe(1);
  expect(result.generated).toHaveLength(1);
  expect(result.generated[0]).toEqual({
    pageId: "landing",
    sectionId: "hero",
    entityId: "landing:hero",
    entityType: "site-content-preview",
  });

  expect(mockCreateEntityAsync).toHaveBeenCalledWith({
    id: "landing:hero",
    entityType: "site-content-preview",
    pageId: "landing",
    sectionId: "hero",
    content: "Generated content",
    created: expect.any(String),
    updated: expect.any(String),
  });
});

test("generateSync should skip existing entities", async () => {
  const routes: RouteDefinition[] = [
    {
      path: "/landing",
      id: "landing",
      description: "Landing page",
      title: "Landing Page",
      sections: [{ id: "hero", template: "hero-template" }],
    },
  ];

  const generateCallback = mock();
  const existingEntity = { id: "landing:hero" };

  mockGetEntity.mockResolvedValue(existingEntity);

  const result = await operations.generateSync(
    { dryRun: false },
    routes,
    generateCallback,
    "site-content-preview",
  );

  expect(result.success).toBe(true);
  expect(result.sectionsGenerated).toBe(0);
  expect(result.skipped).toHaveLength(1);
  expect(result.skipped[0]).toEqual({
    pageId: "landing",
    sectionId: "hero",
    reason: "Entity already exists",
  });

  expect(generateCallback).not.toHaveBeenCalled();
  expect(mockCreateEntityAsync).not.toHaveBeenCalled();
});

test("generateSync should handle dry run", async () => {
  const routes: RouteDefinition[] = [
    {
      path: "/landing",
      id: "landing",
      description: "Landing page",
      title: "Landing Page",
      sections: [{ id: "hero", template: "hero-template" }],
    },
  ];

  const generateCallback = mock();

  const result = await operations.generateSync(
    { dryRun: true },
    routes,
    generateCallback,
    "site-content-preview",
  );

  expect(result.success).toBe(true);
  expect(result.sectionsGenerated).toBe(0);
  expect(generateCallback).not.toHaveBeenCalled();
  expect(mockCreateEntityAsync).not.toHaveBeenCalled();
});

test("generateAsync should queue generation jobs", async () => {
  const routes: RouteDefinition[] = [
    {
      path: "/landing",
      id: "landing",
      description: "Landing page",
      title: "Landing Page",
      sections: [
        { id: "hero", template: "hero-template" },
        { id: "features", template: "features-template" },
      ],
    },
  ];

  const templateResolver = mock().mockReturnValue("template-name");

  mockEnqueueContentGeneration.mockResolvedValue("job-id");

  const result = await operations.generateAsync(
    { dryRun: false },
    routes,
    templateResolver,
    "site-content-preview",
    { siteTitle: "Test Site" },
  );

  expect(result.totalSections).toBe(2);
  expect(result.queuedSections).toBe(2);
  expect(result.jobs).toHaveLength(2);

  expect(result.jobs).toHaveLength(2);
  expect(result.jobs[0]).toMatchObject({
    jobId: expect.stringMatching(
      /^generate-landing:hero-\d+$/,
    ),
    entityId: "landing:hero",
    entityType: "site-content-preview",
    operation: "generate",
    pageId: "landing",
    sectionId: "hero",
    templateName: "template-name",
  });

  // Verify route and section are properly set (check they exist first)
  expect(routes[0]).toBeDefined();
  expect(routes[0]?.sections[0]).toBeDefined();
  expect(result.jobs[0]?.route.path).toBe("/landing");
  expect(result.jobs[0]?.sectionDefinition.id).toBe("hero");

  expect(mockEnqueueContentGeneration).toHaveBeenCalledTimes(2);
  expect(mockEnqueueContentGeneration).toHaveBeenCalledWith({
    templateName: "template-name",
    context: {
      data: {
        ...result.jobs[0],
        siteConfig: { siteTitle: "Test Site" },
      },
    },
  });
});

test("generateAsync should filter by pageId", async () => {
  const routes: RouteDefinition[] = [
    {
      path: "/landing",
      id: "landing",
      description: "Landing page",
      title: "Landing Page",
      sections: [{ id: "hero", template: "hero-template" }],
    },
    {
      path: "/about",
      id: "about",
      description: "About page",
      title: "About Page",
      sections: [{ id: "content", template: "content-template" }],
    },
  ];

  const templateResolver = mock().mockReturnValue("template-name");

  const result = await operations.generateAsync(
    { pageId: "landing", dryRun: false },
    routes,
    templateResolver,
    "site-content-preview",
  );

  expect(result.totalSections).toBe(1);
  expect(result.queuedSections).toBe(1);
  expect(result.jobs).toHaveLength(1);
  expect(result.jobs[0]?.pageId).toBe("landing");
});

test("regenerateSync should regenerate specific section", async () => {
  const existingEntity = {
    id: "landing:hero",
    entityType: "site-content-preview",
    pageId: "landing",
    sectionId: "hero",
    content: "Old content",
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };

  const regenerateCallback = mock().mockResolvedValue({
    content: "New content",
  });

  mockGetEntity.mockResolvedValue(existingEntity);
  mockUpdateEntityAsync.mockResolvedValue(undefined);

  const result = await operations.regenerateSync(
    {
      pageId: "landing",
      sectionId: "hero",
      environment: "preview",
      mode: "new",
      dryRun: false,
    },
    regenerateCallback,
    "site-content-preview",
  );

  expect(result.success).toBe(true);
  expect(result.regenerated).toHaveLength(1);
  expect(result.regenerated[0]).toEqual({
    pageId: "landing",
    sectionId: "hero",
    entityId: "landing:hero",
    mode: "new",
  });

  expect(regenerateCallback).toHaveBeenCalledWith(
    "site-content-preview",
    "landing",
    "hero",
    "new",
    { progress: 1, total: 1, message: "Regenerating landing/hero" },
    "Old content",
  );

  expect(mockUpdateEntityAsync).toHaveBeenCalledWith({
    ...existingEntity,
    content: "New content",
    updated: expect.any(String),
  });
});

test("regenerateSync should regenerate all sections for page", async () => {
  const pageEntities = [
    {
      id: "landing:hero",
      entityType: "site-content-preview",
      pageId: "landing",
      sectionId: "hero",
      content: "Hero content",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
    {
      id: "landing:features",
      entityType: "site-content-preview",
      pageId: "landing",
      sectionId: "features",
      content: "Features content",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
  ];

  const regenerateCallback = mock()
    .mockResolvedValueOnce({
      content: "New hero",
    })
    .mockResolvedValueOnce({
      content: "New features",
    });

  mockListEntities.mockResolvedValue(pageEntities);
  mockUpdateEntityAsync.mockResolvedValue(undefined);

  const result = await operations.regenerateSync(
    { pageId: "landing", environment: "preview", mode: "new", dryRun: false },
    regenerateCallback,
    "site-content-preview",
  );

  expect(result.success).toBe(true);
  expect(result.regenerated).toHaveLength(2);
  expect(mockListEntities).toHaveBeenCalledWith("site-content-preview", {
    filter: { metadata: { pageId: "landing" } },
  });
  expect(regenerateCallback).toHaveBeenCalledTimes(2);
});

test("regenerateAsync should queue regeneration jobs", async () => {
  const existingEntities = [
    {
      id: "landing:hero",
      entityType: "site-content-preview",
      pageId: "landing",
      sectionId: "hero",
      content: "Old hero content",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
    {
      id: "landing:features",
      entityType: "site-content-preview",
      pageId: "landing",
      sectionId: "features",
      content: "Old features content",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
  ];

  const templateResolver = mock()
    .mockReturnValueOnce("hero-template")
    .mockReturnValueOnce("features-template");

  mockListEntities.mockResolvedValue(existingEntities);
  mockEnqueueContentGeneration.mockResolvedValue("job-id");

  const result = await operations.regenerateAsync(
    { pageId: "landing", environment: "preview", mode: "new", dryRun: false },
    "site-content-preview",
    templateResolver,
  );

  expect(result.totalEntities).toBe(2);
  expect(result.queuedEntities).toBe(2);
  expect(result.jobs).toHaveLength(2);

  expect(result.jobs[0]).toMatchObject({
    jobId: expect.stringMatching(
      /^regenerate-landing:hero-\d+$/,
    ),
    entityId: "landing:hero",
    entityType: "site-content-preview",
    operation: "regenerate",
    pageId: "landing",
    sectionId: "hero",
    templateName: "hero-template",
    mode: "new",
  });

  expect(mockEnqueueContentGeneration).toHaveBeenCalledTimes(2);
  expect(mockEnqueueContentGeneration).toHaveBeenCalledWith({
    templateName: "hero-template",
    context: {
      data: {
        ...result.jobs[0],
        currentContent: "Old hero content",
        siteConfig: undefined,
      },
    },
  });
});

test("regenerateAsync should handle dry run", async () => {
  const existingEntities = [
    {
      id: "landing:hero",
      entityType: "site-content-preview",
      pageId: "landing",
      sectionId: "hero",
      content: "Old content",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
  ];

  const templateResolver = mock().mockReturnValue("hero-template");

  mockListEntities.mockResolvedValue(existingEntities);

  const result = await operations.regenerateAsync(
    { pageId: "landing", environment: "preview", mode: "new", dryRun: true },
    "site-content-preview",
    templateResolver,
  );

  expect(result.totalEntities).toBe(1);
  expect(result.queuedEntities).toBe(0);
  expect(result.jobs).toHaveLength(0);
  expect(mockEnqueueContentGeneration).not.toHaveBeenCalled();
});
