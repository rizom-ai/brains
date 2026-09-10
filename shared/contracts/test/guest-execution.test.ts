import { describe, expect, it } from "bun:test";
import {
  guestExecutionPolicySchema,
  guestConversationOwnershipSchema,
  type GuestExecutionPolicy,
} from "../src/chat";

// Contract test data, not production policy.
const policy: GuestExecutionPolicy = {
  limits: {
    messageCharacters: 100,
    outputTokens: 10,
    contextTokens: 100,
    contextBytes: 1024,
    toolSteps: 1,
    toolCalls: 1,
    toolResultCharacters: 100,
    requestTimeoutSeconds: 1,
  },
  maxCostMicroUsd: 100,
};

describe("server-owned guest execution policy", () => {
  it("requires immutable, bounded retention alongside guest ownership", () => {
    const owner = { visitorId: "10c15c16-919e-4481-8fd4-07f11555a994" };
    expect(guestConversationOwnershipSchema.safeParse(owner).success).toBe(
      false,
    );
    expect(
      guestConversationOwnershipSchema.safeParse({
        ...owner,
        retention: { idleSeconds: 60, maxAgeSeconds: 120 },
      }).success,
    ).toBe(true);
    for (const retention of [
      { idleSeconds: 0, maxAgeSeconds: 120 },
      { idleSeconds: 121, maxAgeSeconds: 120 },
      { idleSeconds: 60, maxAgeSeconds: Infinity },
      { idleSeconds: 60, maxAgeSeconds: Number.MAX_SAFE_INTEGER },
    ]) {
      expect(
        guestConversationOwnershipSchema.safeParse({ ...owner, retention })
          .success,
      ).toBe(false);
    }
  });
  it("requires every execution bound and rejects extra privileges or settings", () => {
    expect(guestExecutionPolicySchema.parse(policy)).toEqual(policy);
    for (const key of Object.keys(policy.limits)) {
      expect(
        guestExecutionPolicySchema.safeParse({
          ...policy,
          limits: { ...policy.limits, [key]: undefined },
        }).success,
      ).toBe(false);
    }
    expect(
      guestExecutionPolicySchema.safeParse({
        ...policy,
        tools: ["system_create"],
      }).success,
    ).toBe(false);
    expect(
      guestExecutionPolicySchema.safeParse({
        ...policy,
        limits: { ...policy.limits, maxRetries: 100 },
      }).success,
    ).toBe(false);
  });

  it("rejects unsafe money and timer representations, fractions and unlimited bounds", () => {
    for (const invalid of [
      0,
      -1,
      0.5,
      Infinity,
      NaN,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(
        guestExecutionPolicySchema.safeParse({
          ...policy,
          maxCostMicroUsd: invalid,
        }).success,
      ).toBe(false);
      for (const key of Object.keys(policy.limits)) {
        expect(
          guestExecutionPolicySchema.safeParse({
            ...policy,
            limits: { ...policy.limits, [key]: invalid },
          }).success,
        ).toBe(false);
      }
    }
    expect(
      guestExecutionPolicySchema.safeParse({
        ...policy,
        limits: { ...policy.limits, requestTimeoutSeconds: 2_147_484 },
      }).success,
    ).toBe(false);
  });
});
