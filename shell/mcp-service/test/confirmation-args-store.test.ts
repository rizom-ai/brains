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
});
