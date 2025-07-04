import { test, expect, beforeEach, mock } from "bun:test";
import { createSilentLogger } from "@brains/utils";
import type { PluginContext } from "@brains/plugin-utils";
import type { ContentGenerationJob } from "../types";
import { waitForContentJobs, getContentJobStatuses } from "./job-tracking";

// Mock dependencies
const mockGetJobStatus = mock();

const mockPluginContext = {
  pluginId: "test-plugin",
  logger: createSilentLogger("job-tracking-utils-test"),
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
  enqueueContentGeneration: mock(),
} as unknown as PluginContext;

const mockLogger = createSilentLogger("job-tracking-utils-test");

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

beforeEach((): void => {
  mockGetJobStatus.mockClear();
});

test("waitForContentJobs should return empty array for no jobs", async () => {
  const result = await waitForContentJobs([], mockPluginContext, mockLogger);

  expect(result).toEqual([]);
});

test("waitForContentJobs should wait for jobs to complete", async () => {
  mockGetJobStatus
    .mockResolvedValueOnce({
      status: "processing",
    })
    .mockResolvedValueOnce({
      status: "processing",
    })
    .mockResolvedValueOnce({
      status: "completed",
      result: "Generated hero content",
    })
    .mockResolvedValueOnce({
      status: "completed",
      result: "Generated features content",
    });

  const result = await waitForContentJobs(
    mockJobs,
    mockPluginContext,
    mockLogger,
    undefined,
    5000,
  );

  expect(result).toHaveLength(2);
  expect(result[0]?.success).toBe(true);
  expect(result[0]?.jobId).toBe("job-1");
  expect(result[0]?.content).toBe("Generated hero content");
  expect(result[1]?.success).toBe(true);
  expect(result[1]?.jobId).toBe("job-2");
  expect(result[1]?.content).toBe("Generated features content");
});

test("waitForContentJobs should handle job failures", async () => {
  mockGetJobStatus
    .mockResolvedValueOnce({
      status: "completed",
      result: "Generated hero content",
    })
    .mockResolvedValueOnce({
      status: "failed",
      error: "Template not found",
    });

  const result = await waitForContentJobs(
    mockJobs,
    mockPluginContext,
    mockLogger,
    undefined,
    5000,
  );

  expect(result).toHaveLength(2);
  expect(result[0]?.success).toBe(true);
  expect(result[0]?.jobId).toBe("job-1");
  expect(result[1]?.success).toBe(false);
  expect(result[1]?.jobId).toBe("job-2");
  expect(result[1]?.error).toBe("Template not found");
});

test("waitForContentJobs should timeout for long-running jobs", async () => {
  mockGetJobStatus.mockResolvedValue({
    status: "processing",
  });

  expect(
    waitForContentJobs(
      mockJobs,
      mockPluginContext,
      mockLogger,
      undefined,
      100, // Short timeout
    ),
  ).rejects.toThrow(/timeout/);
});

test("waitForContentJobs should handle missing jobs", async () => {
  mockGetJobStatus
    .mockResolvedValueOnce(null) // Job not found
    .mockResolvedValueOnce({
      status: "completed",
      result: "Generated content",
    });

  const result = await waitForContentJobs(
    mockJobs,
    mockPluginContext,
    mockLogger,
    undefined,
    5000,
  );

  expect(result).toHaveLength(2);
  expect(result[0]?.success).toBe(false);
  expect(result[0]?.error).toBe("Job not found");
  expect(result[1]?.success).toBe(true);
});

test("waitForContentJobs should call progress callback", async () => {
  mockGetJobStatus
    .mockResolvedValueOnce({
      status: "completed",
      result: "Generated hero content",
    })
    .mockResolvedValueOnce({
      status: "completed",
      result: "Generated features content",
    });

  const progressCallback = mock();

  await waitForContentJobs(
    mockJobs,
    mockPluginContext,
    mockLogger,
    progressCallback,
    5000,
  );

  expect(progressCallback).toHaveBeenCalled();
  expect(progressCallback).toHaveBeenCalledWith({
    current: 2,
    total: 2,
    message: expect.stringContaining("2 completed, 0 failed, 0 pending"),
    completed: expect.arrayContaining(mockJobs),
    failed: [],
  });
});

test("getContentJobStatuses should return job status summary", async () => {
  mockGetJobStatus
    .mockResolvedValueOnce({
      status: "completed",
      result: "Generated hero content",
    })
    .mockResolvedValueOnce({
      status: "processing",
    });

  const result = await getContentJobStatuses(
    mockJobs,
    mockPluginContext,
    mockLogger,
  );

  expect(result).toEqual({
    total: 2,
    pending: 0,
    processing: 1,
    completed: 1,
    failed: 0,
    jobs: [
      {
        jobId: "job-1",
        sectionId: "hero",
        status: "completed",
      },
      {
        jobId: "job-2",
        sectionId: "features",
        status: "processing",
      },
    ],
  });
});

test("getContentJobStatuses should handle errors gracefully", async () => {
  mockGetJobStatus
    .mockResolvedValueOnce({
      status: "completed",
    })
    .mockRejectedValueOnce(new Error("Network error"));

  const result = await getContentJobStatuses(
    mockJobs,
    mockPluginContext,
    mockLogger,
  );

  expect(result.total).toBe(2);
  expect(result.completed).toBe(1);
  expect(result.failed).toBe(1);
  expect(result.jobs).toHaveLength(2);
  expect(result.jobs[1]?.status).toBe("failed");
  expect(result.jobs[1]?.error).toBe("Network error");
});

test("getContentJobStatuses should handle missing jobs", async () => {
  mockGetJobStatus
    .mockResolvedValueOnce(null) // Job not found
    .mockResolvedValueOnce({
      status: "pending",
    });

  const result = await getContentJobStatuses(
    mockJobs,
    mockPluginContext,
    mockLogger,
  );

  expect(result.total).toBe(2);
  expect(result.pending).toBe(1);
  expect(result.failed).toBe(1);
  expect(result.jobs[0]?.status).toBe("failed");
  expect(result.jobs[0]?.error).toBe("Job not found");
  expect(result.jobs[1]?.status).toBe("pending");
});
