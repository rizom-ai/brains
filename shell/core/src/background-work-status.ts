import type {
  JobExecutionRegistration,
  JobQueueDiagnostics,
} from "@brains/job-queue";
import type { BackgroundWorkInfo } from "@brains/plugins";

export const UNCLAIMED_JOB_DEGRADED_AFTER_MS: number = 2 * 60_000;

export function findUndeclaredActiveJobTypes(
  diagnostics: JobQueueDiagnostics,
  registrations: readonly JobExecutionRegistration[],
): JobQueueDiagnostics["byType"] {
  const declaredTypes = new Set(
    registrations.map((registration) => registration.type),
  );
  return diagnostics.byType.filter(
    (entry) =>
      (entry.status === "pending" || entry.status === "processing") &&
      !declaredTypes.has(entry.type),
  );
}

export function summarizeBackgroundWork(
  diagnostics: JobQueueDiagnostics,
  registrations?: readonly JobExecutionRegistration[],
): BackgroundWorkInfo {
  const sessions = diagnostics.workerSessions;
  const workerState: BackgroundWorkInfo["worker"]["state"] =
    sessions.active === 0 ? "missing" : sessions.stale > 0 ? "stale" : "active";
  const queueStalled =
    diagnostics.duePending > 0 &&
    (diagnostics.oldestDuePendingAgeMs ?? 0) >=
      UNCLAIMED_JOB_DEGRADED_AFTER_MS &&
    diagnostics.totals.processing === 0 &&
    (diagnostics.latestClaimAgeMs === null ||
      diagnostics.latestClaimAgeMs >= UNCLAIMED_JOB_DEGRADED_AFTER_MS);

  const reasons: string[] = [];
  if (workerState === "missing") {
    reasons.push("No live worker session");
  } else if (workerState === "stale") {
    reasons.push(`${sessions.stale} stale worker session(s)`);
  }
  if (queueStalled) {
    reasons.push(
      `${diagnostics.duePending} due job(s) have remained unclaimed for at least ${UNCLAIMED_JOB_DEGRADED_AFTER_MS}ms`,
    );
  }
  if (registrations) {
    const undeclaredCount = findUndeclaredActiveJobTypes(
      diagnostics,
      registrations,
    ).reduce((total, entry) => total + entry.count, 0);
    if (undeclaredCount > 0) {
      reasons.push(
        `${undeclaredCount} active job(s) have no declared executor`,
      );
    }
  }

  return {
    status: reasons.length === 0 ? "operational" : "degraded",
    reasons,
    worker: {
      state: workerState,
      activeSessions: sessions.active,
      staleSessions: sessions.stale,
      latestHeartbeatAgeMs: sessions.latestHeartbeatAgeMs,
    },
    queue: {
      duePending: diagnostics.duePending,
      processing: diagnostics.totals.processing,
      oldestDuePendingAgeMs: diagnostics.oldestDuePendingAgeMs,
      latestClaimAgeMs: diagnostics.latestClaimAgeMs,
      stalled: queueStalled,
    },
  };
}
