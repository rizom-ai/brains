import { describe, expect, it } from "bun:test";
import { Context, Effect, Exit, Layer } from "@brains/utils/effect";
import { ShellLifecycle } from "../src/initialization/shell-lifecycle";

function deferred(): { promise: Promise<void>; resolve(): void } {
  let settle: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    settle = resolve;
  });
  return { promise, resolve: (): void => settle?.() };
}

describe("ShellLifecycle", () => {
  it("owns scoped layers for the shell lifetime", () => {
    const ServiceTag = Context.Service<"test/Service", { value: string }>(
      "test/Service",
    );
    let releases = 0;
    const lifecycle = new ShellLifecycle();
    const context = lifecycle.buildLayer(
      Layer.effect(
        ServiceTag,
        Effect.acquireRelease(Effect.succeed({ value: "owned" }), () =>
          Effect.sync(() => {
            releases++;
          }),
        ),
      ),
    );

    expect(Context.get(context, ServiceTag)).toEqual({ value: "owned" });
    lifecycle.closeSync(Exit.void);
    lifecycle.closeSync(Exit.void);

    expect(releases).toBe(1);
  });

  it("preserves synchronous layer acquisition error identity", () => {
    const ServiceTag = Context.Service<"test/Failure", { value: string }>(
      "test/Failure",
    );
    const failure = new Error("layer acquisition failed");
    const lifecycle = new ShellLifecycle();
    let actualError: unknown;

    try {
      lifecycle.buildLayer(
        Layer.effect(
          ServiceTag,
          Effect.sync((): { value: string } => {
            throw failure;
          }),
        ),
      );
    } catch (error) {
      actualError = error;
    } finally {
      lifecycle.closeSync(Exit.fail(failure));
    }

    expect(actualError).toBe(failure);
  });

  it("rolls back synchronous acquisition in reverse order", () => {
    const order: string[] = [];
    const lifecycle = new ShellLifecycle();
    lifecycle.addSyncFinalizer(() => {
      order.push("first");
    });
    lifecycle.addSyncFinalizer(() => {
      order.push("second");
    });

    lifecycle.closeSync(Exit.fail(new Error("construction failed")));
    lifecycle.closeSync(Exit.void);

    expect(order).toEqual(["second", "first"]);
  });

  it("runs its finalizer only once", async () => {
    let finalizerCalls = 0;
    const lifecycle = new ShellLifecycle();
    lifecycle.addFinalizer(() => {
      finalizerCalls++;
    });

    await lifecycle.close();
    await lifecycle.close();

    expect(finalizerCalls).toBe(1);
  });

  it("makes concurrent close callers join finalization", async () => {
    const releaseFinalizer = deferred();
    const finalizerStarted = deferred();
    const lifecycle = new ShellLifecycle();
    lifecycle.addFinalizer(async () => {
      finalizerStarted.resolve();
      await releaseFinalizer.promise;
    });

    const firstClose = lifecycle.close();
    await finalizerStarted.promise;
    let secondSettled = false;
    const secondClose = lifecycle.close().then(() => {
      secondSettled = true;
    });
    await Promise.resolve();

    expect(secondSettled).toBe(false);

    releaseFinalizer.resolve();
    await Promise.all([firstClose, secondClose]);
    expect(secondSettled).toBe(true);
  });

  it("interrupts scoped background work before finalizing", async () => {
    const order: string[] = [];
    let notifyStarted: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      notifyStarted = resolve;
    });
    const lifecycle = new ShellLifecycle();
    lifecycle.addFinalizer(() => {
      order.push("finalized");
    });

    await lifecycle.fork(
      Effect.promise(
        (signal) =>
          new Promise<void>((resolve) => {
            signal.addEventListener(
              "abort",
              () => {
                order.push("interrupted");
                resolve();
              },
              { once: true },
            );
            notifyStarted();
          }),
      ),
    );
    await started;

    await lifecycle.close();

    expect(order).toEqual(["interrupted", "finalized"]);
  });

  it("joins failing cleanup for concurrent and later close callers", async () => {
    const failure = new Error("cleanup failed before the drain");
    const finalizerEntered = deferred();
    const releaseFinalizer = deferred();
    const order: string[] = [];
    const lifecycle = new ShellLifecycle();
    lifecycle.addFinalizer(async () => {
      order.push("waiting");
      finalizerEntered.resolve();
      await releaseFinalizer.promise;
      order.push("drained");
    });
    lifecycle.addFinalizer(() => {
      order.push("failed");
      throw failure;
    });

    const firstClose = lifecycle.close();
    let firstSettled = false;
    const firstOutcome = firstClose.then(
      () => ({ error: undefined }),
      (error: unknown) => ({ error }),
    );
    void firstOutcome.then(() => {
      firstSettled = true;
    });
    await finalizerEntered.promise;
    const secondClose = lifecycle.close();
    const secondOutcome = secondClose.then(
      () => ({ error: undefined }),
      (error: unknown) => ({ error }),
    );

    expect(secondClose).toBe(firstClose);
    expect(firstSettled).toBe(false);
    expect(order).toEqual(["failed", "waiting"]);
    releaseFinalizer.resolve();
    const [first, second] = await Promise.all([firstOutcome, secondOutcome]);
    expect(first.error).toBe(failure);
    expect(second.error).toBe(failure);
    expect(order).toEqual(["failed", "waiting", "drained"]);
    expect(lifecycle.close()).toBe(firstClose);
    expect(() => lifecycle.addFinalizer(() => {})).toThrow(
      "Cannot register cleanup after shell shutdown",
    );
  });

  it("preserves cleanup failure identity when closing a failed lifetime", async () => {
    const startupFailure = new Error("startup failed");
    const cleanupFailure = new Error("rollback failed");
    const lifecycle = new ShellLifecycle();
    lifecycle.addFinalizer(() => {
      throw cleanupFailure;
    });

    const outcome = await lifecycle.close(Exit.fail(startupFailure)).then(
      () => ({ error: undefined }),
      (error: unknown) => ({ error }),
    );
    expect(outcome.error).toBe(cleanupFailure);
  });

  it("runs every finalizer in reverse order when one fails", async () => {
    const failure = new Error("cleanup failed");
    const order: string[] = [];
    const lifecycle = new ShellLifecycle();
    lifecycle.addFinalizer(() => {
      order.push("first");
    });
    lifecycle.addFinalizer(() => {
      order.push("second");
      throw failure;
    });
    lifecycle.addFinalizer(() => {
      order.push("third");
    });

    let closeError: unknown;
    try {
      await lifecycle.close();
    } catch (error) {
      closeError = error;
    }

    expect(closeError).toBe(failure);
    expect(order).toEqual(["third", "second", "first"]);
  });
});
