import { describe, expect, it } from "bun:test";
import {
  Clock,
  Context,
  Effect,
  Exit,
  Fiber,
  Layer,
  Scope,
  scopedServiceLayer,
} from "@brains/utils/effect";
import * as Runtime from "@brains/utils/effect";
import { TestClock } from "@brains/utils/effect/test";

describe("Effect utility boundary", () => {
  it("exposes the curated production runtime", async () => {
    const result = await Effect.runPromise(Effect.succeed("ready"));

    expect(result).toBe("ready");
  });

  for (const kind of ["fail", "die", "tryPromise"] as const) {
    it(`preserves the original ${kind} failure at the Promise boundary`, async () => {
      const failure = new Error(`${kind} failed`);
      const operation =
        kind === "tryPromise"
          ? Effect.tryPromise({
              try: async () => {
                throw failure;
              },
              catch: (error) => error,
            })
          : Effect[kind](failure);
      const actual = await Effect.runPromise(operation).then(
        () => undefined,
        (error: unknown) => error,
      );

      expect(actual).toBe(failure);
    });
  }

  it("owns separate acquisitions for independent root scopes", async () => {
    const serviceTag = Context.Service<"test/Owned", { id: number }>(
      "test/Owned",
    );
    let acquisitions = 0;
    const released: number[] = [];
    const layer = scopedServiceLayer(serviceTag, () => {
      const service = { id: ++acquisitions };
      return {
        service,
        close: (): void => {
          released.push(service.id);
        },
      };
    });
    const firstScope = Effect.runSync(Scope.make());
    const secondScope = Effect.runSync(Scope.make());

    try {
      const first = Context.get(
        Effect.runSync(Layer.buildWithScope(layer, firstScope)),
        serviceTag,
      );
      const second = Context.get(
        Effect.runSync(Layer.buildWithScope(layer, secondScope)),
        serviceTag,
      );
      expect(first.id).not.toBe(second.id);
      expect(acquisitions).toBe(2);

      await Effect.runPromise(Scope.close(firstScope, Exit.void));
      await Effect.runPromise(Scope.close(firstScope, Exit.void));
      expect(released).toEqual([first.id]);
      expect(second.id).toBe(2);

      await Effect.runPromise(Scope.close(secondScope, Exit.void));
      expect(released).toEqual([first.id, second.id]);
    } finally {
      await Effect.runPromise(Scope.close(firstScope, Exit.void));
      await Effect.runPromise(Scope.close(secondScope, Exit.void));
    }
  });

  it("rolls back sibling resources even when one finalizer fails", async () => {
    const scope = Effect.runSync(Scope.make());
    const order: string[] = [];
    const failure = new Error("release failed");
    for (const name of ["first", "failed", "last"]) {
      Effect.runSync(
        Scope.addFinalizer(
          scope,
          Effect.sync(() => {
            order.push(name);
            if (name === "failed") throw failure;
          }),
        ),
      );
    }

    const exit = await Effect.runPromiseExit(Scope.close(scope, Exit.void));

    expect(Exit.isFailure(exit)).toBe(true);
    expect(order).toEqual(["last", "failed", "first"]);
  });

  it("leaves an effect unchanged when no optional clock is supplied", () => {
    const effect = Effect.succeed("unchanged");

    expect(Runtime.withOptionalClock(effect)).toBe(effect);
    expect(Effect.runSync(Runtime.withOptionalClock(effect))).toBe("unchanged");
  });

  it("obtains a complete default live clock from the runtime", () => {
    const clock = Effect.runSync(Clock.Clock);

    expect(clock.currentTimeMillisUnsafe()).toBeGreaterThan(0);
    expect(typeof clock.currentTimeNanosUnsafe()).toBe("bigint");
    expect(typeof clock.monotonicTimeNanosUnsafe()).toBe("bigint");
  });

  it("exposes deterministic test services separately", async () => {
    const elapsed = await Effect.runPromise(
      Effect.gen(function* () {
        let completed = false;
        yield* Effect.forkChild(
          Effect.sleep(100).pipe(
            Effect.andThen(
              Effect.sync(() => {
                completed = true;
              }),
            ),
          ),
        );
        yield* TestClock.adjust(100);
        return completed;
      }).pipe(Effect.provide(TestClock.layer())),
    );

    expect(elapsed).toBe(true);
  });

  it("injects an extracted clock into a separately started fiber", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClockWith(Effect.succeed);
        let completed = false;
        const fiber = Effect.runFork(
          Runtime.withOptionalClock(
            Effect.sleep(100).pipe(
              Effect.andThen(
                Effect.sync(() => {
                  completed = true;
                }),
              ),
            ),
            clock,
          ),
        );

        try {
          yield* TestClock.adjust(99);
          expect(completed).toBe(false);
          yield* TestClock.adjust(1);
          yield* Fiber.join(fiber);
          expect(completed).toBe(true);
          expect(clock.currentTimeMillisUnsafe()).toBe(100);
        } finally {
          yield* Fiber.interrupt(fiber);
        }
      }).pipe(Effect.provide(TestClock.layer())),
    );
  });

  it("preserves other required services when providing an optional clock", async () => {
    const serviceTag = Context.Service<"test/Value", { value: string }>(
      "test/Value",
    );
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClockWith(Effect.succeed);
        const operation = Effect.gen(function* () {
          const service = yield* serviceTag;
          const now = yield* Clock.currentTimeMillis;
          return { value: service.value, now };
        });
        const result = yield* Runtime.withOptionalClock(operation, clock).pipe(
          Effect.provideService(serviceTag, { value: "retained" }),
        );

        expect(result).toEqual({ value: "retained", now: 0 });
      }).pipe(Effect.provide(TestClock.layer())),
    );
  });
});
