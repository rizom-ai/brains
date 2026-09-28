import { describe, expect, it } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RuntimeStateService } from "@brains/runtime-state";
import { migrateRuntimeState } from "@brains/runtime-state/migrate";
import { createMemoryRuntimeStateNamespace } from "@brains/plugins/test";
import { guestInterfaceType } from "@brains/contracts/chat";
import { webChatConfigSchema } from "../src/config";
import { createDefaultGuestPolicy } from "../src/guest-preset";
import { GuestAdmission } from "../src/guest-admission";
import {
  guestAdmissionNamespace,
  guestAdmissionStateSchema,
} from "../src/guest-admission-state";
import { GuestStateMaintenance } from "../src/guest-maintenance";
import type { EnabledGuestPolicy } from "../src/guest-policy";
import type { GuestVisitor } from "../src/guest-access";
import type { WebChatConversation } from "../src/conversation-access";

const start = Date.parse("2026-09-10T12:00:00Z");
const minute = 60_000;
const dollars = (usd: number): number => Math.round(usd * 1_000_000);

/** The managed preview policy, as GuestAccessControl builds it. */
function budgeted(origin = "https://preview.brain.test"): EnabledGuestPolicy {
  const defaults = createDefaultGuestPolicy(origin);
  if (!defaults.enabled) throw new Error("Expected shared guest defaults");
  return { ...defaults, budgeted: true };
}

function request(
  policy: EnabledGuestPolicy,
  now: number,
): { owner: GuestVisitor; chat: WebChatConversation; submission: string } {
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

async function ask(
  admission: GuestAdmission,
  policy: EnabledGuestPolicy,
  now: number,
): ReturnType<GuestAdmission["reserve"]> {
  const r = request(policy, now);
  return admission.reserve(r.owner, r.chat, r.submission, "question");
}

function ledger(policy = budgeted()): {
  admission: GuestAdmission;
  policy: EnabledGuestPolicy;
  clock: { now: number };
} {
  const clock = { now: start };
  const admission = new GuestAdmission(
    createMemoryRuntimeStateNamespace(),
    policy,
    { now: (): number => clock.now, requireAuthorization: true },
  );
  return { admission, policy, clock };
}

/** Settles an admitted question; without a cost, the answer cap is charged. */
async function answer(
  admission: GuestAdmission,
  policy: EnabledGuestPolicy,
  now: number,
  measuredMicroUsd?: number,
): Promise<boolean> {
  const admitted = await ask(admission, policy, now);
  if (admitted.kind !== "reserved") return false;
  return admission.settle(admitted.lease, "completed", measuredMicroUsd);
}

describe("an owner-set monthly budget for guest chat", () => {
  it("does not take a budget from product configuration", () => {
    // Omission permits owner activation; explicit false disables it.
    expect(webChatConfigSchema.parse({}).guest).toBeUndefined();
    expect(webChatConfigSchema.parse({ guest: false }).guest).toBe(false);
    for (const guest of [
      { origin: "https://preview.brain.test", budgeted: true },
      { origin: "https://preview.brain.test", monthlyUsd: 10 },
      { origin: "https://preview.brain.test", allowance: { requests: 2 } },
    ])
      expect(webChatConfigSchema.safeParse({ guest }).success).toBe(false);
  });

  it("admits nothing until the owner sets a budget, and charges nothing up front", async () => {
    const { admission, policy, clock } = ledger();
    expect(await ask(admission, policy, clock.now)).toEqual({
      kind: "denied",
      reason: "unavailable",
    });
    expect(await admission.authorize(dollars(10))).toBe(true);
    const admitted = await ask(admission, policy, clock.now);
    if (admitted.kind !== "reserved") throw new Error("Expected admission");
    // The most one answer can cost, charged only when its cost is unknown.
    expect(admitted.lease.execution.maxCostMicroUsd).toBe(dollars(0.05));
    expect(await admission.accessStatus()).toMatchObject({
      authorized: true,
      enabled: true,
      budgetMicroUsd: dollars(10),
      chargedMicroUsd: 0,
      answerCapMicroUsd: dollars(0.05),
    });
  });

  it("refuses a budget below one answer's cap or beyond its bound", async () => {
    const { admission } = ledger();
    expect(await admission.authorize(dollars(0.01))).toBe(false);
    expect(await admission.authorize(dollars(100_000))).toBe(false);
    expect(await admission.authorize(1.5)).toBe(false);
    expect((await admission.accessStatus())?.authorized).toBe(false);
  });

  it("charges each answer its measured cost, or the answer cap when it is unknown", async () => {
    const { admission, policy, clock } = ledger();
    await admission.authorize(dollars(10));
    expect(await answer(admission, policy, clock.now, 12_000)).toBe(true);
    clock.now += minute;
    for (const outcome of ["failed", "interrupted"] as const) {
      const admitted = await ask(admission, policy, clock.now);
      if (admitted.kind !== "reserved") throw new Error("Expected admission");
      expect(await admission.settle(admitted.lease, outcome)).toBe(true);
    }
    expect((await admission.accessStatus())?.chargedMicroUsd).toBe(
      12_000 + 2 * dollars(0.05),
    );
  });

  it("admits while the month's spend is under the budget; answers in flight may overshoot it", async () => {
    const { admission, policy, clock } = ledger();
    await admission.authorize(dollars(0.1));
    expect(await answer(admission, policy, clock.now)).toBe(true);
    const first = await ask(admission, policy, clock.now);
    const second = await ask(admission, policy, clock.now);
    if (first.kind !== "reserved" || second.kind !== "reserved")
      throw new Error("Both run while the spend is under the budget");
    await admission.settle(first.lease, "completed");
    await admission.settle(second.lease, "completed");
    expect(await admission.accessStatus()).toMatchObject({
      chargedMicroUsd: dollars(0.15),
      enabled: false,
    });
    expect(await ask(admission, policy, clock.now)).toEqual({
      kind: "denied",
      reason: "budget-exhausted",
    });
  });

  it("stops holding answers past their deadline, charging each the answer cap", async () => {
    const { admission, policy, clock } = ledger();
    await admission.authorize(dollars(10));
    const stuck = await Promise.all(
      Array.from({ length: policy.limits.globalConcurrency }, () =>
        ask(admission, policy, clock.now),
      ),
    );
    expect(stuck.every((result) => result.kind === "reserved")).toBe(true);
    expect(await ask(admission, policy, clock.now)).toEqual({
      kind: "denied",
      reason: "deployment-busy",
    });
    clock.now += policy.limits.requestTimeoutSeconds * 1000;
    expect((await ask(admission, policy, clock.now)).kind).toBe("reserved");
    expect((await admission.accessStatus())?.chargedMicroUsd).toBe(
      stuck.length * dollars(0.05),
    );
  });

  it("never limits by the number of questions or sessions, only by money", async () => {
    const { admission, policy, clock } = ledger();
    await admission.authorize(dollars(1));
    const answered = await Array.from({ length: 12 }).reduce<Promise<number>>(
      async (count) => {
        const done = await count;
        clock.now += minute;
        return (await answer(admission, policy, clock.now, 10_000))
          ? done + 1
          : done;
      },
      Promise.resolve(0),
    );
    expect(answered).toBe(12);
    expect((await admission.accessStatus())?.chargedMicroUsd).toBe(120_000);
  });

  it("starts over each UTC month, charging work to the month it finishes in", async () => {
    const { admission, policy, clock } = ledger();
    await admission.authorize(dollars(0.1));
    clock.now = Date.parse("2026-09-30T23:58:00Z");
    expect(await answer(admission, policy, clock.now)).toBe(true);
    const inFlight = await ask(admission, policy, clock.now);
    if (inFlight.kind !== "reserved") throw new Error("Expected admission");
    expect(await answer(admission, policy, clock.now)).toBe(true);
    expect(await ask(admission, policy, clock.now)).toEqual({
      kind: "denied",
      reason: "budget-exhausted",
    });
    clock.now = Date.parse("2026-10-01T00:01:00Z");
    await admission.settle(inFlight.lease, "completed", 7_000);
    expect(await admission.accessStatus()).toMatchObject({
      month: "2026-10",
      chargedMicroUsd: 7_000,
      enabled: true,
    });
  });

  it("keeps the month's spend when switched off and on, or when the budget changes", async () => {
    const { admission, policy, clock } = ledger();
    await admission.authorize(dollars(1));
    expect(await answer(admission, policy, clock.now)).toBe(true);
    expect(await admission.applyPolicy(false)).toBe(true);
    expect((await ask(admission, policy, clock.now)).kind).toBe("denied");
    expect(await admission.applyPolicy(true)).toBe(true);
    expect(await admission.authorize(dollars(5))).toBe(true);
    expect(await admission.accessStatus()).toMatchObject({
      budgetMicroUsd: dollars(5),
      chargedMicroUsd: dollars(0.05),
    });
  });

  it("keeps the owner's budget through a change of limits", async () => {
    const state = createMemoryRuntimeStateNamespace();
    const now = (): number => start;
    const options = { now, requireAuthorization: true };
    const before = budgeted();
    await new GuestAdmission(state, before, options).authorize(dollars(1));
    const after: EnabledGuestPolicy = {
      ...before,
      limits: { ...before.limits, userTurns: before.limits.userTurns + 1 },
    };
    const admission = new GuestAdmission(state, after, options);
    expect((await admission.accessStatus())?.enabled).toBe(true);
    expect((await ask(admission, after, start)).kind).toBe("reserved");
  });

  it("does not carry a budget to another origin, nor reset the deployment's month", async () => {
    const state = createMemoryRuntimeStateNamespace();
    const now = (): number => start;
    const options = { now, requireAuthorization: true };
    const preview = budgeted();
    const first = new GuestAdmission(state, preview, options);
    await first.authorize(dollars(1));
    expect(await answer(first, preview, start)).toBe(true);
    const moved = budgeted("https://preview.other.test");
    const second = new GuestAdmission(state, moved, options);
    expect(await ask(second, moved, start)).toEqual({
      kind: "denied",
      reason: "unavailable",
    });
    expect(await second.authorize(dollars(1))).toBe(true);
    expect((await second.accessStatus())?.chargedMicroUsd).toBe(dollars(0.05));
  });

  it("shares the month's spend across SQLite connections and a restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "guest-budget-"));
    const config = { url: `file:${join(directory, "state.db")}` };
    await migrateRuntimeState(config);
    const first = RuntimeStateService.createFresh(config);
    const second = RuntimeStateService.createFresh(config);
    const policy = budgeted();
    const now = (): number => start;
    try {
      await Promise.all([first.initialize(), second.initialize()]);
      const options = { now, requireAuthorization: true };
      const a = new GuestAdmission(first, policy, options);
      const b = new GuestAdmission(second, policy, options);
      expect(await a.authorize(dollars(0.1))).toBe(true);
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, i) => ask(i % 2 ? a : b, policy, start)),
      );
      const admitted = results.flatMap((r) =>
        r.kind === "reserved" ? [r.lease] : [],
      );
      // Admission is bounded by concurrency, not by an up-front charge.
      expect(admitted).toHaveLength(policy.limits.globalConcurrency);
      for (const lease of admitted) await a.settle(lease, "completed");
      first.close();
      second.close();
      const restarted = RuntimeStateService.createFresh(config);
      try {
        await restarted.initialize();
        const admission = new GuestAdmission(restarted, policy, options);
        expect(await admission.accessStatus()).toMatchObject({
          chargedMicroUsd: admitted.length * dollars(0.05),
          enabled: false,
        });
      } finally {
        restarted.close();
      }
    } finally {
      first.close();
      second.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("leaves an old trial ledger unread, and still sweeps it", async () => {
    const state = createMemoryRuntimeStateNamespace();
    const trialKey = createHash("sha256")
      .update(JSON.stringify(["guest-allowance"]))
      .digest("hex");
    await state
      .scoped({
        namespace: guestAdmissionNamespace,
        schema: guestAdmissionStateSchema,
      })
      .set(trialKey, {
        version: 1,
        revision: 3,
        policy: "a".repeat(64),
        enabled: true,
        lastSeenAt: start,
        receipts: {},
        lifetime: { requests: 2, reservedMicroUsd: dollars(4) },
        authorization: {
          origin: "https://preview.brain.test",
          requests: 2,
          maxCostMicroUsd: dollars(4),
        },
      });
    const policy = budgeted();
    const admission = new GuestAdmission(state, policy, {
      now: (): number => start,
      requireAuthorization: true,
    });
    expect((await admission.accessStatus())?.authorized).toBe(false);
    expect(await ask(admission, policy, start)).toEqual({
      kind: "denied",
      reason: "unavailable",
    });
    expect(
      await new GuestStateMaintenance(state, (): number => start)
        .run()
        .then(() => "swept"),
    ).toBe("swept");
  });
});
