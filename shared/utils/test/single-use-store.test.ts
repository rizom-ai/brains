import { describe, expect, it } from "bun:test";
import { SingleUseStore } from "../src/single-use-store";

function clocked(options: { ttlMs?: number; maxPending?: number } = {}): {
  store: SingleUseStore<string>;
  clock: { now: number };
} {
  const clock = { now: 0 };
  const store = new SingleUseStore<string>({
    ttlMs: options.ttlMs ?? 1_000,
    maxPending: options.maxPending ?? 10,
    now: (): number => clock.now,
  });
  return { store, clock };
}

describe("SingleUseStore", () => {
  it("hands back a value once for the token it issued", () => {
    const { store } = clocked();
    const token = store.issue("owner");

    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(store.take(token)).toBe("owner");
    expect(store.take(token)).toBeNull();
  });

  it("forgets a value once its time is up", () => {
    const { store, clock } = clocked({ ttlMs: 1_000 });
    const token = store.issue("owner");

    clock.now = 999;
    const kept = store.issue("other");
    clock.now = 1_000;

    expect(store.take(token)).toBeNull();
    expect(store.take(kept)).toBe("other");
  });

  it("drops the oldest value beyond its bound", () => {
    const { store } = clocked({ maxPending: 2 });
    const [first, second, third] = ["a", "b", "c"].map((value) =>
      store.issue(value),
    );

    expect(store.take(first ?? "")).toBeNull();
    expect(store.take(second ?? "")).toBe("b");
    expect(store.take(third ?? "")).toBe("c");
  });

  it("keeps a value its taker does not accept", () => {
    const { store } = clocked();
    const token = store.issue("owner");

    expect(store.take(token, (value) => value === "someone-else")).toBeNull();
    expect(store.take(token, (value) => value === "owner")).toBe("owner");
  });

  it("knows no token it did not issue", () => {
    expect(clocked().store.take("forged")).toBeNull();
  });
});
