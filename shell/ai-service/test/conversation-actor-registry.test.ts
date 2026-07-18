import { describe, it, expect } from "bun:test";
import {
  ConversationActorRegistry,
  type ConversationActorRegistryOptions,
} from "../src/conversation-actor-registry";
import { Effect } from "@brains/utils/effect";
import type { Clock } from "@brains/utils/effect";
import { TestClock, TestContext } from "@brains/utils/effect/test";

interface FakeActor {
  id: number;
  idle: boolean;
  stopped: boolean;
  stopCalls: number;
  stop(): void;
}

function createRegistry(options?: {
  idleTtlMs?: number;
  maxOperationsPerConversation?: number;
  clock?: Clock.Clock;
}): {
  registry: ConversationActorRegistry<FakeActor>;
  created: FakeActor[];
} {
  const created: FakeActor[] = [];
  const registryOptions: ConversationActorRegistryOptions<FakeActor> = {
    createActor: (): FakeActor => {
      const actor: FakeActor = {
        id: created.length,
        idle: true,
        stopped: false,
        stopCalls: 0,
        stop() {
          this.stopped = true;
          this.stopCalls++;
        },
      };
      created.push(actor);
      return actor;
    },
    isEvictable: (actor: FakeActor): boolean => actor.idle,
    idleTtlMs: options?.idleTtlMs ?? 0,
    ...(options?.maxOperationsPerConversation !== undefined
      ? {
          maxOperationsPerConversation: options.maxOperationsPerConversation,
        }
      : {}),
  };

  // Keep the clock seam out of the package's public Promise API.
  const RegistryWithClock = ConversationActorRegistry as unknown as new (
    registryOptions: ConversationActorRegistryOptions<FakeActor>,
    runtimeOptions?: { clock: Clock.Clock },
  ) => ConversationActorRegistry<FakeActor>;
  const registry = options?.clock
    ? new RegistryWithClock(registryOptions, { clock: options.clock })
    : new ConversationActorRegistry<FakeActor>(registryOptions);
  return { registry, created };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function withRegistryTestClock(
  idleTtlMs: number,
  run: (registry: ConversationActorRegistry<FakeActor>) => Effect.Effect<void>,
): Promise<void> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const clock = yield* TestClock.testClock();
      const { registry } = createRegistry({ idleTtlMs, clock });
      yield* Effect.acquireUseRelease(
        Effect.succeed(registry),
        run,
        (ownedRegistry) => Effect.promise(() => ownedRegistry.close()),
      );
    }).pipe(Effect.provide(TestContext.TestContext)),
  );
}

describe("ConversationActorRegistry", () => {
  describe("acquire and peek", () => {
    it("creates one actor per conversation and reuses it", () => {
      const { registry, created } = createRegistry();

      const first = registry.acquire("conv-a");
      const again = registry.acquire("conv-a");
      const other = registry.acquire("conv-b");

      expect(again).toBe(first);
      expect(other).not.toBe(first);
      expect(created).toHaveLength(2);
    });

    it("peek returns the actor without creating one", () => {
      const { registry, created } = createRegistry();

      expect(registry.peek("conv-a")).toBeUndefined();
      expect(created).toHaveLength(0);

      const actor = registry.acquire("conv-a");
      expect(registry.peek("conv-a")).toBe(actor);
    });
  });

  describe("enqueue", () => {
    it("runs operations for one conversation strictly in FIFO order", async () => {
      const { registry } = createRegistry();
      const order: string[] = [];
      const gate = deferred<void>();

      const first = registry.enqueue("conv-a", async () => {
        await gate.promise;
        order.push("first");
        return "first";
      });
      const second = registry.enqueue("conv-a", async () => {
        order.push("second");
        return "second";
      });

      // Give the second operation every chance to run early if the
      // queue were broken.
      await delay(5);
      expect(order).toEqual([]);

      gate.resolve();
      expect(await first).toBe("first");
      expect(await second).toBe("second");
      expect(order).toEqual(["first", "second"]);
    });

    it("rejects beyond the per-conversation bound with a busy error", async () => {
      const { registry } = createRegistry({ maxOperationsPerConversation: 2 });
      const gate = deferred<void>();

      const first = registry.enqueue("conv-a", () => gate.promise);
      const second = registry.enqueue("conv-a", () => gate.promise);
      const third = registry.enqueue("conv-a", async () => "never");

      const thirdError = await third.then(
        () => null,
        (error: unknown) => error,
      );
      expect(thirdError instanceof Error && thirdError.message).toBe(
        "Conversation is busy. Please wait for earlier messages to finish.",
      );

      gate.resolve();
      await first;
      await second;
    });

    it("frees queue slots once operations finish", async () => {
      const { registry } = createRegistry({ maxOperationsPerConversation: 1 });

      await registry.enqueue("conv-a", async () => "one");
      // Slot bookkeeping settles a microtask after the caller's await
      // resumes; hop the event loop once before re-enqueueing.
      await delay(0);
      const second = await registry.enqueue("conv-a", async () => "two");

      expect(second).toBe("two");
    });

    it("keeps the chain alive after a failed operation", async () => {
      const { registry } = createRegistry();

      const failing = registry.enqueue("conv-a", async () => {
        throw new Error("boom");
      });
      const following = registry.enqueue("conv-a", async () => "recovered");

      const failure = await failing.then(
        () => null,
        (error: unknown) => error,
      );
      expect(failure instanceof Error && failure.message).toBe("boom");
      expect(await following).toBe("recovered");
    });

    it("bounds conversations independently", async () => {
      const { registry } = createRegistry({ maxOperationsPerConversation: 1 });
      const gate = deferred<void>();

      const blocked = registry.enqueue("conv-a", () => gate.promise);
      const other = await registry.enqueue("conv-b", async () => "free");

      expect(other).toBe("free");
      gate.resolve();
      await blocked;
    });
  });

  describe("eviction", () => {
    it("stops and removes an idle actor after the TTL", async () => {
      await withRegistryTestClock(5, (registry) =>
        Effect.gen(function* () {
          const actor = registry.acquire("conv-a");
          yield* Effect.promise(() =>
            registry.enqueue("conv-a", async () => "done"),
          );
          yield* Effect.yieldNow();

          yield* TestClock.adjust(5);
          expect(actor.stopped).toBe(true);
          expect(registry.peek("conv-a")).toBeUndefined();
        }),
      );
    });

    it("does not evict while operations are pending", async () => {
      await withRegistryTestClock(5, (registry) =>
        Effect.gen(function* () {
          const gate = deferred<void>();
          const actor = registry.acquire("conv-a");
          const pending = registry.enqueue("conv-a", () => gate.promise);
          registry.scheduleEviction("conv-a");
          yield* Effect.yieldNow();

          yield* TestClock.adjust(5);
          expect(actor.stopped).toBe(false);
          expect(registry.peek("conv-a")).toBe(actor);

          gate.resolve();
          yield* Effect.promise(() => pending);
        }),
      );
    });

    it("does not evict actors reported non-evictable", async () => {
      await withRegistryTestClock(5, (registry) =>
        Effect.gen(function* () {
          const actor = registry.acquire("conv-a");
          actor.idle = false;
          registry.scheduleEviction("conv-a");
          yield* Effect.yieldNow();

          yield* TestClock.adjust(5);
          expect(actor.stopped).toBe(false);
          expect(registry.peek("conv-a")).toBe(actor);
        }),
      );
    });

    it("cancels a pending eviction when the actor is reacquired", async () => {
      await withRegistryTestClock(5, (registry) =>
        Effect.gen(function* () {
          const actor = registry.acquire("conv-a");
          registry.scheduleEviction("conv-a");
          registry.acquire("conv-a");
          yield* Effect.yieldNow();

          yield* TestClock.adjust(5);
          expect(actor.stopped).toBe(false);
          expect(registry.peek("conv-a")).toBe(actor);
        }),
      );
    });

    it("never schedules eviction when the TTL is disabled", async () => {
      await withRegistryTestClock(0, (registry) =>
        Effect.gen(function* () {
          const actor = registry.acquire("conv-a");
          yield* Effect.promise(() =>
            registry.enqueue("conv-a", async () => "done"),
          );
          registry.scheduleEviction("conv-a");
          yield* TestClock.adjust(5);

          expect(actor.stopped).toBe(false);
          expect(registry.peek("conv-a")).toBe(actor);
        }),
      );
    });
  });

  describe("close", () => {
    it("is terminal and stops every actor exactly once", async () => {
      const { registry, created } = createRegistry({ idleTtlMs: 5 });

      registry.acquire("conv-a");
      registry.acquire("conv-b");
      await registry.enqueue("conv-a", async () => "done");

      await Promise.all([registry.close(), registry.close()]);

      expect(created.every((actor) => actor.stopped)).toBe(true);
      expect(created.map((actor) => actor.stopCalls)).toEqual([1, 1]);
      expect(registry.peek("conv-a")).toBeUndefined();
      expect(registry.peek("conv-b")).toBeUndefined();

      expect(() => registry.acquire("conv-a")).toThrow(
        "Conversation actor registry closed",
      );
      expect(
        await registry
          .enqueue("conv-a", async () => "never")
          .catch((error: unknown) => error),
      ).toEqual(new Error("Conversation actor registry closed"));
    });

    it("prevents queued operations from starting and drains active work", async () => {
      const { registry } = createRegistry();
      const actor = registry.acquire("conv-a");
      const gate = deferred<void>();
      const closeReason = new Error("registry test close");
      let queuedOperationStarted = false;
      const active = registry
        .enqueue("conv-a", () => gate.promise)
        .catch((error: unknown) => error);
      const queued = registry
        .enqueue("conv-a", async () => {
          queuedOperationStarted = true;
        })
        .catch((error: unknown) => error);
      await Promise.resolve();

      let closeSettled = false;
      const closing = registry.close(closeReason).then(() => {
        closeSettled = true;
      });
      await Promise.resolve();

      expect(queuedOperationStarted).toBe(false);
      expect(closeSettled).toBe(false);
      expect(actor.stopped).toBe(false);
      expect(await active).toBe(closeReason);
      expect(await queued).toBe(closeReason);

      gate.resolve();
      await closing;
      expect(queuedOperationStarted).toBe(false);
      expect(actor.stopped).toBe(true);
    });

    it("links active operations to the registry close signal", async () => {
      const { registry } = createRegistry();
      const started = deferred<void>();
      const closeReason = new Error("registry test close");
      let observedSignal: AbortSignal | undefined;
      const active = registry
        .enqueue("conv-a", async (signal) => {
          observedSignal = signal;
          started.resolve();
          await new Promise<void>((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            });
          });
        })
        .catch((error: unknown) => error);
      await started.promise;

      const closing = registry.close(closeReason);

      expect(observedSignal?.aborted).toBe(true);
      expect(await active).toBe(closeReason);
      await closing;
    });
  });
});
