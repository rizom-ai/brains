import { describe, expect, it } from "bun:test";
import {
  RuntimeReadinessSchema,
  type RuntimeReadiness,
} from "../../src/contracts/runtime-health";

const validReport: RuntimeReadiness = {
  status: "ready",
  checkedAt: "2026-07-30T12:00:00.000Z",
  checks: [
    {
      name: "job-worker",
      status: "healthy",
      message: "Worker is accepting claims",
    },
  ],
  resources: {
    memory: {
      rssBytes: 100,
      heapUsedBytes: 50,
      heapTotalBytes: 75,
    },
    fileDescriptors: 12,
    processes: {
      total: 3,
      zombies: 0,
    },
    queue: {
      totals: {
        pending: 1,
        processing: 1,
        completed: 4,
        failed: 0,
      },
      byType: [{ type: "topic:projection", status: "pending", count: 1 }],
      oldestPendingAgeMs: 20,
      oldestProcessingAgeMs: 10,
      staleLeaseCount: 0,
    },
    projection: {
      initialized: true,
      trackedRoots: 2,
      openCircuits: [],
    },
    worker: {
      isRunning: true,
      isHealthy: true,
      activeJobs: 1,
      processedJobs: 4,
      failedJobs: 0,
      uptimeMs: 500,
    },
  },
};

describe("RuntimeReadinessSchema", () => {
  it("validates structured readiness checks and resource signals", () => {
    expect(RuntimeReadinessSchema.parse(validReport)).toEqual(validReport);
  });

  it("rejects invalid queue and process counters", () => {
    expect(() =>
      RuntimeReadinessSchema.parse({
        ...validReport,
        resources: {
          ...validReport.resources,
          processes: { total: 2, zombies: -1 },
        },
      }),
    ).toThrow();
  });
});
