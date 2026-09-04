import { describe, expect, it } from "bun:test";
import type { JobQueueDiagnostics } from "@brains/job-queue";
import { summarizeBackgroundWork } from "../src/background-work-status";

function diagnostics(
  overrides: Partial<JobQueueDiagnostics> = {},
): JobQueueDiagnostics {
  return {
    totals: { pending: 0, processing: 0, completed: 0, failed: 0 },
    byType: [],
    oldestPendingAgeMs: null,
    duePending: 0,
    oldestDuePendingAgeMs: null,
    latestClaimAgeMs: null,
    oldestProcessingAgeMs: null,
    staleLeaseCount: 0,
    workerSessions: {
      total: 1,
      active: 1,
      stale: 0,
      latestHeartbeatAgeMs: 1_000,
    },
    ...overrides,
  };
}

describe("summarizeBackgroundWork", () => {
  it("reports active durable worker sessions", () => {
    expect(summarizeBackgroundWork(diagnostics())).toMatchObject({
      status: "operational",
      reasons: [],
      worker: { state: "active", activeSessions: 1, staleSessions: 0 },
      queue: { stalled: false },
    });
  });

  it("reports a missing live worker without reading worker memory", () => {
    expect(
      summarizeBackgroundWork(
        diagnostics({
          workerSessions: {
            total: 1,
            active: 0,
            stale: 1,
            latestHeartbeatAgeMs: 20_000,
          },
        }),
      ),
    ).toMatchObject({
      status: "degraded",
      reasons: ["No live worker session"],
      worker: { state: "missing", activeSessions: 0, staleSessions: 1 },
    });
  });

  it("reports stale sessions alongside an active worker", () => {
    expect(
      summarizeBackgroundWork(
        diagnostics({
          workerSessions: {
            total: 2,
            active: 1,
            stale: 1,
            latestHeartbeatAgeMs: 1_000,
          },
        }),
      ),
    ).toMatchObject({
      status: "degraded",
      reasons: ["1 stale worker session(s)"],
      worker: { state: "stale", activeSessions: 1, staleSessions: 1 },
    });
  });

  it("reports active job types missing from the execution inventory", () => {
    expect(
      summarizeBackgroundWork(
        diagnostics({
          totals: { pending: 0, processing: 1, completed: 3, failed: 0 },
          byType: [
            { type: "skill:project", status: "processing", count: 1 },
            { type: "note:embedding", status: "completed", count: 3 },
          ],
        }),
        [{ type: "note:embedding", pluginId: "note" }],
      ),
    ).toMatchObject({
      status: "degraded",
      reasons: ["1 active job(s) have no declared executor"],
    });
  });

  it("requires old due work, no processing, and no recent claim to report a stall", () => {
    expect(
      summarizeBackgroundWork(
        diagnostics({
          totals: { pending: 2, processing: 0, completed: 0, failed: 0 },
          duePending: 2,
          oldestDuePendingAgeMs: 120_000,
          latestClaimAgeMs: 120_000,
        }),
      ).queue.stalled,
    ).toBe(true);

    expect(
      summarizeBackgroundWork(
        diagnostics({
          totals: { pending: 2, processing: 0, completed: 1, failed: 0 },
          duePending: 2,
          oldestDuePendingAgeMs: 120_000,
          latestClaimAgeMs: 1_000,
        }),
      ).queue.stalled,
    ).toBe(false);
  });
});
