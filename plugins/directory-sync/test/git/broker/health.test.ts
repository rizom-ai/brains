import { describe, expect, it, mock } from "bun:test";
import { createBrokerHealthCheck } from "../../../src/lib/broker/health";
import type { BrokerActivity } from "../../../src/lib/broker/health";

/**
 * Health is evaluated from durable facts on request, not from a background
 * poller: the question is whether an owner answers and what it inherited.
 * `/health/live` and `/health/ready` stay independent — a checkout that cannot
 * be written is not a reason to take the Brain out of rotation.
 */

/** A healthy owner: answering, nothing inherited. */
const ANSWERING: BrokerActivity = {
  ambiguousRequestIds: [],
  evidenceComplete: true,
  recoveryPending: false,
};

function check(
  probe: () => Promise<BrokerActivity>,
): ReturnType<typeof createBrokerHealthCheck> {
  return createBrokerHealthCheck({ probe });
}

describe("broker health", () => {
  it("is healthy when an owner answers with nothing inherited", async () => {
    const result = await check(async () => ANSWERING)();

    expect(result.status).toBe("healthy");
  });

  it("is unhealthy when no owner answers", async () => {
    // Not "degraded": with no reachable owner no Git work can happen at all,
    // and saying so is the difference between a slow sync and a stopped one.
    const result = await check(async () => {
      throw new Error(
        "Git broker at /run/brain/git-broker.sock is unavailable",
      );
    })();

    expect(result.status).toBe("unhealthy");
    expect(result.message).toBe("No Git checkout owner answered");
  });

  it("says nothing a probe did not establish", async () => {
    // The check is the only thing that talks to the broker here, so a health
    // request must not be able to report anything it never observed.
    const probe = mock(async () => ANSWERING);
    await check(probe)();

    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("degrades while a replacement carries unresolved work", async () => {
    // A replacement that inherited an unsettled mutation is not healthy just
    // because it answers: something may have landed that nobody enqueued.
    const result = await check(async () => ({
      ...ANSWERING,
      ambiguousRequestIds: ["req_inherited0001"],
      recoveryPending: true,
    }))();

    expect(result.status).toBe("degraded");
    expect(result.details).toMatchObject({
      ambiguousRequestIds: ["req_inherited0001"],
    });
  });

  it("degrades when the previous record could not be read whole", async () => {
    const result = await check(async () => ({
      ...ANSWERING,
      evidenceComplete: false,
      recoveryPending: true,
    }))();

    expect(result.status).toBe("degraded");
    expect(result.message).toContain("whole");
  });

  it("becomes healthy once inherited work is reconciled", async () => {
    const result = await check(async () => ({
      ambiguousRequestIds: ["req_reconciled001"],
      evidenceComplete: false,
      recoveryPending: false,
    }))();

    expect(result.status).toBe("healthy");
  });
});
