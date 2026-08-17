import { describe, expect, it, mock } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import {
  createOwnerRecoveryReplay,
  createOwnerReplacementHandler,
} from "../../src/lib/git-owner-replacement";

/**
 * Phase 3 of docs/plans/directory-sync-git-execution-broker.md.
 *
 * A replaced broker leaves this role running with an ambiguous past: whatever
 * the old owner was executing may or may not have landed, and the client
 * deliberately refuses to re-run it from intent. Repository state settles it.
 */

function scheduler(): {
  scheduleTrailing: ReturnType<typeof mock>;
  run(): Promise<void>;
} {
  const scheduled = new Map<string, () => Promise<void>>();
  return {
    scheduleTrailing: mock(
      (key: string, _delayMs: number, operation: () => Promise<void>) => {
        scheduled.set(key, operation);
      },
    ),
    run: async (): Promise<void> => {
      const operations = [...scheduled.values()];
      scheduled.clear();
      for (const operation of operations) await operation();
    },
  };
}

describe("replaced git owner", () => {
  it("reconciles and opens the same attached generation", async () => {
    const active = {
      admitsMutations: mock(async () => false),
      openAdmission: mock(async () => {}),
    };
    const candidate = {
      admitsMutations: mock(async () => false),
      openAdmission: mock(async () => {}),
    };
    const replay = mock(async (client: typeof candidate) => {
      expect(client).toBe(candidate);
    });
    const recover = createOwnerRecoveryReplay({
      client: () => candidate,
      replay,
    });

    await recover();

    expect(candidate.admitsMutations).toHaveBeenCalledTimes(1);
    expect(replay).toHaveBeenCalledTimes(1);
    expect(candidate.openAdmission).toHaveBeenCalledTimes(1);
    expect(active.admitsMutations).not.toHaveBeenCalled();
    expect(active.openAdmission).not.toHaveBeenCalled();
  });

  it("replays from the checkout rather than re-running the lost intent", async () => {
    const replay = mock(async () => {});
    const runtime = scheduler();

    createOwnerReplacementHandler({
      logger: createSilentLogger(),
      scheduler: { scheduleTrailing: runtime.scheduleTrailing },
      replay,
    })("broker-2");

    // Scheduled, not awaited: this is reported from inside the operation that
    // reattached, so replaying there would re-enter a client mid-call.
    expect(runtime.scheduleTrailing).toHaveBeenCalledTimes(1);
    expect(replay).not.toHaveBeenCalled();

    await runtime.run();
    expect(replay).toHaveBeenCalledTimes(1);
  });

  it("collapses a burst of replacements into one replay", async () => {
    const replay = mock(async () => {});
    const runtime = scheduler();
    const handler = createOwnerReplacementHandler({
      logger: createSilentLogger(),
      scheduler: { scheduleTrailing: runtime.scheduleTrailing },
      replay,
    });

    // Every client method that reattaches reports it. Replaying once per
    // report would queue the same delta repeatedly.
    handler("broker-2");
    handler("broker-2");
    expect(runtime.scheduleTrailing.mock.calls.map((call) => call[0])).toEqual([
      "git-owner-replacement",
      "git-owner-replacement",
    ]);

    await runtime.run();
    expect(replay).toHaveBeenCalledTimes(1);
  });

  it("keeps the role running and retries failed replay with bounded backoff", async () => {
    const runtime = scheduler();
    const logger = createSilentLogger();
    const error = mock(() => {});
    let attempts = 0;
    createOwnerReplacementHandler({
      logger: Object.assign(Object.create(logger), { error }),
      scheduler: { scheduleTrailing: runtime.scheduleTrailing },
      replay: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("the replacement is not ready either");
        }
      },
    })("broker-2");

    await runtime.run();
    expect(error).toHaveBeenCalledTimes(1);
    expect(runtime.scheduleTrailing.mock.calls.at(-1)?.[1]).toBe(1_000);

    await runtime.run();
    expect(attempts).toBe(2);
    // Success ends the retry chain instead of polling forever.
    await runtime.run();
    expect(attempts).toBe(2);
  });
});
