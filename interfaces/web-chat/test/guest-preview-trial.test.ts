import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RuntimeStateService } from "@brains/runtime-state";
import { migrateRuntimeState } from "@brains/runtime-state/migrate";
import { createMemoryRuntimeStateNamespace } from "@brains/plugins/test";
import { guestInterfaceType } from "@brains/contracts/chat";
import { webChatConfigSchema } from "../src/config";
import { resolveGuestPreset } from "../src/guest-preset";
import { GuestAdmission } from "../src/guest-admission";
import type { EnabledGuestPolicy } from "../src/guest-policy";
import type { GuestVisitor } from "../src/guest-access";
import type { WebChatConversation } from "../src/conversation-access";

const start = Date.parse("2026-09-01T12:00:00Z");
const day = 86_400_000;
function trial(origin = "https://preview.brain.test"): EnabledGuestPolicy {
  // Server-owned admission fixture, not author-facing configuration.
  const defaults = resolveGuestPreset("local-test");
  if (!defaults.enabled) throw new Error("Expected shared guest defaults");
  return {
    ...defaults,
    origin,
    allowance: { requests: 2, maxCostMicroUsd: 4_000_000 },
  };
}
function request(
  policy: EnabledGuestPolicy,
  now = start,
): {
  owner: GuestVisitor;
  chat: WebChatConversation;
  submission: string;
} {
  const owner: GuestVisitor = {
    kind: "guest",
    id: randomUUID(),
    createdAt: now,
    expiresAt: now + policy.retention.idleSeconds * 1000,
  };
  const id = randomUUID();
  const timestamp = new Date(now).toISOString();
  return {
    owner,
    submission: randomUUID(),
    chat: {
      id,
      sessionId: id,
      channelId: id,
      interfaceType: guestInterfaceType,
      startedAt: timestamp,
      lastActiveAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      metadata: { guest: { visitorId: owner.id, retention: policy.retention } },
    },
  };
}

describe("one deployment-wide preview trial, never a recurring allowance", () => {
  it("does not expose test authorization as product configuration", () => {
    // Omission permits operator authorization, but never authorizes a trial.
    expect(webChatConfigSchema.parse({}).guest).toBeUndefined();
    expect(webChatConfigSchema.parse({ guest: false }).guest).toBe(false);
    expect(
      webChatConfigSchema.safeParse({
        guest: {
          origin: "https://preview.brain.test",
          allowance: { requests: 2, usd: 4 },
        },
      }).success,
    ).toBe(false);
    expect(trial()).toMatchObject({
      limits: { userTurns: 2, globalConcurrency: 1, toolCalls: 3 },
      budget: { dailyUsd: 4, maxTurnUsd: 2 },
    });
  });

  it("does not give preview hostnames special runtime meaning", () => {
    expect(trial("https://another.example").origin).toBe(
      "https://another.example",
    );
    expect(
      webChatConfigSchema.safeParse({
        guest: { preset: "preview-test", origin: "https://preview.brain.test" },
      }).success,
    ).toBe(false);
  });

  it.each([
    { origin: "https://preview.brain.test" },
    { origin: "http://preview.brain.test", allowance: { requests: 2, usd: 4 } },
    {
      origin: "https://preview.brain.test/",
      allowance: { requests: 2, usd: 4 },
    },
    {
      origin: "https://user@preview.brain.test",
      allowance: { requests: 2, usd: 4 },
    },
    {
      origin: "https://preview.brain.test",
      allowance: { requests: 0, usd: 4 },
    },
    {
      origin: "https://preview.brain.test",
      allowance: { requests: 2, usd: 0 },
    },
    {
      origin: "https://preview.brain.test",
      allowance: { requests: 2, usd: Infinity },
    },
    {
      origin: "https://preview.brain.test",
      allowance: { requests: 2, usd: 4 },
      reset: true,
    },
    {
      origin: "https://preview.brain.test",
      allowance: { requests: 2, usd: 4 },
      trialId: "new",
    },
  ])(
    "rejects unsafe configuration and allowance reset controls: %j",
    (guest) => {
      expect(webChatConfigSchema.safeParse({ guest }).success).toBe(false);
    },
  );

  it("never refunds failed turns or renews usage after receipt cleanup and policy re-enablement", async () => {
    const state = createMemoryRuntimeStateNamespace();
    const policy = trial();
    let now = start;
    let admission = new GuestAdmission(state, policy, {
      now: (): number => now,
    });
    let totalReserved = 0;
    for (const outcome of ["failed", "interrupted"] as const) {
      const r = request(policy, now);
      const admitted = await admission.reserve(
        r.owner,
        r.chat,
        r.submission,
        "question",
      );
      if (admitted.kind !== "reserved")
        throw new Error("Expected approved turn");
      totalReserved += admitted.lease.execution.maxCostMicroUsd;
      expect(await admission.settle(admitted.lease, outcome)).toBe(true);
      now += day * 2;
      expect(await admission.cleanup()).toEqual({ removed: 1, uncertain: 0 });
      admission = new GuestAdmission(state, policy, { now: (): number => now });
    }
    expect(totalReserved).toBe(4_000_000);
    expect(await admission.applyPolicy(false)).toBe(true);
    expect(await admission.applyPolicy(true)).toBe(true);
    const fresh = request(policy, now);
    expect(
      await admission.reserve(
        fresh.owner,
        fresh.chat,
        fresh.submission,
        "third",
      ),
    ).toEqual({ kind: "denied", reason: "budget-exhausted" });
  });

  it("retains uncertain identity, deduplicates retries and allows only the follow-up", async () => {
    const state = createMemoryRuntimeStateNamespace();
    const policy = trial();
    let now = start;
    const a = new GuestAdmission(state, policy, { now: (): number => now });
    const r = request(policy);
    const admitted = await a.reserve(r.owner, r.chat, r.submission, "question");
    if (admitted.kind !== "reserved") throw new Error("Expected first turn");
    now += 100_000;
    const b = new GuestAdmission(state, policy, { now: (): number => now });
    expect(await b.reserve(r.owner, r.chat, r.submission, "question")).toEqual({
      kind: "duplicate",
      state: "uncertain",
    });
    expect(await b.reserve(r.owner, r.chat, randomUUID(), "follow-up")).toEqual(
      { kind: "denied", reason: "visitor-busy" },
    );
    expect(await b.settle(admitted.lease, "interrupted")).toBe(true);
    const second = await b.reserve(r.owner, r.chat, randomUUID(), "follow-up");
    if (second.kind !== "reserved") throw new Error("Expected second turn");
    expect(await b.settle(second.lease, "completed")).toBe(true);
    expect(await b.reserve(r.owner, r.chat, r.submission, "question")).toEqual({
      kind: "duplicate",
      state: "interrupted",
    });
    expect(await b.reserve(r.owner, r.chat, randomUUID(), "third")).toEqual({
      kind: "denied",
      reason: "budget-exhausted",
    });
  });

  it("does not mint another allowance by changing the preview hostname", async () => {
    const state = createMemoryRuntimeStateNamespace();
    const policy = trial();
    let now = start;
    const admission = new GuestAdmission(state, policy, {
      now: (): number => now,
    });
    for (let n = 0; n < 2; n++) {
      const r = request(policy, now);
      const admitted = await admission.reserve(
        r.owner,
        r.chat,
        r.submission,
        "question",
      );
      if (admitted.kind !== "reserved")
        throw new Error("Expected approved turn");
      expect(await admission.settle(admitted.lease, "completed")).toBe(true);
    }
    now += day * 2;
    expect((await admission.cleanup())?.removed).toBe(2);
    const changed = trial("https://preview.other.test");
    const other = new GuestAdmission(state, changed, {
      now: (): number => now,
    });
    const r = request(changed, now);
    expect(
      await other.reserve(r.owner, r.chat, r.submission, "new origin"),
    ).toEqual({ kind: "denied", reason: "unavailable" });
    expect(await other.applyPolicy(true)).toBe(true);
    expect(
      await other.reserve(r.owner, r.chat, r.submission, "new origin"),
    ).toEqual({ kind: "denied", reason: "budget-exhausted" });
  });

  it("shares lifetime reservations across SQLite connections, cleanup and a real database restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "guest-preview-trial-"));
    const config = { url: `file:${join(directory, "state.db")}` };
    await migrateRuntimeState(config);
    const first = RuntimeStateService.createFresh(config);
    const second = RuntimeStateService.createFresh(config);
    const policy = trial();
    let now = start;
    try {
      await Promise.all([first.initialize(), second.initialize()]);
      const a = new GuestAdmission(first, policy, { now: (): number => now });
      const b = new GuestAdmission(second, policy, { now: (): number => now });
      let total = 0;
      for (let turn = 0; turn < 2; turn++) {
        const results = await Promise.all(
          Array.from({ length: 8 }, (_, i) => {
            const r = request(policy, now);
            return (i % 2 ? a : b).reserve(
              r.owner,
              r.chat,
              r.submission,
              "question",
            );
          }),
        );
        const winners = results.filter((r) => r.kind === "reserved");
        expect(winners).toHaveLength(1);
        const winner = winners[0];
        if (!winner) throw new Error("Missing winning reservation");
        total += winner.lease.execution.maxCostMicroUsd;
        expect(await a.settle(winner.lease, "failed")).toBe(true);
        now += day * 2;
        expect((await b.cleanup())?.removed).toBe(1);
      }
      expect(total).toBe(4_000_000);
      first.close();
      second.close();
      const restarted = RuntimeStateService.createFresh(config);
      try {
        await restarted.initialize();
        const admission = new GuestAdmission(restarted, policy, {
          now: (): number => now,
        });
        const r = request(policy, now);
        expect(
          await admission.reserve(
            r.owner,
            r.chat,
            r.submission,
            "after restart",
          ),
        ).toEqual({ kind: "denied", reason: "budget-exhausted" });
      } finally {
        restarted.close();
      }
    } finally {
      first.close();
      second.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
