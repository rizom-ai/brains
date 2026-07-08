import { describe, expect, it } from "bun:test";
import { ConfirmationArgsStore } from "../src/confirmation-args-store";

describe("ConfirmationArgsStore", () => {
  it("validates matching confirmation args and consumes the token", () => {
    const store = new ConfirmationArgsStore();
    const args = store.create((confirmationToken) => ({
      source: { kind: "url", url: "peer.example" },
      confirmed: true,
      confirmationToken,
    }));

    expect(store.validate(args.confirmationToken, args)).toEqual({
      status: "ok",
    });
    expect(store.validate(args.confirmationToken, args)).toEqual({
      status: "missing",
    });
  });

  it("compares args stably and ignores undefined object fields", () => {
    const store = new ConfirmationArgsStore();
    const args = store.create((confirmationToken) => ({
      b: "two",
      a: "one",
      omitted: undefined,
      confirmationToken,
    }));

    expect(
      store.validate(args.confirmationToken, {
        confirmationToken: args.confirmationToken,
        a: "one",
        b: "two",
      }),
    ).toEqual({ status: "ok" });
  });

  it("rejects changed confirmation args", () => {
    const store = new ConfirmationArgsStore();
    const args = store.create((confirmationToken) => ({
      source: { kind: "url", url: "original.example" },
      confirmed: true,
      confirmationToken,
    }));

    expect(
      store.validate(args.confirmationToken, {
        ...args,
        source: { kind: "url", url: "changed.example" },
      }),
    ).toEqual({ status: "mismatch" });
  });

  it("expires unconsumed confirmations after the TTL", () => {
    let now = 0;
    const store = new ConfirmationArgsStore({
      ttlMs: 1_000,
      now: (): number => now,
    });
    const args = store.create((confirmationToken) => ({ confirmationToken }));

    now = 999;
    const fresh = store.create((confirmationToken) => ({ confirmationToken }));
    expect(store.validate(fresh.confirmationToken, fresh)).toEqual({
      status: "ok",
    });

    now = 1_001;
    expect(store.validate(args.confirmationToken, args)).toEqual({
      status: "missing",
    });
  });

  it("evicts the oldest entries beyond the pending cap", () => {
    const store = new ConfirmationArgsStore({ maxPending: 2 });
    const first = store.create((confirmationToken) => ({ confirmationToken }));
    const second = store.create((confirmationToken) => ({
      confirmationToken,
    }));
    const third = store.create((confirmationToken) => ({ confirmationToken }));

    expect(store.validate(first.confirmationToken, first)).toEqual({
      status: "missing",
    });
    expect(store.validate(second.confirmationToken, second)).toEqual({
      status: "ok",
    });
    expect(store.validate(third.confirmationToken, third)).toEqual({
      status: "ok",
    });
  });
});
