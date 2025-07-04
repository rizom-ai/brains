import { test, expect, beforeEach, mock } from "bun:test";
import { JobTrackingService } from "./job-tracking";
import { createSilentLogger } from "@brains/utils";
import type { PluginContext } from "@brains/plugin-utils";
import type { ContentGenerationJob } from "../types";

// Mock dependencies
const mockGetJobStatus = mock();

const mockPluginContext = {
  pluginId: "test-plugin",
  logger: createSilentLogger("job-tracking-test"),
  enqueueContentGeneration: mock(),
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

const mockLogger = createSilentLogger("job-tracking-test");

let jobTrackingService: JobTrackingService;

beforeEach((): void => {
  mockGetJobStatus.mockClear();
  JobTrackingService.resetInstance();
  jobTrackingService = JobTrackingService.createFresh(
    mockPluginContext,
    mockLogger,
  );
});

test("should implement singleton pattern", () => {
  const instance1 = JobTrackingService.getInstance(
    mockPluginContext,
    mockLogger,
  );
  const instance2 = JobTrackingService.getInstance(
    mockPluginContext,
    mockLogger,
  );

  expect(instance1).toBe(instance2);
});

test("should reset instance", () => {
  const instance1 = JobTrackingService.getInstance(
    mockPluginContext,
    mockLogger,
  );
  JobTrackingService.resetInstance();
  const instance2 = JobTrackingService.getInstance(
    mockPluginContext,
    mockLogger,
  );

  expect(instance1).not.toBe(instance2);
});

test("should create fresh instance", () => {
  const instance1 = JobTrackingService.getInstance(
    mockPluginContext,
    mockLogger,
  );
  const instance2 = JobTrackingService.createFresh(
    mockPluginContext,
    mockLogger,
  );

  expect(instance1).not.toBe(instance2);
});

test("waitForContentJobs should return empty array for no jobs", async () => {
  const result = await jobTrackingService.waitForContentJobs([]);

  expect(result).toEqual([]);
});

test("waitForContentJobs should track job progress", async () => {
  const mockJobs: ContentGenerationJob[] = [
    {
      jobId: "job-1",
      entityId: "site-content-preview:landing:hero",
      entityType: "site-content-preview",
      operation: "generate",
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

  // Mock getJobStatus to simulate job completion
  let callCount = 0;
  mockGetJobStatus.mockImplementation(async () => {
    callCount++;
    // Simulate job completing after first check
    if (callCount > 1) {
      return {
        status: "completed",
        result: "Generated content",
      };
    }
    return { status: "pending" };
  });

  const progressCallback = mock();

  const result = await jobTrackingService.waitForContentJobs(
    mockJobs,
    progressCallback,
    5000, // 5 second timeout
  );

  expect(result).toHaveLength(1);
  expect(result[0]?.success).toBe(true);
  expect(result[0]?.jobId).toBe("job-1");
  expect(result[0]?.content).toBe("Generated content");
  expect(progressCallback).toHaveBeenCalled();
});

test("waitForContentJobs should handle job failures", async () => {
  const mockJobs: ContentGenerationJob[] = [
    {
      jobId: "job-1",
      entityId: "site-content-preview:landing:hero",
      entityType: "site-content-preview",
      operation: "generate",
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

  // Mock getJobStatus to simulate job failure
  mockGetJobStatus.mockResolvedValue({
    status: "failed",
    error: "Template not found",
  });

  const result = await jobTrackingService.waitForContentJobs(
    mockJobs,
    undefined,
    5000,
  );

  expect(result).toHaveLength(1);
  expect(result[0]?.success).toBe(false);
  expect(result[0]?.error).toBe("Template not found");
});

test("waitForContentJobs should timeout for long-running jobs", async () => {
  const mockJobs: ContentGenerationJob[] = [
    {
      jobId: "job-1",
      entityId: "site-content-preview:landing:hero",
      entityType: "site-content-preview",
      operation: "generate",
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

  // Mock job to always be pending
  mockGetJobStatus.mockResolvedValue({
    status: "pending",
  });

  expect(
    jobTrackingService.waitForContentJobs(mockJobs, undefined, 100), // 100ms timeout
  ).rejects.toThrow("Job tracking timed out after 100ms");
});

test("getContentJobStatuses should return job status summary", async () => {
  const mockJobs: ContentGenerationJob[] = [
    {
      jobId: "job-1",
      entityId: "site-content-preview:landing:hero",
      entityType: "site-content-preview",
      operation: "generate",
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
    {
      jobId: "job-2",
      entityId: "site-content-preview:landing:features",
      entityType: "site-content-preview",
      operation: "generate",
      pageId: "landing",
      sectionId: "features",
      templateName: "features-template",
      route: {
        path: "/landing",
        id: "landing",
        description: "Landing page",
        title: "Landing Page",
        sections: [{ id: "features", template: "features-template" }],
      },
      sectionDefinition: { id: "features", template: "features-template" },
    },
  ];

  // Mock different job statuses
  mockGetJobStatus
    .mockResolvedValueOnce({ status: "completed" })
    .mockResolvedValueOnce({ status: "pending" });

  const result = await jobTrackingService.getContentJobStatuses(mockJobs);

  expect(result.total).toBe(2);
  expect(result.completed).toBe(1);
  expect(result.pending).toBe(1);
  expect(result.processing).toBe(0);
  expect(result.failed).toBe(0);
  expect(result.jobs).toHaveLength(2);
  expect(result.jobs[0]?.status).toBe("completed");
  expect(result.jobs[1]?.status).toBe("pending");
});

test("getContentJobStatuses should handle errors gracefully", async () => {
  const mockJobs: ContentGenerationJob[] = [
    {
      jobId: "job-1",
      entityId: "site-content-preview:landing:hero",
      entityType: "site-content-preview",
      operation: "generate",
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

  // Mock error during status check
  mockGetJobStatus.mockRejectedValue(new Error("Network error"));

  const result = await jobTrackingService.getContentJobStatuses(mockJobs);

  // Should still return job info even when there's an error checking status
  expect(result.total).toBe(1);
  expect(result.failed).toBe(1);
  expect(result.jobs).toHaveLength(1);
  expect(result.jobs[0]?.status).toBe("failed");
  expect(result.jobs[0]?.error).toBe("Network error");
});

test("should call progress callback with correct data", async () => {
  const mockJobs: ContentGenerationJob[] = [
    {
      jobId: "job-1",
      entityId: "site-content-preview:landing:hero",
      entityType: "site-content-preview",
      operation: "generate",
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

  // Mock job to complete immediately
  mockGetJobStatus.mockResolvedValue({
    status: "completed",
    result: "Generated content",
  });

  const progressCallback = mock();

  await jobTrackingService.waitForContentJobs(mockJobs, progressCallback, 5000);

  expect(progressCallback).toHaveBeenCalledWith({
    current: 1,
    total: 1,
    message: "Processed 1/1 jobs",
    completed: expect.arrayContaining([mockJobs[0]]),
    failed: [],
  });
});
