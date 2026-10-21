import { describe, expect, it } from "bun:test";
import { yieldToEventLoop, yieldWhenStarved } from "../src/yield-to-event-loop";

describe("yieldToEventLoop", () => {
  it("lets due timers run, which an awaited resolved promise does not", async () => {
    const order: string[] = [];
    setTimeout(() => order.push("timer"), 0);
    // Let the zero-delay timer come due.
    Bun.sleepSync(5);

    await Promise.resolve();
    order.push("after promise");
    await yieldToEventLoop();
    order.push("after yield");

    expect(order).toEqual(["after promise", "timer", "after yield"]);
  });
});

describe("yieldWhenStarved", () => {
  it("continues at once while the loop has turned within its budget", async () => {
    await yieldWhenStarved(1_000);
    await yieldToEventLoop();
    const order: string[] = [];
    setTimeout(() => order.push("timer"), 0);
    Bun.sleepSync(2);

    await yieldWhenStarved(1_000);
    order.push("after");
    await yieldToEventLoop();

    expect(order).toEqual(["after", "timer"]);
  });

  it("lets due timers run once work has gone past its budget without a turn", async () => {
    await yieldWhenStarved(20);
    await yieldToEventLoop();
    const order: string[] = [];
    setTimeout(() => order.push("timer"), 0);
    // Work that never gives the loop a turn, longer than the budget.
    Bun.sleepSync(30);

    await yieldWhenStarved(20);
    order.push("after");

    expect(order).toEqual(["timer", "after"]);
  });
});
