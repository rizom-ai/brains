import { getErrorMessage } from "@brains/utils/error";
import { BrokerConnection } from "./client";

/**
 * What the checkout's owner is doing, asked on request.
 *
 * A wedged owner does not exit, so liveness of the process proves nothing.
 * These are the durable facts instead: whether anything answers on the socket,
 * what it has in flight, and how long since that work last advanced.
 *
 * This degrades `/health/operate` only. Routing readiness stays independent —
 * a checkout that cannot be written is not a reason to take the Brain out of
 * rotation, and conflating the two turns a Git outage into a site outage.
 */

/**
 * How long an operation may show no progress before its owner is treated as
 * wedged. Shared with the supervisor so a health report and a termination
 * decision cannot disagree about what stalled means, and comfortably longer
 * than the broker’s own 120s stall timeout so an operation the broker is already
 * failing is not taken from it.
 */
export const BROKER_PROGRESS_TIMEOUT_MS = 300_000;
/** Internal only: shortens the real-process recovery fixture, never config. */
export const GIT_BROKER_TEST_PROGRESS_TIMEOUT_ENV =
  "BRAIN_TEST_GIT_BROKER_PROGRESS_TIMEOUT_MS";

export function resolveBrokerProgressTimeoutMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const configured = Number(env[GIT_BROKER_TEST_PROGRESS_TIMEOUT_ENV]);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : BROKER_PROGRESS_TIMEOUT_MS;
}

export interface BrokerActivity {
  activeRequestIds: string[];
  queuedRequestIds: string[];
  oldestActiveProgressAt: number | null;
  /** Work the previous generation left with no observed outcome. */
  ambiguousRequestIds: string[];
  evidenceComplete: boolean;
  /** Historical evidence degrades health only until replay accounts for it. */
  recoveryPending: boolean;
}

export interface BrokerHealthOptions {
  probe: () => Promise<BrokerActivity>;
  now: () => number;
  progressTimeoutMs: number;
}

interface HealthResult {
  status: "healthy" | "degraded" | "unhealthy";
  message?: string | undefined;
  details?: Record<string, unknown> | undefined;
}

/**
 * A short-lived connection per check.
 *
 * Reusing a role's own client would make the answer depend on that client's
 * state; opening one here means "the socket answered" is part of what the
 * check establishes rather than something it assumes.
 */
export function probeBrokerActivity(
  socketPath: string,
): () => Promise<BrokerActivity> {
  return async (): Promise<BrokerActivity> => {
    const connection = await BrokerConnection.connect(socketPath);
    try {
      const status = await connection.status();
      return {
        activeRequestIds: status.activeRequestIds,
        queuedRequestIds: status.queuedRequestIds,
        oldestActiveProgressAt: status.oldestActiveProgressAt,
        ambiguousRequestIds: status.ambiguousRequestIds,
        evidenceComplete: status.evidenceComplete,
        recoveryPending: status.recoveryPending,
      };
    } finally {
      connection.close();
    }
  };
}

export function createBrokerHealthCheck(
  options: BrokerHealthOptions,
): () => Promise<HealthResult> {
  return async (): Promise<HealthResult> => {
    const activity = await options.probe().then(
      (value) => value,
      (error: unknown) => error,
    );

    if (!isActivity(activity)) {
      return {
        status: "unhealthy",
        message: "No Git checkout owner answered",
        details: { error: getErrorMessage(activity) },
      };
    }

    // Reported before staleness: a replacement carrying unresolved work is
    // degraded whether or not anything is running right now.
    if (activity.recoveryPending) {
      return {
        status: "degraded",
        message: activity.evidenceComplete
          ? `Previous Git owner left ${activity.ambiguousRequestIds.length} request(s) unaccounted for`
          : "Previous Git owner's record could not be read whole",
        details: {
          ambiguousRequestIds: activity.ambiguousRequestIds,
          evidenceComplete: activity.evidenceComplete,
        },
      };
    }

    if (activity.oldestActiveProgressAt === null) {
      return { status: "healthy" };
    }

    const staleMs = options.now() - activity.oldestActiveProgressAt;
    if (staleMs < options.progressTimeoutMs) {
      return { status: "healthy" };
    }

    return {
      status: "degraded",
      message: `Git operation has made no progress for ${staleMs}ms`,
      details: {
        activeRequestIds: activity.activeRequestIds,
        queuedRequestIds: activity.queuedRequestIds,
        staleMs,
        timeoutMs: options.progressTimeoutMs,
      },
    };
  };
}

function isActivity(value: unknown): value is BrokerActivity {
  return (
    typeof value === "object" &&
    value !== null &&
    "activeRequestIds" in value &&
    "queuedRequestIds" in value &&
    "ambiguousRequestIds" in value &&
    "evidenceComplete" in value &&
    "recoveryPending" in value &&
    "oldestActiveProgressAt" in value
  );
}
