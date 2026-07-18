import { describe, expect, it, mock } from "bun:test";
import { Effect } from "@brains/utils/effect";
import { TestClock, TestContext } from "@brains/utils/effect/test";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { setupGitAutoCommit } from "../../src/lib/git-auto-commit";
import { DirectorySyncRuntime } from "../../src/lib/directory-sync-runtime";
import { createMockGitSync } from "../fixtures";

function deferred(): {
  promise: Promise<void>;
  resolve(): void;
} {
  let settle: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    settle = resolve;
  });
  return { promise, resolve: (): void => settle?.() };
}

function yieldToFibers(): Effect.Effect<void> {
  return Effect.yieldNow().pipe(Effect.andThen(Effect.yieldNow()));
}

const eventPayload = {
  entity: {},
  entityType: "post",
  entityId: "1",
};

describe("setupGitAutoCommit", () => {
  it("subscribes to every entity CRUD event", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const runtime = new DirectorySyncRuntime({ clock });
        const harness = createPluginHarness();
        const commitMock = mock(async (): Promise<void> => {});
        const pushMock = mock(async (): Promise<void> => {});
        setupGitAutoCommit(
          harness.getServiceContext("directory-sync").messaging,
          createMockGitSync({ commit: commitMock, push: pushMock }),
          50,
          createSilentLogger(),
          runtime,
        );

        for (const type of [
          "entity:created",
          "entity:updated",
          "entity:deleted",
        ]) {
          yield* Effect.promise(() =>
            harness.sendMessage(type, eventPayload, "test", true),
          );
          yield* TestClock.adjust(50);
          yield* yieldToFibers();
        }

        expect(commitMock).toHaveBeenCalledTimes(3);
        expect(pushMock).toHaveBeenCalledTimes(3);
        yield* Effect.promise(() => runtime.close());
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  it("never commits before the trailing debounce window", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const runtime = new DirectorySyncRuntime({ clock });
        const harness = createPluginHarness();
        const commitMock = mock(async (): Promise<void> => {});
        const pushMock = mock(async (): Promise<void> => {});
        setupGitAutoCommit(
          harness.getServiceContext("directory-sync").messaging,
          createMockGitSync({ commit: commitMock, push: pushMock }),
          50,
          createSilentLogger(),
          runtime,
        );

        yield* Effect.promise(() =>
          harness.sendMessage("entity:created", eventPayload, "test", true),
        );
        yield* TestClock.adjust(49);
        yield* yieldToFibers();
        expect(commitMock).not.toHaveBeenCalled();

        yield* TestClock.adjust(1);
        yield* yieldToFibers();
        expect(commitMock).toHaveBeenCalledTimes(1);
        expect(pushMock).toHaveBeenCalledTimes(1);
        yield* Effect.promise(() => runtime.close());
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  it("interrupts a pending debounce on close", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const runtime = new DirectorySyncRuntime({ clock });
        const harness = createPluginHarness();
        const commitMock = mock(async (): Promise<void> => {});
        setupGitAutoCommit(
          harness.getServiceContext("directory-sync").messaging,
          createMockGitSync({ commit: commitMock }),
          50,
          createSilentLogger(),
          runtime,
        );

        yield* Effect.promise(() =>
          harness.sendMessage("entity:created", eventPayload, "test", true),
        );
        yield* Effect.promise(() => runtime.close());
        yield* TestClock.adjust(500);
        yield* yieldToFibers();

        expect(commitMock).not.toHaveBeenCalled();
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  it("drains commit and push after the debounce has fired", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const runtime = new DirectorySyncRuntime({ clock });
        const harness = createPluginHarness();
        const commitStarted = deferred();
        const releaseCommit = deferred();
        const pushMock = mock(async (): Promise<void> => {});
        setupGitAutoCommit(
          harness.getServiceContext("directory-sync").messaging,
          createMockGitSync({
            commit: mock(async (): Promise<void> => {
              commitStarted.resolve();
              await releaseCommit.promise;
            }),
            push: pushMock,
          }),
          10,
          createSilentLogger(),
          runtime,
        );

        yield* Effect.promise(() =>
          harness.sendMessage("entity:created", eventPayload, "test", true),
        );
        yield* TestClock.adjust(10);
        yield* Effect.promise(() => commitStarted.promise);

        let closeSettled = false;
        const closing = runtime.close().then(() => {
          closeSettled = true;
        });
        yield* yieldToFibers();
        expect(closeSettled).toBe(false);
        expect(pushMock).not.toHaveBeenCalled();

        releaseCommit.resolve();
        yield* Effect.promise(() => closing);
        expect(pushMock).toHaveBeenCalledTimes(1);
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  it("batches rapid events into one trailing operation", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const runtime = new DirectorySyncRuntime({ clock });
        const harness = createPluginHarness();
        const commitMock = mock(async (): Promise<void> => {});
        setupGitAutoCommit(
          harness.getServiceContext("directory-sync").messaging,
          createMockGitSync({ commit: commitMock }),
          50,
          createSilentLogger(),
          runtime,
        );

        for (let index = 0; index < 5; index++) {
          yield* Effect.promise(() =>
            harness.sendMessage(
              "entity:updated",
              { ...eventPayload, entityId: String(index) },
              "test",
              true,
            ),
          );
          yield* TestClock.adjust(10);
          yield* yieldToFibers();
        }
        expect(commitMock).not.toHaveBeenCalled();

        yield* TestClock.adjust(40);
        yield* yieldToFibers();
        expect(commitMock).toHaveBeenCalledTimes(1);
        yield* Effect.promise(() => runtime.close());
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });
});
