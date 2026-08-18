import { describe, expect, it, mock } from "bun:test";
import {
  BROKER_PROGRESS_TIMEOUT_MS,
  GIT_BROKER_TEST_PROGRESS_TIMEOUT_ENV,
  createBrokerHealthCheck,
  resolveBrokerProgressTimeoutMs,
} from "../../../src/lib/broker/health";
import type { BrokerActivity } from "../../../src/lib/broker/health";

/**
 * Phase 5 of docs/plans/directory-sync-git-execution-broker.md.
 *
 * Health is evaluated from durable facts on request, not from a background
 * poller: the question is what the owner is doing right now. `/health/live`
 * and `/health/ready` stay independent — a checkout that cannot be written is
 * not a reason to take the Brain out of rotation.
 */

/** A healthy owner: something running, nothing inherited. */
const FRESH = {
  activeRequestIds: ["req_working0001"],
  queuedRequestIds: [],
  oldestActiveProgressAt: 9_500,
  ambiguousRequestIds: [],
  evidenceComplete: true,
  recoveryPending: false,
};

function check(
  probe: () => Promise<BrokerActivity>,
  now = 10_000,
): ReturnType<typeof createBrokerHealthCheck> {
  return createBrokerHealthCheck({
    probe,
    now: () => now,
    progressTimeoutMs: 1_000,
  });
}

describe("broker health", () => {
  it("uses a bounded test-only progress threshold when explicitly supplied", () => {
    expect(
      resolveBrokerProgressTimeoutMs({
        [GIT_BROKER_TEST_PROGRESS_TIMEOUT_ENV]: "750",
      }),
    ).toBe(750);
    expect(
      resolveBrokerProgressTimeoutMs({
        [GIT_BROKER_TEST_PROGRESS_TIMEOUT_ENV]: "not-a-number",
      }),
    ).toBe(BROKER_PROGRESS_TIMEOUT_MS);
  });

  it("is healthy when the owner is idle", async () => {
    const result = await check(async () => ({
      ...FRESH,
      activeRequestIds: [],
      oldestActiveProgressAt: null,
    }))();

    expect(result.status).toBe("healthy");
  });

  it("is healthy while an operation keeps advancing", async () => {
    // A long clone that still produces output is working, not stuck. Reporting
    // it as degraded would make every large import look like an incident.
    const result = await check(async () => FRESH)();

    expect(result.status).toBe("healthy");
  });

  it("degrades when an operation stops advancing", async () => {
    const result = await check(async () => ({
      ...FRESH,
      activeRequestIds: ["req_stuck00001"],
      oldestActiveProgressAt: 8_000,
    }))();

    expect(result.status).toBe("degraded");
    expect(result.message).toContain("2000ms");
    expect(result.details).toMatchObject({
      activeRequestIds: ["req_stuck00001"],
      staleMs: 2_000,
    });
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
    expect(result.message).toContain("owner");
  });

  it("says nothing a probe did not establish", async () => {
    // The check is the only thing that talks to the broker here, so a health
    // request must not be able to report staleness it never observed.
    const probe = mock(async () => FRESH);
    await check(probe)();

    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("degrades while a replacement carries unresolved work", async () => {
    // A replacement that inherited an unsettled mutation is not healthy just
    // because it is idle: something may have landed that nobody enqueued.
    const result = await check(async () => ({
      ...FRESH,
      activeRequestIds: [],
      oldestActiveProgressAt: null,
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
      ...FRESH,
      activeRequestIds: [],
      oldestActiveProgressAt: null,
      evidenceComplete: false,
      recoveryPending: true,
    }))();

    expect(result.status).toBe("degraded");
    expect(result.message).toContain("whole");
  });

  it("becomes healthy once inherited work is reconciled", async () => {
    const result = await check(async () => ({
      ...FRESH,
      activeRequestIds: [],
      oldestActiveProgressAt: null,
      ambiguousRequestIds: ["req_reconciled001"],
      evidenceComplete: false,
      recoveryPending: false,
    }))();

    expect(result.status).toBe("healthy");
  });
});
