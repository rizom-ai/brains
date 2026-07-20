import { describe, expect, it } from "bun:test";
import { Effect } from "@brains/utils/effect";
import { TestClock, TestContext } from "@brains/utils/effect/test";
import type { AuthorizationCodePersistence } from "../src/auth-code-store";
import type { OAuthClientPersistence } from "../src/client-store";
import type { AuthKeyStore } from "../src/key-store";
import { OAuthClientMaintenanceSupervisor } from "../src/oauth-client-maintenance-supervisor";
import { OAuthEndpoints } from "../src/oauth-endpoints";
import type { RefreshTokenPersistence } from "../src/refresh-token-store";

function deferred(): { promise: Promise<void>; resolve(): void } {
  let settle: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    settle = resolve;
  });
  return { promise, resolve: (): void => settle?.() };
}

describe("OAuthClientMaintenanceSupervisor", () => {
  it("runs immediately and follows the injected Effect clock", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const maintenanceTimes: number[] = [];
        const supervisor = new OAuthClientMaintenanceSupervisor(
          100,
          async (now) => {
            maintenanceTimes.push(now);
          },
          { clock },
        );

        yield* Effect.promise(() => supervisor.start());
        expect(maintenanceTimes).toEqual([0]);

        yield* TestClock.adjust(99);
        expect(maintenanceTimes).toEqual([0]);
        yield* TestClock.adjust(1);
        expect(maintenanceTimes).toEqual([0, 100]);
        yield* TestClock.adjust(100);
        expect(maintenanceTimes).toEqual([0, 100, 200]);

        yield* Effect.promise(() => supervisor.close());
        yield* TestClock.adjust(1_000);
        expect(maintenanceTimes).toEqual([0, 100, 200]);
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  it("does not overlap maintenance and drains an admitted run on repeated close", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const release = deferred();
        let runs = 0;
        const supervisor = new OAuthClientMaintenanceSupervisor(
          100,
          async () => {
            runs++;
            if (runs === 2) await release.promise;
          },
          { clock },
        );

        yield* Effect.promise(() => supervisor.start());
        yield* TestClock.adjust(100);
        expect(runs).toBe(2);
        yield* TestClock.adjust(1_000);
        expect(runs).toBe(2);

        let closed = false;
        const firstClose = supervisor.close();
        const secondClose = supervisor.close();
        expect(secondClose).toBe(firstClose);
        void firstClose.then(() => {
          closed = true;
        });
        yield* Effect.yieldNow();
        expect(closed).toBe(false);

        release.resolve();
        yield* Effect.promise(() => firstClose);
        expect(closed).toBe(true);
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  it("reports failed maintenance and continues the schedule", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const failure = new Error("prune failed");
        const errors: unknown[] = [];
        let runs = 0;
        const supervisor = new OAuthClientMaintenanceSupervisor(
          100,
          async () => {
            runs++;
            if (runs === 1) throw failure;
          },
          {
            clock,
            onError: (error): void => {
              errors.push(error);
            },
          },
        );

        yield* Effect.promise(() => supervisor.start());
        expect(errors).toEqual([failure]);
        yield* TestClock.adjust(100);
        expect(runs).toBe(2);

        yield* Effect.promise(() => supervisor.close());
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  it("owns OAuth endpoint maintenance through the supervised lifecycle", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const release = deferred();
        let runs = 0;
        const clientStore: OAuthClientPersistence = {
          registerClient: async () => {
            throw new Error("not used");
          },
          getClient: async () => undefined,
          validateClientCredentials: async () => undefined,
          pruneStaleUnconsentedClients: async () => {
            runs++;
            if (runs === 2) await release.promise;
            return 0;
          },
        };
        const endpoints = new OAuthEndpoints({
          clientStore,
          authCodeStore: {} as AuthorizationCodePersistence,
          refreshTokenStore: {} as RefreshTokenPersistence,
          resolveSession: async (): Promise<undefined> => undefined,
          keyStore: {} as AuthKeyStore,
          clientMaintenanceIntervalMs: 100,
          clientMaintenanceClock: clock,
        });

        yield* Effect.promise(() => endpoints.startClientMaintenance());
        expect(runs).toBe(1);
        yield* TestClock.adjust(100);
        expect(runs).toBe(2);

        let stopped = false;
        const firstStop = endpoints.stopClientMaintenance();
        const secondStop = endpoints.stopClientMaintenance();
        expect(secondStop).toBe(firstStop);
        void firstStop.then(() => {
          stopped = true;
        });
        yield* Effect.yieldNow();
        expect(stopped).toBe(false);

        release.resolve();
        yield* Effect.promise(() => firstStop);
        expect(stopped).toBe(true);
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });
});
