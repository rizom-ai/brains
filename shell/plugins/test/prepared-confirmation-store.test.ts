import { describe, expect, it } from "bun:test";
import {
  createPreparedConfirmationStore,
  type PreparedConfirmationClaim,
} from "../src/operator/prepared-confirmation-store";

const claim: PreparedConfirmationClaim = {
  callerId: "user-1",
  actionId: "publish",
  input: { id: "one", tags: ["a", "b"] },
};

function clock(start = 1_000_000): {
  now: () => number;
  advance: (ms: number) => void;
} {
  let current = start;
  return {
    now: (): number => current,
    advance: (ms: number): void => {
      current += ms;
    },
  };
}

describe("prepared confirmation store", () => {
  it("issues a token that expires after the TTL and redeems to its revision", () => {
    const time = clock();
    const store = createPreparedConfirmationStore({ now: time.now });
    const issued = store.issue({ ...claim, revision: "revision-1" });
    expect(issued.expiresAt).toBe(1_000_000 + 5 * 60 * 1_000);
    expect(store.redeem(issued.token, claim)).toEqual({
      revision: "revision-1",
    });
  });

  it("issues distinct tokens", () => {
    const store = createPreparedConfirmationStore({ now: clock().now });
    const first = store.issue({ ...claim, revision: "r" });
    const second = store.issue({ ...claim, revision: "r" });
    expect(first.token).not.toBe(second.token);
  });

  it("matches input regardless of object key order", () => {
    const store = createPreparedConfirmationStore({ now: clock().now });
    const { token } = store.issue({ ...claim, revision: "r" });
    expect(
      store.redeem(token, { ...claim, input: { tags: ["a", "b"], id: "one" } }),
    ).toEqual({ revision: "r" });
  });

  it("allows each token to be redeemed once", () => {
    const store = createPreparedConfirmationStore({ now: clock().now });
    const { token } = store.issue({ ...claim, revision: "r" });
    expect(store.redeem(token, claim)).toEqual({ revision: "r" });
    expect(store.redeem(token, claim)).toBeUndefined();
  });

  it("consumes the token even when redemption is rejected", () => {
    const store = createPreparedConfirmationStore({ now: clock().now });
    const { token } = store.issue({ ...claim, revision: "r" });
    expect(
      store.redeem(token, { ...claim, callerId: "user-2" }),
    ).toBeUndefined();
    expect(store.redeem(token, claim)).toBeUndefined();
  });

  it("rejects a missing or unknown token", () => {
    const store = createPreparedConfirmationStore({ now: clock().now });
    store.issue({ ...claim, revision: "r" });
    expect(store.redeem(undefined, claim)).toBeUndefined();
    expect(
      store.redeem("00000000-0000-4000-8000-000000000000", claim),
    ).toBeUndefined();
  });

  it("rejects a token at or after its expiry", () => {
    const time = clock();
    const store = createPreparedConfirmationStore({ now: time.now });
    const beforeExpiry = store.issue({ ...claim, revision: "r" });
    const atExpiry = store.issue({ ...claim, revision: "r" });
    time.advance(5 * 60 * 1_000 - 1);
    expect(store.redeem(beforeExpiry.token, claim)).toEqual({ revision: "r" });
    time.advance(1);
    expect(store.redeem(atExpiry.token, claim)).toBeUndefined();
  });

  it("rejects a different caller", () => {
    const store = createPreparedConfirmationStore({ now: clock().now });
    const { token } = store.issue({ ...claim, revision: "r" });
    expect(
      store.redeem(token, { ...claim, callerId: "user-2" }),
    ).toBeUndefined();
  });

  it("rejects a different action", () => {
    const store = createPreparedConfirmationStore({ now: clock().now });
    const { token } = store.issue({ ...claim, revision: "r" });
    expect(
      store.redeem(token, { ...claim, actionId: "alternate" }),
    ).toBeUndefined();
  });

  it("rejects different input", () => {
    const store = createPreparedConfirmationStore({ now: clock().now });
    const { token } = store.issue({ ...claim, revision: "r" });
    expect(
      store.redeem(token, { ...claim, input: { id: "two", tags: ["a", "b"] } }),
    ).toBeUndefined();
  });

  it("evicts the oldest records when issuing at the cap", () => {
    const store = createPreparedConfirmationStore({
      now: clock().now,
      maxRecords: 3,
    });
    const tokens = ["a", "b", "c", "d"].map(
      (revision) => store.issue({ ...claim, revision }).token,
    );
    expect(store.redeem(tokens[0], claim)).toBeUndefined();
    expect(store.redeem(tokens[1], claim)).toEqual({ revision: "b" });
    expect(store.redeem(tokens[2], claim)).toEqual({ revision: "c" });
    expect(store.redeem(tokens[3], claim)).toEqual({ revision: "d" });
  });

  it("keeps live records when expired ones free capacity at the cap", () => {
    const time = clock();
    const store = createPreparedConfirmationStore({
      now: time.now,
      maxRecords: 2,
    });
    store.issue({ ...claim, revision: "expired" });
    time.advance(60 * 1_000);
    const live = store.issue({ ...claim, revision: "live" }).token;
    time.advance(4 * 60 * 1_000);
    const fresh = store.issue({ ...claim, revision: "fresh" }).token;
    expect(store.redeem(live, claim)).toEqual({ revision: "live" });
    expect(store.redeem(fresh, claim)).toEqual({ revision: "fresh" });
  });

  it("caps at 1000 records by default", () => {
    const store = createPreparedConfirmationStore({ now: clock().now });
    const oldest = store.issue({ ...claim, revision: "oldest" }).token;
    const rest = Array.from(
      { length: 999 },
      (_, index) => store.issue({ ...claim, revision: `r-${index}` }).token,
    );
    const overflow = store.issue({ ...claim, revision: "overflow" }).token;
    expect(store.redeem(oldest, claim)).toBeUndefined();
    expect(store.redeem(rest[0], claim)).toEqual({ revision: "r-0" });
    expect(store.redeem(overflow, claim)).toEqual({ revision: "overflow" });
  });
});
