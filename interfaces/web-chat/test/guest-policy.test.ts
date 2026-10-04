import { describe, expect, it } from "bun:test";
import { webChatConfigSchema } from "../src/config";
import { guestPolicySchema, guestRequestOrigin } from "../src/guest-policy";

import { testGuestPolicy } from "./fixtures/guest-policy";

describe("guest policy", () => {
  it("defaults guest access off without changing authenticated chat routes", () => {
    expect(webChatConfigSchema.parse({})).toEqual({
      routePath: "/ask",
      apiPath: "/api/chat",
    });
  });

  it("requires a complete internal policy after preset resolution", () => {
    expect(guestPolicySchema.safeParse({ enabled: true }).success).toBe(false);
    expect(guestPolicySchema.safeParse(testGuestPolicy).success).toBe(true);
    for (const key of [
      "limits",
      "retention",
      "budget",
      "disclosure",
      "origin",
    ]) {
      const incomplete = { ...testGuestPolicy, [key]: undefined };
      expect(guestPolicySchema.safeParse(incomplete).success).toBe(false);
    }
  });

  it("rejects unlimited, non-finite and inconsistent limits", () => {
    for (const value of [0, -1, Infinity, NaN, 1.5]) {
      expect(
        guestPolicySchema.safeParse({
          ...testGuestPolicy,
          limits: { ...testGuestPolicy.limits, globalConcurrency: value },
        }).success,
      ).toBe(false);
    }
    for (const override of [
      { contextTokens: 100 },
      { streamIdleTimeoutSeconds: 100 },
      { requestsPerDay: 1 },
      { globalRequestsPerDay: 1 },
    ]) {
      expect(
        guestPolicySchema.safeParse({
          ...testGuestPolicy,
          limits: { ...testGuestPolicy.limits, ...override },
        }).success,
      ).toBe(false);
    }
    expect(
      guestPolicySchema.safeParse({
        ...testGuestPolicy,
        retention: { idleSeconds: 100, maxAgeSeconds: 10 },
      }).success,
    ).toBe(false);
    expect(
      guestPolicySchema.safeParse({
        ...testGuestPolicy,
        budget: { dailyUsd: 1, maxTurnUsd: 2 },
      }).success,
    ).toBe(false);
  });

  it("requires a secure canonical origin, allowing explicit loopback development", () => {
    for (const origin of [
      "http://brain.test",
      "https://brain.test/ask",
      "https://brain.test?x=1",
      "https://user:password@brain.test",
      "https://brain.test#fragment",
      "*",
    ]) {
      expect(
        guestPolicySchema.safeParse({ ...testGuestPolicy, origin }).success,
      ).toBe(false);
    }
    for (const origin of [
      "http://localhost:8080",
      "http://127.0.0.1:8080",
      "https://preview.brain.test",
    ]) {
      expect(
        guestPolicySchema.safeParse({ ...testGuestPolicy, origin }).success,
      ).toBe(true);
    }
  });

  it("serves the site and its preview, holding the preview to the same origin rules", () => {
    const policy = guestPolicySchema.parse({
      ...testGuestPolicy,
      origin: "https://brain.test",
      budgeted: true,
      previewOrigin: "https://preview.brain.test",
    });
    if (!policy.enabled) throw new Error("Expected an enabled policy");
    const on = (url: string): string | undefined =>
      guestRequestOrigin(new Request(url), policy);
    expect(on("https://brain.test/ask")).toBe("https://brain.test");
    expect(on("https://preview.brain.test/ask")).toBe(
      "https://preview.brain.test",
    );
    // TLS ends at the proxy: the backend sees each configured host over HTTP.
    expect(on("http://preview.brain.test/ask")).toBe(
      "https://preview.brain.test",
    );
    expect(on("https://other.test/ask")).toBeUndefined();
    for (const previewOrigin of ["http://preview.brain.test", "*"]) {
      expect(
        guestPolicySchema.safeParse({ ...testGuestPolicy, previewOrigin })
          .success,
      ).toBe(false);
    }
  });

  it("does not accept caller privilege, tools or implicit disabled-policy overrides", () => {
    for (const extra of [
      { tools: ["system_create"] },
      { isAnchor: true },
      { permissionLevel: "admin" },
    ]) {
      expect(
        guestPolicySchema.safeParse({ ...testGuestPolicy, ...extra }).success,
      ).toBe(false);
    }
    expect(
      guestPolicySchema.safeParse({ enabled: false, budget: { dailyUsd: 1 } })
        .success,
    ).toBe(false);
  });
});
