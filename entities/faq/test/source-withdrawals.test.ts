import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { RuntimeStateService } from "@brains/runtime-state";
import { migrateRuntimeState } from "@brains/runtime-state/migrate";
import {
  createSilentLogger,
  createTestDirectory,
  caughtError,
} from "@brains/test-utils";
import {
  sourceWithdrawals,
  enqueueWithdrawal,
  resumeWithdrawals,
} from "../src/lib/source-withdrawals";

describe("pending source withdrawals (SQLite state, simulated queue lifecycle)", () => {
  let directory: Awaited<ReturnType<typeof createTestDirectory>>;
  let state: RuntimeStateService;
  let store: ReturnType<typeof sourceWithdrawals>;
  async function open(): Promise<void> {
    const config = { url: `file:${directory.dir}/state.db` };
    await migrateRuntimeState(config, createSilentLogger());
    state = RuntimeStateService.createFresh(config, createSilentLogger());
    await state.initialize();
    store = sourceWithdrawals(state);
  }
  beforeEach(async () => {
    directory = await createTestDirectory("faq-withdrawals");
    await open();
  });
  afterEach(async () => {
    state.close();
    await directory.cleanup();
  });

  it("retains an enqueue failure through reopen and reschedules pruned work with the same withdrawal identity", async () => {
    await store.setIfNotExists("event", { sourceId: "network-piece:source" });
    const failure = await enqueueWithdrawal(
      store,
      {
        find: async () => null,
        enqueue: async () => {
          throw new Error("Queue unavailable");
        },
      },
      "event",
    ).catch(caughtError);
    expect(caughtError(failure).message).toBe("Queue unavailable");
    state.close();
    await open();
    const requests: unknown[] = [];
    const jobs: Parameters<typeof enqueueWithdrawal>[1] = {
      find: async () => null,
      enqueue: async (definition, data) => {
        requests.push({ type: definition.name, data });
        return { id: `job-${requests.length}`, status: async () => null };
      },
    };
    await resumeWithdrawals(store, jobs, new AbortController().signal);
    expect(await store.get("event")).toEqual({
      sourceId: "network-piece:source",
      jobId: "job-1",
    });
    // The referenced job is no longer in the queue. This is still the same work.
    await resumeWithdrawals(store, jobs, new AbortController().signal);
    expect(requests).toEqual([
      {
        type: "faq-source-review",
        data: { sourceId: "network-piece:source", withdrawalId: "event" },
      },
      {
        type: "faq-source-review",
        data: { sourceId: "network-piece:source", withdrawalId: "event" },
      },
    ]);
    expect((await store.get("event"))?.jobId).toBe("job-2");
  });

  it("does not resurrect a completed record when enqueue acknowledgement races completion", async () => {
    await store.setIfNotExists("event", { sourceId: "network-piece:source" });
    await enqueueWithdrawal(
      store,
      {
        find: async () => null,
        enqueue: async () => {
          await store.delete("event");
          return { id: "job", status: async (): Promise<null> => null };
        },
      },
      "event",
    );
    expect(await store.has("event")).toBe(false);
  });

  it("visits more than one bounded state page and respects cancellation", async () => {
    for (let index = 0; index < 103; index++)
      await store.setIfNotExists(`event-${index}`, {
        sourceId: "network-piece:source",
      });
    const seen: unknown[] = [];
    const jobs: Parameters<typeof enqueueWithdrawal>[1] = {
      find: async () => null,
      enqueue: async (_definition, data) => {
        seen.push(data);
        return { id: `job-${seen.length}`, status: async () => null };
      },
    };
    await resumeWithdrawals(store, jobs, new AbortController().signal);
    expect(seen).toHaveLength(103);
    expect(new Set(seen.map((entry) => JSON.stringify(entry))).size).toBe(103);
    const controller = new AbortController();
    controller.abort();
    expect(
      await resumeWithdrawals(store, jobs, controller.signal).catch(
        caughtError,
      ),
    ).toBeInstanceOf(Error);
    expect(seen).toHaveLength(103);
  });
});
