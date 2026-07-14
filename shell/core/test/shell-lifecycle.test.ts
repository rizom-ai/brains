import { describe, expect, it } from "bun:test";
import { Effect, Exit } from "@brains/effect-runtime";
import { ShellLifecycle } from "../src/initialization/shell-lifecycle";

describe("ShellLifecycle", () => {
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
