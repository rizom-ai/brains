import { describe, expect, it } from "bun:test";
import {
  RuntimeReadinessSchema,
  type RuntimeReadiness,
} from "../../src/contracts/runtime-health";

const validReport: RuntimeReadiness = {
  status: "ready",
  operationalStatus: "operational",
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
      duePending: 1,
      oldestDuePendingAgeMs: 20,
      latestClaimAgeMs: 10,
      oldestProcessingAgeMs: 10,
      staleLeaseCount: 0,
      workerSessions: {
        total: 1,
        active: 1,
        stale: 0,
        latestHeartbeatAgeMs: 100,
      },
    },
    projection: {
      initialized: true,
      trackedRoots: 2,
      openCircuits: [],
    },
    worker: {
      total: 1,
      active: 1,
      stale: 0,
      latestHeartbeatAgeMs: 100,
    },
  },
};

describe("RuntimeReadinessSchema", () => {
  it("validates structured readiness checks and resource signals", () => {
    expect(RuntimeReadinessSchema.parse(validReport)).toEqual(validReport);
  });

  it("accepts degraded operational checks without failing routing readiness", () => {
    const degradedReport: RuntimeReadiness = {
      ...validReport,
      operationalStatus: "degraded",
      checks: [
        {
          name: "job-worker",
          status: "degraded",
          message: "No live worker session",
        },
      ],
    };

    expect(RuntimeReadinessSchema.parse(degradedReport)).toEqual(
      degradedReport,
    );
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
