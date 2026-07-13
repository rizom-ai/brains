import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { ShellLifecycle } from "../src/initialization/shell-lifecycle";

describe("ShellLifecycle", () => {
  it("runs its finalizer only once", async () => {
    let finalizerCalls = 0;
    const lifecycle = new ShellLifecycle(async () => {
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
    const lifecycle = new ShellLifecycle(async () => {
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
});
