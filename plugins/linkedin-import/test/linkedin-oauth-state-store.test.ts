import { describe, expect, it } from "bun:test";
import { LinkedInOAuthStateStore } from "../src/lib/linkedin-oauth-state-store";

const redirectUri = "https://brain.example/linkedin/callback";

describe("LinkedInOAuthStateStore", () => {
  it("issues expiring state that can be consumed only once", () => {
    const now = 1_700_000_000_000;
    const store = new LinkedInOAuthStateStore({
      now: (): number => now,
      generateState: (): string => "state-one",
      ttlMs: 1_000,
    });

    expect(store.issue(redirectUri)).toBe("state-one");
    expect(store.consume("state-one")).toEqual({
      redirectUri,
      expiresAt: now + 1_000,
    });
    expect(store.consume("state-one")).toBeUndefined();
  });

  it("rejects expired state", () => {
    let now = 1_700_000_000_000;
    const store = new LinkedInOAuthStateStore({
      now: (): number => now,
      generateState: (): string => "state-expiring",
      ttlMs: 1_000,
    });

    store.issue(redirectUri);
    now += 1_000;

    expect(store.consume("state-expiring")).toBeUndefined();
  });

  it("bounds pending state without making a surviving state reusable", () => {
    let sequence = 0;
    const store = new LinkedInOAuthStateStore({
      maxPendingStates: 2,
      generateState: (): string => `state-${++sequence}`,
    });

    store.issue(redirectUri);
    store.issue(redirectUri);
    store.issue(redirectUri);

    expect(store.consume("state-1")).toBeUndefined();
    expect(store.consume("state-2")).toBeDefined();
    expect(store.consume("state-2")).toBeUndefined();
    expect(store.consume("state-3")).toBeDefined();
  });
});
