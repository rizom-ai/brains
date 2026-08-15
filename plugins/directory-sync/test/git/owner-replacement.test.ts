import { describe, expect, it, mock } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { createOwnerReplacementHandler } from "../../src/lib/git-owner-replacement";

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
  const scheduled: Array<() => Promise<void>> = [];
  return {
    scheduleTrailing: mock(
      (_key: string, _delayMs: number, operation: () => Promise<void>) => {
        scheduled.push(operation);
      },
    ),
    run: async (): Promise<void> => {
      for (const operation of scheduled.splice(0)) await operation();
    },
  };
}

describe("replaced git owner", () => {
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
    expect(replay).toHaveBeenCalledTimes(2);
  });

  it("keeps the role running when the replay itself fails", async () => {
    const runtime = scheduler();
    const logger = createSilentLogger();
    const error = mock(() => {});
    createOwnerReplacementHandler({
      logger: Object.assign(Object.create(logger), { error }),
      scheduler: { scheduleTrailing: runtime.scheduleTrailing },
      replay: async () => {
        throw new Error("the replacement is not ready either");
      },
    })("broker-2");

    // A failed reconciliation is reported and retried by the next trigger; it
    // must not take down a web or worker that is otherwise healthy.
    await runtime.run();
    expect(error).toHaveBeenCalledTimes(1);
  });
});
