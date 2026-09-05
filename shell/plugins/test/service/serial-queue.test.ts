import { describe, expect, it } from "bun:test";
import { SerialQueue } from "../../src/service/serial-queue";

/**
 * A queued operation that takes time.
 *
 * A real duration rather than a gate: these tests queue several operations at
 * once and assert the queue runs them one after another, so what is needed is
 * work that genuinely overlaps in wall-clock terms — a gate would have to be
 * released in the order under test, which would assume the answer.
 */
function slowWork(ms: number): Promise<void> {
  return Bun.sleep(ms);
}

describe("SerialQueue", () => {
  it("returns the operation's result", async () => {
    const queue = new SerialQueue();

    expect(await queue.run(() => 42)).toBe(42);
    expect(await queue.run(async () => "async")).toBe("async");
  });

  it("runs operations one at a time in call order", async () => {
    const queue = new SerialQueue();
    const order: string[] = [];

    await Promise.all([
      queue.run(async () => {
        order.push("a:start");
        await slowWork(15);
        order.push("a:end");
      }),
      queue.run(async () => {
        order.push("b:start");
        await slowWork(1);
        order.push("b:end");
      }),
      queue.run(() => {
        order.push("c");
      }),
    ]);

    expect(order).toEqual(["a:start", "a:end", "b:start", "b:end", "c"]);
  });

  it("keeps running after an operation rejects", async () => {
    const queue = new SerialQueue();

    let caught: unknown;
    const failure = queue.run(async () => {
      throw new Error("queue boom");
    });
    const next = queue.run(() => "still works");

    try {
      await failure;
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(await next).toBe("still works");
  });

  it("keeps running after an operation throws synchronously", async () => {
    const queue = new SerialQueue();

    let caught: unknown;
    const failure = queue.run((): string => {
      throw new Error("sync boom");
    });
    const next = queue.run(() => "still works");

    try {
      await failure;
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(await next).toBe("still works");
  });

  it("settles once every queued operation has finished", async () => {
    const queue = new SerialQueue();
    let done = false;

    void queue.run(async () => {
      await slowWork(10);
      done = true;
    });
    await queue.settle();

    expect(done).toBe(true);
  });

  it("settles even when a queued operation rejected", async () => {
    const queue = new SerialQueue();

    const failure = queue.run(async () => {
      throw new Error("boom");
    });
    failure.catch(() => undefined);

    await queue.settle();
    expect(await queue.run(() => "ok")).toBe("ok");
  });
});
