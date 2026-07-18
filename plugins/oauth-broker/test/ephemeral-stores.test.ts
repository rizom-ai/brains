import { describe, expect, it } from "bun:test";
import {
  OAuthBrokerAuthorizationStateStore,
  OAuthBrokerGrantStore,
} from "../src/ephemeral-stores";

const stateSecret = "state-secret-00000000000000000000000000000000";
const grantSecret = "grant-secret-00000000000000000000000000000000";

describe("OAuth broker ephemeral stores", () => {
  it("consumes authorization state once and only for its provider", () => {
    const store = new OAuthBrokerAuthorizationStateStore({
      generateSecret: (): string => stateSecret,
    });
    store.issue({
      providerId: "linkedin",
      instanceId: "brain-one",
      returnUri: "https://brain.example/linkedin/oauth/broker/return",
      brainState: "brain-state-000000000000000000000000",
    });

    expect(store.consume(stateSecret, "google")).toBeUndefined();
    expect(store.consume(stateSecret, "linkedin")).toMatchObject({
      instanceId: "brain-one",
      providerId: "linkedin",
    });
    expect(store.consume(stateSecret, "linkedin")).toBeUndefined();
  });

  it("expires authorization state", () => {
    let now = 1_700_000_000_000;
    const store = new OAuthBrokerAuthorizationStateStore({
      ttlMs: 1_000,
      now: (): number => now,
      generateSecret: (): string => stateSecret,
    });
    store.issue({
      providerId: "linkedin",
      instanceId: "brain-one",
      returnUri: "https://brain.example/linkedin/oauth/broker/return",
      brainState: "brain-state-000000000000000000000000",
    });
    now += 1_000;

    expect(store.consume(stateSecret, "linkedin")).toBeUndefined();
  });

  it("expires grants", () => {
    let now = 1_700_000_000_000;
    const store = new OAuthBrokerGrantStore({
      ttlMs: 1_000,
      now: (): number => now,
      generateSecret: (): string => grantSecret,
    });
    store.issue({
      providerId: "linkedin",
      instanceId: "brain-one",
      credential: { accessToken: "provider-token" },
    });
    now += 1_000;

    expect(store.redeem(grantSecret, "linkedin", "brain-one")).toBeUndefined();
  });

  it("binds grants to provider and instance without consuming a mismatched attempt", () => {
    const store = new OAuthBrokerGrantStore({
      generateSecret: (): string => grantSecret,
    });
    store.issue({
      providerId: "linkedin",
      instanceId: "brain-one",
      credential: { accessToken: "provider-token", expiresIn: 3600 },
    });

    expect(store.redeem(grantSecret, "linkedin", "brain-two")).toBeUndefined();
    expect(store.redeem(grantSecret, "linkedin", "brain-one")).toEqual({
      accessToken: "provider-token",
      expiresIn: 3600,
    });
    expect(store.redeem(grantSecret, "linkedin", "brain-one")).toBeUndefined();
  });
});
