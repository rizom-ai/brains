import { describe, expect, it } from "bun:test";
import { ConfirmationArgsStore } from "../src/internal/service-runtime";

/**
 * The confirmation store a first-party tool holds a pending confirmation's
 * arguments in between its two calls, as agent discovery's agent_connect
 * and agent_set_trust_level held them: a token for the arguments of the
 * first call, accepted once for the same arguments, and forgotten after
 * its time to live or when newer confirmations crowd it out.
 */

function storeAt(options: { ttlMs?: number; maxPending?: number } = {}): {
  store: ConfirmationArgsStore;
  advance: (ms: number) => void;
} {
  let now = 1_000_000;
  const store = new ConfirmationArgsStore({
    ...options,
    now: (): number => now,
  });
  return {
    store,
    advance: (ms): void => {
      now += ms;
    },
  };
}

function pending(
  store: ConfirmationArgsStore,
  url: string,
): { url: string; confirmationToken: string } {
  return store.create((confirmationToken) => ({ url, confirmationToken }));
}

describe("a tool's pending confirmations", () => {
  it("accepts a token once, for the arguments it was issued for", () => {
    const { store } = storeAt();
    const first = pending(store, "https://peer.example");
    expect(
      store.validate(first.confirmationToken, {
        ...first,
        url: "https://other.example",
      }),
    ).toEqual({ status: "mismatch" });

    const second = pending(store, "https://peer.example");
    expect(store.validate(second.confirmationToken, second)).toEqual({
      status: "ok",
    });
    expect(store.validate(second.confirmationToken, second)).toEqual({
      status: "missing",
    });
  });

  it("forgets a confirmation after its time to live, ten minutes by default", () => {
    const { store, advance } = storeAt();
    const kept = pending(store, "https://peer.example");
    advance(10 * 60 * 1000);
    expect(store.validate(kept.confirmationToken, kept)).toEqual({
      status: "ok",
    });
    const expired = pending(store, "https://peer.example");
    advance(10 * 60 * 1000 + 1);
    expect(store.validate(expired.confirmationToken, expired)).toEqual({
      status: "missing",
    });
  });

  it("drops the oldest confirmations past the pending limit", () => {
    const { store } = storeAt({ maxPending: 2 });
    const oldest = pending(store, "https://one.example");
    const middle = pending(store, "https://two.example");
    const newest = pending(store, "https://three.example");
    expect(store.validate(oldest.confirmationToken, oldest)).toEqual({
      status: "missing",
    });
    expect(store.validate(middle.confirmationToken, middle)).toEqual({
      status: "ok",
    });
    expect(store.validate(newest.confirmationToken, newest)).toEqual({
      status: "ok",
    });
  });
});
