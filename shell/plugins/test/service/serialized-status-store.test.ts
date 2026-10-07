import { describe, expect, it } from "bun:test";
import { waitUntil } from "@brains/test-utils";
import { deferred } from "@brains/utils/deferred";
import { z } from "@brains/utils/zod";
import { prepareRuntimeStateValue } from "@brains/runtime-state";
import type {
  IRuntimeStateNamespace,
  IRuntimeStateStore,
  RuntimeStateRecordValue,
  RuntimeStateScopeOptions,
} from "@brains/runtime-state";
import { SerializedStatusStore } from "../../src/service/serialized-status-store";

interface Counter {
  total: number;
  notes: string[];
}

const counterSchema: z.ZodType<Counter> = z.object({
  total: z.number().int().nonnegative(),
  notes: z.array(z.string()).max(3),
});

const NAMESPACE = "test.counter";

function createEmpty(): Counter {
  return { total: 0, notes: [] };
}

interface MemoryNamespace {
  runtimeState: IRuntimeStateNamespace;
  /** How many times the backing store was read. */
  reads: () => number;
  /** How many times the backing store was written. */
  writes: () => number;
  seed: (key: string, value: unknown) => void;
  peek: (key: string) => unknown;
}

function createMemoryNamespace(
  hooks: {
    beforeRead?: () => void | Promise<void>;
    beforeWrite?: () => void | Promise<void>;
  } = {},
): MemoryNamespace {
  const records = new Map<string, unknown>();
  let reads = 0;
  let writes = 0;

  const runtimeState: IRuntimeStateNamespace = {
    scoped: <T, TInput = T>(
      options: RuntimeStateScopeOptions<T, TInput>,
    ): IRuntimeStateStore<T, TInput> => ({
      get: async (key): Promise<T | null> => {
        reads += 1;
        await hooks.beforeRead?.();
        const record = records.get(`${options.namespace}:${key}`);
        return record === undefined ? null : options.schema.parse(record);
      },
      has: async (key): Promise<boolean> =>
        records.has(`${options.namespace}:${key}`),
      set: async (key, value): Promise<void> => {
        writes += 1;
        await hooks.beforeWrite?.();
        records.set(
          `${options.namespace}:${key}`,
          prepareRuntimeStateValue(options.schema, value),
        );
      },
      setIfNotExists: async (): Promise<boolean> => false,
      compareAndSet: async (): Promise<boolean> => {
        throw new Error("Unexpected compare-and-set in status fixture");
      },
      delete: async (key): Promise<boolean> =>
        records.delete(`${options.namespace}:${key}`),
      list: async (): Promise<RuntimeStateRecordValue<T>[]> => [],
      clear: async (): Promise<number> => 0,
    }),
  };

  return {
    runtimeState,
    reads: () => reads,
    writes: () => writes,
    seed: (key, value) => records.set(`${NAMESPACE}:${key}`, value),
    peek: (key) => records.get(`${NAMESPACE}:${key}`),
  };
}

function createStore(memory: MemoryNamespace): SerializedStatusStore<Counter> {
  return new SerializedStatusStore<Counter>({
    runtimeState: memory.runtimeState,
    namespace: NAMESPACE,
    schema: counterSchema,
    createEmpty,
  });
}

describe("SerializedStatusStore", () => {
  it("starts from the empty state and persists mutations", async () => {
    const memory = createMemoryNamespace();
    const store = createStore(memory);

    await store.mutate((state) => {
      state.total += 2;
      state.notes.push("first");
    });

    expect(memory.peek("current")).toEqual({ total: 2, notes: ["first"] });
  });

  it("loads previously stored state instead of the empty state", async () => {
    const memory = createMemoryNamespace();
    memory.seed("current", { total: 7, notes: ["stored"] });
    const store = createStore(memory);

    expect(await store.snapshot()).toEqual({ total: 7, notes: ["stored"] });
  });

  it("returns the mutation's own result", async () => {
    const store = createStore(createMemoryNamespace());

    const result = await store.mutate((state) => {
      state.total = 5;
      return `total=${state.total}`;
    });

    expect(result).toBe("total=5");
  });

  it("reads the backing store only once across many mutations", async () => {
    const memory = createMemoryNamespace();
    const store = createStore(memory);

    await store.mutate((state) => {
      state.total += 1;
    });
    await store.mutate((state) => {
      state.total += 1;
    });
    await store.snapshot();

    expect(memory.reads()).toBe(1);
    expect(memory.writes()).toBe(2);
  });

  it("serializes concurrent mutations without losing updates", async () => {
    const memory = createMemoryNamespace();
    const store = createStore(memory);

    await Promise.all(
      Array.from({ length: 25 }, () =>
        store.mutate((state) => {
          state.total += 1;
        }),
      ),
    );

    expect((await store.snapshot()).total).toBe(25);
  });

  it("holds the queue across an async mutation", async () => {
    const memory = createMemoryNamespace();
    const store = createStore(memory);
    const order: string[] = [];

    // Held open rather than slow: the second mutation must wait however long
    // the first takes, so the queue is tested against a mutation that has
    // definitely not finished rather than one that probably has not.
    const finishSlowMutation = deferred();
    const slow = store.mutate(async (state) => {
      order.push("slow:start");
      await finishSlowMutation.promise;
      state.total += 1;
      order.push("slow:end");
    });
    const fast = store.mutate((state) => {
      order.push("fast");
      state.total += 1;
    });

    await waitUntil(
      () => order.includes("slow:start"),
      "the first mutation to start",
    );
    expect(order).not.toContain("fast");

    finishSlowMutation.resolve();
    await Promise.all([slow, fast]);

    // The second mutation must not observe or overwrite the first mid-flight.
    expect(order).toEqual(["slow:start", "slow:end", "fast"]);
    expect((await store.snapshot()).total).toBe(2);
  });

  it("persists what an async mutation wrote, not the pre-await state", async () => {
    const memory = createMemoryNamespace();
    const store = createStore(memory);

    await store.mutate(async (state) => {
      await Promise.resolve();
      state.total = 6;
      state.notes.push("after await");
    });

    expect(memory.peek("current")).toEqual({
      total: 6,
      notes: ["after await"],
    });
  });

  it("keeps the queue usable after a mutation throws", async () => {
    const memory = createMemoryNamespace();
    const store = createStore(memory);

    const failure = store.mutate((state) => {
      state.notes.push("must not commit");
      throw new Error("mutation boom");
    });
    const recovery = store.mutate((state) => {
      state.total = 3;
    });

    let caught: unknown;
    try {
      await failure;
    } catch (error) {
      caught = error;
    }
    await recovery;

    expect(caught).toBeInstanceOf(Error);
    expect(await store.snapshot()).toEqual({ total: 3, notes: [] });
    expect(memory.peek("current")).toEqual({ total: 3, notes: [] });
  });

  it("rejects a mutation that leaves the state invalid, without persisting it", async () => {
    const memory = createMemoryNamespace();
    const store = createStore(memory);
    await store.mutate((state) => {
      state.total = 1;
    });

    let caught: unknown;
    try {
      // The schema caps notes at 3 entries.
      await store.mutate((state) => {
        state.notes = ["a", "b", "c", "d"];
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
    expect(memory.peek("current")).toEqual({ total: 1, notes: [] });
    expect(await store.snapshot()).toEqual({ total: 1, notes: [] });
    await store.mutate((state) => {
      state.total += 1;
    });
    expect(await store.snapshot()).toEqual({ total: 2, notes: [] });
    expect(memory.peek("current")).toEqual({ total: 2, notes: [] });
  });

  it("keeps the committed cache after a write fails and permits recovery", async () => {
    const original = new Error("write failed");
    let fail = false;
    const memory = createMemoryNamespace({
      beforeWrite: () => {
        if (fail) throw original;
      },
    });
    const store = createStore(memory);
    await store.mutate((state) => {
      state.total = 1;
    });
    fail = true;
    const failure = await store
      .mutate((state) => {
        state.total = 99;
        state.notes.push("failed write");
      })
      .catch((error: unknown) => error);
    expect(failure).toBe(original);
    expect(await store.snapshot()).toEqual({ total: 1, notes: [] });
    expect(memory.peek("current")).toEqual({ total: 1, notes: [] });
    fail = false;
    await store.mutate((state) => {
      state.total += 1;
    });
    expect(await store.snapshot()).toEqual({ total: 2, notes: [] });
    expect(memory.peek("current")).toEqual({ total: 2, notes: [] });
  });

  it("detaches retained drafts and returned values before asynchronous persistence", async () => {
    const gate = deferred();
    const memory = createMemoryNamespace({ beforeWrite: () => gate.promise });
    const store = createStore(memory);
    let retained: Counter | undefined;
    const write = store.mutate((state) => {
      retained = state;
      state.total = 1;
      return state.notes;
    });
    await waitUntil(() => memory.writes() === 1, "write to start");
    if (!retained) throw new Error("No mutation draft captured");
    retained.total = 99;
    gate.resolve();
    const returned = await write;
    returned.push("outside mutation");
    expect(await store.snapshot()).toEqual({ total: 1, notes: [] });
    await store.mutate((state) => {
      state.total += 1;
    });
    expect(memory.peek("current")).toEqual({ total: 2, notes: [] });
  });

  it("coalesces failed initial reads and retries without memoizing rejection", async () => {
    const original = new Error("read failed");
    const gate = deferred();
    let fail = true;
    const memory = createMemoryNamespace({
      beforeRead: async () => {
        if (fail) {
          await gate.promise;
          throw original;
        }
      },
    });
    memory.seed("current", { total: 7, notes: [] });
    const store = createStore(memory);
    const failed = Promise.allSettled([store.snapshot(), store.snapshot()]);
    await waitUntil(() => memory.reads() === 1, "read to start");
    gate.resolve();
    expect(await failed).toEqual([
      { status: "rejected", reason: original },
      { status: "rejected", reason: original },
    ]);
    expect(memory.reads()).toBe(1);
    fail = false;
    expect(await Promise.all([store.snapshot(), store.snapshot()])).toEqual([
      { total: 7, notes: [] },
      { total: 7, notes: [] },
    ]);
    await store.mutate((state) => {
      state.total += 1;
    });
    expect(await store.snapshot()).toEqual({ total: 8, notes: [] });
    expect(memory.peek("current")).toEqual({ total: 8, notes: [] });
    expect(memory.reads()).toBe(2);
  });

  it("retries mutation after an unreadable initial record is repaired", async () => {
    const memory = createMemoryNamespace();
    memory.seed("current", { total: -1, notes: [] });
    const store = createStore(memory);
    let calls = 0;
    const mutation = (state: Counter): void => {
      calls += 1;
      state.total += 1;
    };
    const failure = await store
      .mutate(mutation)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(z.ZodError);
    expect(calls).toBe(0);
    memory.seed("current", { total: 4, notes: [] });
    await store.mutate(mutation);
    expect(calls).toBe(1);
    expect(await store.snapshot()).toEqual({ total: 5, notes: [] });
    expect(memory.peek("current")).toEqual({ total: 5, notes: [] });
    expect(memory.reads()).toBe(2);
  });

  it("settles pending writes before returning a snapshot", async () => {
    const memory = createMemoryNamespace();
    const store = createStore(memory);

    // Deliberately not awaited: snapshot() must still observe it.
    void store.mutate((state) => {
      state.total = 9;
    });

    expect((await store.snapshot()).total).toBe(9);
  });

  it("returns a clone so callers cannot mutate stored state", async () => {
    const memory = createMemoryNamespace();
    const store = createStore(memory);
    await store.mutate((state) => {
      state.notes.push("kept");
    });

    const snapshot = await store.snapshot();
    snapshot.notes.push("leaked");
    snapshot.total = 99;

    expect(await store.snapshot()).toEqual({ total: 0, notes: ["kept"] });
  });

  it("honours a custom key", async () => {
    const memory = createMemoryNamespace();
    const store = new SerializedStatusStore<Counter>({
      runtimeState: memory.runtimeState,
      namespace: NAMESPACE,
      schema: counterSchema,
      createEmpty,
      key: "status",
    });

    await store.mutate((state) => {
      state.total = 4;
    });

    expect(memory.peek("status")).toEqual({ total: 4, notes: [] });
    expect(memory.peek("current")).toBeUndefined();
  });
});
