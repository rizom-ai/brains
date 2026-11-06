import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { RuntimeStateService } from "@brains/runtime-state";
import { migrateRuntimeState } from "@brains/runtime-state/migrate";
import { waitUntil } from "@brains/test-utils";
import { deferred } from "@brains/utils/deferred";
import { z } from "@brains/utils/zod";
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

function createMemoryNamespace(): MemoryNamespace {
  const records = new Map<string, unknown>();
  let reads = 0;
  let writes = 0;

  const runtimeState: IRuntimeStateNamespace = {
    scoped: <T>(
      options: RuntimeStateScopeOptions<T>,
    ): IRuntimeStateStore<T> => ({
      get: async (key): Promise<T | null> => {
        reads += 1;
        const record = records.get(`${options.namespace}:${key}`);
        return record === undefined ? null : options.schema.parse(record);
      },
      has: async (key): Promise<boolean> =>
        records.has(`${options.namespace}:${key}`),
      set: async (key, value): Promise<void> => {
        writes += 1;
        records.set(`${options.namespace}:${key}`, options.schema.parse(value));
      },
      setIfNotExists: async (key, value): Promise<boolean> => {
        const id = `${options.namespace}:${key}`;
        if (records.has(id)) return false;
        writes += 1;
        records.set(id, options.schema.parse(value));
        return true;
      },
      compareAndSet: async (key, expected, value): Promise<boolean> => {
        const id = `${options.namespace}:${key}`;
        if (
          JSON.stringify(records.get(id)) !==
          JSON.stringify(options.schema.parse(expected))
        ) {
          return false;
        }
        writes += 1;
        records.set(id, options.schema.parse(value));
        return true;
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

  it("reads the stored state for every mutation and snapshot", async () => {
    const memory = createMemoryNamespace();
    const store = createStore(memory);

    await store.mutate((state) => {
      state.total += 1;
    });
    memory.seed("current", { total: 10, notes: ["written elsewhere"] });
    await store.mutate((state) => {
      state.total += 1;
    });

    expect(await store.snapshot()).toEqual({
      total: 11,
      notes: ["written elsewhere"],
    });
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

    const failure = store.mutate(() => {
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
    expect((await store.snapshot()).total).toBe(3);
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

/**
 * A brain's web and worker processes each hold a store over the same runtime
 * state; a write from one must never erase what the other wrote.
 */
describe("SerializedStatusStore across processes", () => {
  let tempDir: string;
  let url: string;
  const services: RuntimeStateService[] = [];

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "serialized-status-store-"));
    url = `file:${join(tempDir, "runtime-state.db")}`;
    await migrateRuntimeState({ url });
  });

  afterEach(async () => {
    for (const service of services.splice(0)) service.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  function processStore(): SerializedStatusStore<Counter> {
    const service = RuntimeStateService.createFresh({ url });
    services.push(service);
    return new SerializedStatusStore<Counter>({
      runtimeState: service,
      namespace: NAMESPACE,
      schema: counterSchema,
      createEmpty,
    });
  }

  it("keeps each process's update when they write in turn", async () => {
    const web = processStore();
    const worker = processStore();

    await web.mutate((state) => {
      state.notes.push("web");
    });
    await worker.mutate((state) => {
      state.notes.push("worker");
    });
    await web.mutate((state) => {
      state.total += 1;
    });

    expect(await processStore().snapshot()).toEqual({
      total: 1,
      notes: ["web", "worker"],
    });
  });

  it("reapplies a mutation another process overtook, keeping both", async () => {
    const web = processStore();
    const worker = processStore();
    const webHasRead = deferred();
    const workerHasWritten = deferred();

    const webWrite = web.mutate(async (state) => {
      webHasRead.resolve();
      await workerHasWritten.promise;
      state.notes.push("web");
    });
    await webHasRead.promise;
    await worker.mutate((state) => {
      state.notes.push("worker");
    });
    workerHasWritten.resolve();
    await webWrite;

    expect((await processStore().snapshot()).notes).toEqual(["worker", "web"]);
  });

  it("shows another process's write in a snapshot", async () => {
    const web = processStore();
    const worker = processStore();
    await web.snapshot();

    await worker.mutate((state) => {
      state.total = 4;
    });

    expect((await web.snapshot()).total).toBe(4);
  });
});
