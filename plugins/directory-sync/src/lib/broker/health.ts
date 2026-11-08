import { getErrorMessage } from "@brains/utils/error";
import { connectBroker } from "./load-client";

/**
 * Whether a checkout owner answers, and what it inherited, asked on request.
 *
 * An owner that answers is serving Git; one that does not means no Git work
 * can happen at all. A replacement that inherited unsettled work from the
 * owner before it stays degraded until a role has reconciled that work.
 *
 * This degrades `/health/operate` only. Routing readiness stays independent —
 * a checkout that cannot be written is not a reason to take the Brain out of
 * rotation, and conflating the two turns a Git outage into a site outage.
 */

export interface BrokerActivity {
  /** Work the previous generation left with no observed outcome. */
  ambiguousRequestIds: string[];
  evidenceComplete: boolean;
  /** Historical evidence degrades health only until replay accounts for it. */
  recoveryPending: boolean;
}

export interface BrokerHealthOptions {
  probe: () => Promise<BrokerActivity>;
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
    const connection = await connectBroker(socketPath);
    try {
      const status = await connection.status();
      return {
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

    // A replacement carrying unresolved work is degraded until a role has
    // reconciled it, whether or not anything is running right now.
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

    return { status: "healthy" };
  };
}

function isActivity(value: unknown): value is BrokerActivity {
  return (
    typeof value === "object" &&
    value !== null &&
    "ambiguousRequestIds" in value &&
    "evidenceComplete" in value &&
    "recoveryPending" in value
  );
}
