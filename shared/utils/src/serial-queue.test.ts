import { describe, expect, it } from "bun:test";
import { caughtError } from "@brains/test-utils";
import {
  KeyedSerialQueue,
  KeyedSingleFlight,
  SerialQueue,
  SingleFlight,
} from "./serial-queue";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => {};
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("SerialQueue", () => {
  it("runs operations one at a time in submission order", async () => {
    const queue = new SerialQueue();
    const order: string[] = [];
    let active = 0;
    let maxActive = 0;

    const gate = deferred();
    const first = queue.run(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      order.push("first-start");
      await gate.promise;
      order.push("first-end");
      active--;
    });
    const second = queue.run(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      order.push("second");
      active--;
    });

    gate.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(["first-start", "first-end", "second"]);
    expect(maxActive).toBe(1);
  });

  it("returns the operation's result and propagates rejections", async () => {
    const queue = new SerialQueue();
    expect(queue.run(() => Promise.resolve(42))).resolves.toBe(42);
    expect(queue.run(() => Promise.reject(new Error("boom")))).rejects.toThrow(
      "boom",
    );
  });

  it("keeps serving after a rejected operation", async () => {
    const queue = new SerialQueue();
    await queue.run(() => Promise.reject(new Error("boom"))).catch(() => {});
    expect(queue.run(() => Promise.resolve("next"))).resolves.toBe("next");
  });

  it("idle resolves once all enqueued operations settle", async () => {
    const queue = new SerialQueue();
    const gate = deferred();
    let finished = false;
    void queue.run(async () => {
      await gate.promise;
      finished = true;
    });

    gate.resolve();
    await queue.idle();
    expect(finished).toBe(true);
  });

  it("rejects immediately when the signal is already aborted", async () => {
    const queue = new SerialQueue();
    const controller = new AbortController();
    const reason = new Error("cancelled");
    controller.abort(reason);

    let ran = false;
    expect(
      queue.run(() => {
        ran = true;
        return Promise.resolve();
      }, controller.signal),
    ).rejects.toBe(reason);
    expect(ran).toBe(false);
  });

  it("rejects a queued operation on abort without blocking the queue", async () => {
    const queue = new SerialQueue();
    const gate = deferred();
    const first = queue.run(() => gate.promise);

    const controller = new AbortController();
    const reason = new Error("cancelled");
    let ran = false;
    const aborted = queue.run(() => {
      ran = true;
      return Promise.resolve();
    }, controller.signal);
    controller.abort(reason);
    let caught: unknown;
    try {
      await aborted;
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(reason);
    expect(ran).toBe(false);

    gate.resolve();
    await first;
    expect(queue.run(() => Promise.resolve("after"))).resolves.toBe("after");
  });

  it("lets an admitted operation finish despite abort", async () => {
    const queue = new SerialQueue();
    const controller = new AbortController();
    const gate = deferred();
    const running = queue.run(async () => {
      controller.abort(new Error("too late"));
      await gate.promise;
      return "done";
    }, controller.signal);

    gate.resolve();
    expect(running).resolves.toBe("done");
  });
});

describe("KeyedSerialQueue", () => {
  it("serializes operations sharing a key", async () => {
    const queue = new KeyedSerialQueue();
    const order: string[] = [];
    const gate = deferred();
    const first = queue.run("a", async () => {
      order.push("first-start");
      await gate.promise;
      order.push("first-end");
    });
    const second = queue.run("a", async () => {
      order.push("second");
    });

    gate.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(["first-start", "first-end", "second"]);
  });

  it("runs operations with different keys concurrently", async () => {
    const queue = new KeyedSerialQueue();
    const gate = deferred();
    let otherRan = false;
    const blocked = queue.run("a", () => gate.promise);
    await queue.run("b", async () => {
      otherRan = true;
    });
    expect(otherRan).toBe(true);
    gate.resolve();
    await blocked;
  });

  it("returns results and keeps serving a key after a rejection", async () => {
    const queue = new KeyedSerialQueue();
    await queue
      .run("a", () => Promise.reject(new Error("boom")))
      .catch(() => {});
    expect(queue.run("a", () => Promise.resolve(7))).resolves.toBe(7);
  });
});

describe("KeyedSingleFlight", () => {
  it("joins a call in flight instead of running the work twice", async () => {
    const flight = new KeyedSingleFlight<string>();
    let runs = 0;
    const gate = deferred();
    const work = async (): Promise<string> => {
      runs += 1;
      await gate.promise;
      return "once";
    };

    const first = flight.run("k", work);
    const second = flight.run("k", work);
    gate.resolve();

    expect(await first).toBe("once");
    expect(await second).toBe("once");
    expect(runs).toBe(1);
  });

  it("keeps separate keys separate", async () => {
    const flight = new KeyedSingleFlight<string>();
    let runs = 0;
    const work = async (): Promise<string> => {
      runs += 1;
      return "done";
    };

    await Promise.all([flight.run("a", work), flight.run("b", work)]);

    expect(runs).toBe(2);
  });

  it("releases the key once the work settles, so a later call runs again", async () => {
    const flight = new KeyedSingleFlight<string>();
    let runs = 0;
    const work = async (): Promise<string> => {
      runs += 1;
      return "done";
    };

    await flight.run("k", work);
    await flight.run("k", work);

    expect(runs).toBe(2);
  });

  it("releases the key when the work rejects, and reports the rejection", async () => {
    const flight = new KeyedSingleFlight<string>();
    const failing = (): Promise<string> =>
      Promise.reject(new Error("unavailable"));

    let thrown: unknown;
    try {
      await flight.run("k", failing);
    } catch (cause) {
      thrown = cause;
    }
    expect(caughtError(thrown).message).toBe("unavailable");

    // The key is free again rather than pinned to a rejected promise.
    expect(await flight.run("k", async () => "recovered")).toBe("recovered");
  });

  it("does not let an earlier call's completion evict a later one", async () => {
    const flight = new KeyedSingleFlight<string>();
    const first = deferred();
    let runs = 0;

    const one = flight.run("k", async (): Promise<string> => {
      runs += 1;
      await first.promise;
      return "first";
    });
    first.resolve();
    await one;

    // The first has settled and released the key; a second call takes it.
    const second = deferred();
    const two = flight.run("k", async (): Promise<string> => {
      runs += 1;
      await second.promise;
      return "second";
    });
    // A third joins the second, not a stale entry from the first.
    const three = flight.run("k", async (): Promise<string> => {
      runs += 1;
      return "third";
    });
    second.resolve();

    expect(await two).toBe("second");
    expect(await three).toBe("second");
    expect(runs).toBe(2);
  });
});

describe("SingleFlight", () => {
  it("joins the one call in flight", async () => {
    const flight = new SingleFlight<number>();
    let runs = 0;
    const gate = deferred();
    const work = async (): Promise<number> => {
      runs += 1;
      await gate.promise;
      return 7;
    };

    const first = flight.run(work);
    const second = flight.run(work);
    gate.resolve();

    expect(await first).toBe(7);
    expect(await second).toBe(7);
    expect(runs).toBe(1);
  });

  it("runs again once the previous call has settled", async () => {
    const flight = new SingleFlight<number>();
    let runs = 0;
    const work = async (): Promise<number> => {
      runs += 1;
      return runs;
    };

    expect(await flight.run(work)).toBe(1);
    expect(await flight.run(work)).toBe(2);
  });
});
