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
    const ServiceTag = Context.GenericTag<"test/Service", { value: string }>(
      "test/Service",
    );
    let releases = 0;
    const lifecycle = new ShellLifecycle();
    const context = lifecycle.buildLayer(
      Layer.scoped(
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
    const ServiceTag = Context.GenericTag<"test/Failure", { value: string }>(
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

  it("currently lets a concurrent close return before finalization settles", async () => {
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

    expect(secondSettled).toBe(true);

    releaseFinalizer.resolve();
    await Promise.all([firstClose, secondClose]);
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

  it("runs every finalizer in reverse order when one fails", async () => {
    const order: string[] = [];
    const lifecycle = new ShellLifecycle();
    lifecycle.addFinalizer(() => {
      order.push("first");
    });
    lifecycle.addFinalizer(() => {
      order.push("second");
      throw new Error("cleanup failed");
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

    expect(closeError).toBeInstanceOf(Error);
    expect(order).toEqual(["third", "second", "first"]);
  });
});
