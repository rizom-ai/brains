import { describe, expect, it } from "bun:test";
import { deferred } from "../src/deferred";

describe("deferred", () => {
  it("stays pending until resolved", async () => {
    const gate = deferred<string>();
    let settled: string | undefined;
    void gate.promise.then((value) => {
      settled = value;
    });

    await Promise.resolve();
    expect(settled).toBeUndefined();

    gate.resolve("through");
    await gate.promise;
    expect(settled).toBe("through");
  });

  it("rejects with the given reason", () => {
    const gate = deferred();
    gate.reject(new Error("closed"));

    expect(gate.promise).rejects.toThrow("closed");
  });

  it("orders work that would otherwise race", async () => {
    const gate = deferred();
    const order: string[] = [];

    const slow = (async (): Promise<void> => {
      await gate.promise;
      order.push("slow");
    })();
    const fast = (async (): Promise<void> => {
      order.push("fast");
    })();

    await fast;
    gate.resolve();
    await slow;

    expect(order).toEqual(["fast", "slow"]);
  });
});
