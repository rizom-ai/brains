import { test, expect, beforeEach, mock } from "bun:test";
import { GenerationOperations } from "./generation";
import { createSilentLogger } from "@brains/utils";
import type { IEntityService } from "@brains/entity-service";
import type { ServicePluginContext } from "@brains/plugins";
import type { RouteDefinition } from "@brains/view-registry";
import type { JobOptions } from "@brains/job-queue";

// Test JobOptions
const testJobOptions: JobOptions = {
  source: "test",
  metadata: {
    rootJobId: "test-root-id",
    operationType: "content_operations",
  },
};

// Mock dependencies
const mockGetEntity = mock();
const mockCreateEntity = mock();
const mockUpdateEntity = mock();
const mockListEntities = mock();
const mockEnqueueContentGeneration = mock();

const mockEntityService = {
  getEntity: mockGetEntity,
  createEntity: mockCreateEntity,
  updateEntity: mockUpdateEntity,
  listEntities: mockListEntities,
  deleteEntity: mock(),
  searchEntities: mock(),
  getRelated: mock(),
  createRelation: mock(),
  deleteRelation: mock(),
} as unknown as IEntityService;

const mockLogger = createSilentLogger("generation-test");

const mockEnqueueBatch = mock();

const mockPluginContext = {
  pluginId: "test-plugin",
  logger: mockLogger,
  entityService: mockEntityService,
  enqueueJob: mockEnqueueContentGeneration,
  enqueueBatch: mockEnqueueBatch,
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
} as unknown as ServicePluginContext;

let operations: GenerationOperations;

beforeEach((): void => {
  // Reset all mocks
  mockGetEntity.mockClear();
  mockCreateEntity.mockClear();
  mockUpdateEntity.mockClear();
  mockListEntities.mockClear();
  mockEnqueueContentGeneration.mockClear();
  mockEnqueueBatch.mockClear();

  operations = new GenerationOperations(
    mockEntityService,
    mockLogger,
    mockPluginContext,
  );
});

test("generate should queue content generation jobs", async () => {
  const routes: RouteDefinition[] = [
    {
      path: "/landing",
      id: "landing",
      description: "Landing page",
      title: "Landing Page",
      sections: [{ id: "hero", template: "hero-template" }],
    },
  ];

  const templateResolver = mock().mockReturnValue("hero-template");
  mockEnqueueBatch.mockResolvedValue("batch-123");

  const result = await operations.generate(
    { dryRun: false },
    routes,
    templateResolver,
    "site-content-preview",
    testJobOptions,
  );

  expect(result.totalSections).toBe(1);
  expect(result.queuedSections).toBe(1);
  expect(result.jobs).toHaveLength(1);
  expect(result.batchId).toBe("batch-123");
  expect(result.jobs[0]).toMatchObject({
    entityId: "landing:hero",
    entityType: "site-content-preview",
    operation: "generate",
    routeId: "landing",
    sectionId: "hero",
    templateName: "hero-template",
  });

  expect(mockEnqueueBatch).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({
        type: "shell:content-generation",
        data: expect.objectContaining({
          templateName: "hero-template",
          entityId: "landing:hero",
          entityType: "site-content-preview",
        }),
      }),
    ]),
    testJobOptions,
  );
});

test("generate should queue jobs even for sections with content", async () => {
  const routes: RouteDefinition[] = [
    {
      path: "/landing",
      id: "landing",
      description: "Landing page",
      title: "Landing Page",
      sections: [
        { id: "hero", template: "hero-template", content: "Existing content" },
      ],
    },
  ];

  const templateResolver = mock().mockReturnValue("hero-template");
  mockEnqueueBatch.mockResolvedValue("batch-456");

  const result = await operations.generate(
    { dryRun: false },
    routes,
    templateResolver,
    "site-content-preview",
    testJobOptions,
  );

  // The current implementation doesn't skip sections with content
  expect(result.totalSections).toBe(1);
  expect(result.queuedSections).toBe(1);
  expect(result.jobs).toHaveLength(1);
  expect(result.batchId).toBe("batch-456");

  expect(templateResolver).toHaveBeenCalled();
  expect(mockEnqueueBatch).toHaveBeenCalled();
});

test("generate should handle dry run without queuing", async () => {
  const routes: RouteDefinition[] = [
    {
      path: "/landing",
      id: "landing",
      description: "Landing page",
      title: "Landing Page",
      sections: [{ id: "hero", template: "hero-template" }],
    },
  ];

  const templateResolver = mock();

  const result = await operations.generate(
    { dryRun: true },
    routes,
    templateResolver,
    "site-content-preview",
    testJobOptions,
  );

  expect(result.totalSections).toBe(1);
  expect(result.queuedSections).toBe(0);
  expect(result.jobs).toHaveLength(0);
  expect(result.batchId).toBeDefined(); // Should still have a batch ID even for empty batch
  expect(mockEnqueueBatch).not.toHaveBeenCalled();
});

test("generate should queue multiple jobs for multiple sections", async () => {
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

  mockEnqueueBatch.mockResolvedValue("batch-789");

  const result = await operations.generate(
    { dryRun: false },
    routes,
    templateResolver,
    "site-content-preview",
    testJobOptions,
    { siteTitle: "Test Site" },
  );

  expect(result.totalSections).toBe(2);
  expect(result.queuedSections).toBe(2);
  expect(result.jobs).toHaveLength(2);
  expect(result.batchId).toBe("batch-789");

  expect(result.jobs).toHaveLength(2);
  expect(result.jobs[0]).toMatchObject({
    jobId: expect.stringMatching(/^generate-landing:hero-\d+$/),
    entityId: "landing:hero",
    entityType: "site-content-preview",
    operation: "generate",
    routeId: "landing",
    sectionId: "hero",
    templateName: "template-name",
  });

  // Verify route and section are properly set (check they exist first)
  expect(routes[0]).toBeDefined();
  expect(routes[0]?.sections[0]).toBeDefined();
  expect(result.jobs[0]?.route.path).toBe("/landing");
  expect(result.jobs[0]?.sectionDefinition.id).toBe("hero");

  expect(mockEnqueueBatch).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({
        type: "shell:content-generation",
        data: expect.objectContaining({
          templateName: "template-name",
          entityId: "landing:hero",
          entityType: "site-content-preview",
          context: expect.objectContaining({
            data: expect.objectContaining({
              entityId: "landing:hero",
              entityType: "site-content-preview",
              operation: "generate",
              routeId: "landing",
              sectionId: "hero",
              templateName: "template-name",
              siteConfig: { siteTitle: "Test Site" },
            }),
          }),
        }),
      }),
    ]),
    testJobOptions,
  );
});

test("generate should filter by routeId", async () => {
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

  const result = await operations.generate(
    { routeId: "landing", dryRun: false },
    routes,
    templateResolver,
    "site-content-preview",
    testJobOptions,
  );

  expect(result.totalSections).toBe(1);
  expect(result.queuedSections).toBe(1);
  expect(result.jobs).toHaveLength(1);
  expect(result.jobs[0]?.routeId).toBe("landing");
});
