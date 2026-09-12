import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RuntimeStateService } from "@brains/runtime-state";
import { migrateRuntimeState } from "@brains/runtime-state/migrate";
import type {
  IRuntimeStateNamespace,
  IRuntimeStateStore,
  RuntimeStateScopeOptions,
} from "@brains/plugins";
import { guestAdmissionStateSchema } from "../src/guest-admission-state";
import { createMemoryRuntimeStateNamespace } from "@brains/plugins/test";
import { guestInterfaceType } from "@brains/contracts/chat";
import { GuestAdmission } from "../src/guest-admission";
import type { GuestVisitor } from "../src/guest-access";
import type { WebChatConversation } from "../src/conversation-access";
import { testGuestPolicy } from "./fixtures/guest-policy";

const start = Date.parse("2026-09-01T12:00:00Z");

function visitor(now = start): GuestVisitor {
  return {
    kind: "guest",
    id: randomUUID(),
    createdAt: now,
    expiresAt: now + testGuestPolicy.retention.maxAgeSeconds * 1000,
  };
}

function conversation(owner: GuestVisitor, now = start): WebChatConversation {
  const id = randomUUID();
  const timestamp = new Date(now).toISOString();
  return {
    id,
    sessionId: id,
    channelId: id,
    interfaceType: guestInterfaceType,
    startedAt: timestamp,
    lastActiveAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    metadata: {
      guest: { visitorId: owner.id, retention: testGuestPolicy.retention },
    },
  };
}

describe("guest admission", () => {
  it("atomically admits one parallel submission per visitor, including separate tabs/conversations", async () => {
    const state = createMemoryRuntimeStateNamespace();
    const first = new GuestAdmission(state, testGuestPolicy, {
      now: (): number => start,
    });
    const second = new GuestAdmission(state, testGuestPolicy, {
      now: (): number => start,
    });
    const owner = visitor();
    const results = await Promise.all([
      first.reserve(owner, conversation(owner), "tab-1", "hello"),
      second.reserve(owner, conversation(owner), "tab-2", "hello"),
    ]);
    expect(results.filter((entry) => entry.kind === "reserved")).toHaveLength(
      1,
    );
    expect(results).toContainEqual({ kind: "denied", reason: "visitor-busy" });
  });

  it("deduplicates concurrent retries without returning another execution lease", async () => {
    const state = createMemoryRuntimeStateNamespace();
    const admissions = [
      new GuestAdmission(state, testGuestPolicy, { now: (): number => start }),
      new GuestAdmission(state, testGuestPolicy, { now: (): number => start }),
    ];
    const owner = visitor();
    const chat = conversation(owner);
    const results = await Promise.all(
      admissions.map((admission) =>
        admission.reserve(owner, chat, "same-submission", "hello"),
      ),
    );
    expect(results.filter((entry) => entry.kind === "reserved")).toHaveLength(
      1,
    );
    expect(results).toContainEqual({ kind: "duplicate", state: "active" });
    const admitted = results.find((entry) => entry.kind === "reserved");
    const first = admissions[0];
    if (!admitted || !first) throw new Error("Expected an execution lease");
    expect(admitted.lease.execution).toMatchObject({
      maxCostMicroUsd: 100000,
      limits: { contextBytes: 32000, toolCalls: 3 },
    });
    expect(admitted.lease.execution.limits).not.toHaveProperty(
      "globalConcurrency",
    );
    expect(await first.settle(admitted.lease, "completed")).toBe(true);
    expect(
      await first.reserve(owner, chat, "same-submission", "hello"),
    ).toEqual({ kind: "duplicate", state: "completed" });
    expect(
      await first.reserve(owner, chat, "same-submission", "changed text"),
    ).toEqual({ kind: "denied", reason: "submission-conflict" });
    expect(
      await first.settle({ ...admitted.lease, id: randomUUID() }, "failed"),
    ).toBe(false);
    expect(await first.settle(admitted.lease, "failed")).toBe(false);
  });

  it("enforces deployment concurrency across newly issued visitors", async () => {
    const state = createMemoryRuntimeStateNamespace();
    const admission = new GuestAdmission(state, testGuestPolicy, {
      now: (): number => start,
    });
    const results = await Promise.all(
      Array.from({ length: 8 }, async () => {
        const owner = visitor();
        return admission.reserve(
          owner,
          conversation(owner),
          randomUUID(),
          "hello",
        );
      }),
    );
    expect(results.filter((entry) => entry.kind === "reserved")).toHaveLength(
      testGuestPolicy.limits.globalConcurrency,
    );
    expect(
      results.filter(
        (entry) =>
          entry.kind === "denied" && entry.reason === "deployment-busy",
      ),
    ).toHaveLength(4);
  });

  it("charges worst-case reservations and does not refund failures or release on stream timeouts", async () => {
    let now = start;
    const policy = {
      ...testGuestPolicy,
      budget: { dailyUsd: 0.2, maxTurnUsd: 0.1 },
    };
    const admission = new GuestAdmission(
      createMemoryRuntimeStateNamespace(),
      policy,
      { now: (): number => now },
    );
    const first = visitor();
    const chat = conversation(first);
    const active = await admission.reserve(first, chat, "one", "hello");
    if (active.kind !== "reserved") throw new Error("Expected lease");
    now += 100_000;
    expect(await admission.reserve(first, chat, "one", "hello")).toEqual({
      kind: "duplicate",
      state: "uncertain",
    });
    expect(await admission.reserve(first, chat, "two", "hello")).toEqual({
      kind: "denied",
      reason: "visitor-busy",
    });
    expect(await admission.settle(active.lease, "failed")).toBe(true);
    const next = await admission.reserve(first, chat, "two", "hello");
    if (next.kind !== "reserved") throw new Error("Expected second lease");
    await admission.settle(next.lease, "failed");
    const fresh = visitor(now);
    expect(
      await admission.reserve(
        fresh,
        conversation(fresh, now),
        "three",
        "hello",
      ),
    ).toEqual({ kind: "denied", reason: "budget-exhausted" });
  });

  it("holds active spend across rolling-day boundaries and charges until a day after settlement", async () => {
    let now = start;
    const policy = {
      ...testGuestPolicy,
      budget: { dailyUsd: 0.1, maxTurnUsd: 0.1 },
    };
    const admission = new GuestAdmission(
      createMemoryRuntimeStateNamespace(),
      policy,
      { now: (): number => now },
    );
    const owner = visitor();
    const first = await admission.reserve(
      owner,
      conversation(owner),
      "one",
      "hello",
    );
    if (first.kind !== "reserved") throw new Error("Expected lease");
    now += 86_400_001;
    const fresh = visitor(now);
    const chat = conversation(fresh, now);
    expect(await admission.reserve(fresh, chat, "two", "hello")).toEqual({
      kind: "denied",
      reason: "budget-exhausted",
    });
    await admission.settle(first.lease, "completed");
    expect(await admission.reserve(fresh, chat, "two", "hello")).toEqual({
      kind: "denied",
      reason: "budget-exhausted",
    });
    now += 86_400_000;
    const nextVisitor = visitor(now);
    expect(
      (
        await admission.reserve(
          nextVisitor,
          conversation(nextVisitor, now),
          "three",
          "hello",
        )
      ).kind,
    ).toBe("reserved");
  });

  it("enforces rolling minute and day quotas after completion and across new visitor cookies", async () => {
    let now = start;
    const policy = {
      ...testGuestPolicy,
      limits: {
        ...testGuestPolicy.limits,
        requestsPerMinute: 1,
        requestsPerDay: 2,
        globalRequestsPerMinute: 2,
        globalRequestsPerDay: 3,
      },
    };
    const admission = new GuestAdmission(
      createMemoryRuntimeStateNamespace(),
      policy,
      { now: (): number => now },
    );
    const owner = visitor();
    const chat = conversation(owner);
    const first = await admission.reserve(owner, chat, "one", "hello");
    if (first.kind !== "reserved") throw new Error("Expected lease");
    await admission.settle(first.lease, "completed");
    expect(await admission.reserve(owner, chat, "two", "hello")).toEqual({
      kind: "denied",
      reason: "visitor-rate-limit",
    });
    now += 60_000;
    const second = await admission.reserve(owner, chat, "two", "hello");
    if (second.kind !== "reserved") throw new Error("Expected second lease");
    await admission.settle(second.lease, "completed");
    now += 60_000;
    expect(await admission.reserve(owner, chat, "three", "hello")).toEqual({
      kind: "denied",
      reason: "visitor-rate-limit",
    });
    const fresh = visitor(now);
    const third = await admission.reserve(
      fresh,
      conversation(fresh, now),
      "three",
      "hello",
    );
    if (third.kind !== "reserved") throw new Error("Expected global last slot");
    await admission.settle(third.lease, "completed");
    const another = visitor(now);
    expect(
      await admission.reserve(
        another,
        conversation(another, now),
        "four",
        "hello",
      ),
    ).toEqual({ kind: "denied", reason: "deployment-rate-limit" });
  });

  it("enforces the global rolling-minute limit against fresh cookies and reopens at its exact boundary", async () => {
    let now = start;
    const policy = {
      ...testGuestPolicy,
      limits: { ...testGuestPolicy.limits, globalRequestsPerMinute: 1 },
    };
    const admission = new GuestAdmission(
      createMemoryRuntimeStateNamespace(),
      policy,
      { now: (): number => now },
    );
    const owner = visitor();
    const first = await admission.reserve(
      owner,
      conversation(owner),
      "one",
      "hello",
    );
    if (first.kind !== "reserved") throw new Error("Expected lease");
    await admission.settle(first.lease, "completed");
    const fresh = visitor();
    const chat = conversation(fresh);
    now += 59_999;
    expect(await admission.reserve(fresh, chat, "two", "hello")).toEqual({
      kind: "denied",
      reason: "deployment-rate-limit",
    });
    now++;
    expect((await admission.reserve(fresh, chat, "two", "hello")).kind).toBe(
      "reserved",
    );
  });

  it("rounds spend conservatively and rejects unrepresentable money limits", async () => {
    const policy = {
      ...testGuestPolicy,
      budget: { dailyUsd: 0.0000019, maxTurnUsd: 0.0000001 },
    };
    const admission = new GuestAdmission(
      createMemoryRuntimeStateNamespace(),
      policy,
      { now: (): number => start },
    );
    const owner = visitor();
    const first = await admission.reserve(
      owner,
      conversation(owner),
      "one",
      "hello",
    );
    if (first.kind !== "reserved") throw new Error("Expected lease");
    await admission.settle(first.lease, "completed");
    const fresh = visitor();
    expect(
      await admission.reserve(fresh, conversation(fresh), "two", "hello"),
    ).toEqual({ kind: "denied", reason: "budget-exhausted" });
    expect(
      () =>
        new GuestAdmission(createMemoryRuntimeStateNamespace(), {
          ...policy,
          budget: { dailyUsd: 1e20, maxTurnUsd: 1 },
        }),
    ).toThrow("Guest budget is not representable safely");
    expect(first.lease.execution.maxCostMicroUsd).toBe(1);
  });

  it("enforces conversation turn limits independently of request windows", async () => {
    let now = start;
    const policy = {
      ...testGuestPolicy,
      limits: { ...testGuestPolicy.limits, userTurns: 1 },
    };
    const admission = new GuestAdmission(
      createMemoryRuntimeStateNamespace(),
      policy,
      { now: (): number => now },
    );
    const owner = visitor();
    const chat = conversation(owner);
    const first = await admission.reserve(owner, chat, "one", "hello");
    if (first.kind !== "reserved") throw new Error("Expected lease");
    await admission.settle(first.lease, "completed");
    now += 60_000;
    expect(await admission.reserve(owner, chat, "two", "hello")).toEqual({
      kind: "denied",
      reason: "conversation-limit",
    });
  });

  it("rejects invalid, foreign and expired inputs before reserving", async () => {
    const admission = new GuestAdmission(
      createMemoryRuntimeStateNamespace(),
      testGuestPolicy,
      { now: (): number => start },
    );
    const owner = visitor();
    const chat = conversation(owner);
    for (const message of [
      "",
      "   ",
      "x".repeat(testGuestPolicy.limits.messageCharacters + 1),
    ]) {
      expect(await admission.reserve(owner, chat, "one", message)).toEqual({
        kind: "denied",
        reason: "invalid-input",
      });
    }
    expect(await admission.reserve(owner, chat, "", "hello")).toEqual({
      kind: "denied",
      reason: "invalid-input",
    });
    expect(await admission.reserve(visitor(), chat, "one", "hello")).toEqual({
      kind: "denied",
      reason: "conversation-unavailable",
    });
    expect(
      await admission.reserve(
        { ...owner, expiresAt: start },
        chat,
        "one",
        "hello",
      ),
    ).toEqual({ kind: "denied", reason: "conversation-unavailable" });
    expect((await admission.reserve(owner, chat, "one", "hello")).kind).toBe(
      "reserved",
    );
  });

  it("disables new work but permits accounting for genuinely finished active work", async () => {
    let enabled = true;
    const admission = new GuestAdmission(
      createMemoryRuntimeStateNamespace(),
      testGuestPolicy,
      { now: (): number => start, isEnabled: (): boolean => enabled },
    );
    const owner = visitor();
    const chat = conversation(owner);
    const first = await admission.reserve(owner, chat, "one", "hello");
    if (first.kind !== "reserved") throw new Error("Expected lease");
    enabled = false;
    expect(await admission.reserve(owner, chat, "two", "hello")).toEqual({
      kind: "denied",
      reason: "unavailable",
    });
    expect(await admission.settle(first.lease, "completed")).toBe(true);
  });

  it("shares the operator kill switch across instances and restarts without discarding reservations", async () => {
    const state = createMemoryRuntimeStateNamespace();
    const first = new GuestAdmission(state, testGuestPolicy, {
      now: (): number => start,
    });
    const second = new GuestAdmission(state, testGuestPolicy, {
      now: (): number => start,
    });
    const owner = visitor();
    const chat = conversation(owner);
    const active = await first.reserve(owner, chat, "one", "hello");
    if (active.kind !== "reserved") throw new Error("Expected lease");
    expect(await second.applyPolicy(false)).toBe(true);
    const restarted = new GuestAdmission(state, testGuestPolicy, {
      now: (): number => start,
    });
    for (const instance of [first, second, restarted]) {
      expect(await instance.reserve(owner, chat, "two", "hello")).toEqual({
        kind: "denied",
        reason: "unavailable",
      });
    }
    expect(await first.settle(active.lease, "completed")).toBe(true);
    expect(await second.applyPolicy(true)).toBe(true);
    expect((await restarted.reserve(owner, chat, "two", "hello")).kind).toBe(
      "reserved",
    );
  });

  it("rejects mixed replica policies until explicitly applied without resetting spend", async () => {
    const state = createMemoryRuntimeStateNamespace();
    const first = new GuestAdmission(state, testGuestPolicy, {
      now: (): number => start,
    });
    const owner = visitor();
    const active = await first.reserve(
      owner,
      conversation(owner),
      "one",
      "hello",
    );
    if (active.kind !== "reserved") throw new Error("Expected lease");
    await first.settle(active.lease, "completed");
    const changed = new GuestAdmission(
      state,
      { ...testGuestPolicy, budget: { dailyUsd: 0.1, maxTurnUsd: 0.1 } },
      { now: (): number => start },
    );
    const fresh = visitor();
    const chat = conversation(fresh);
    expect(await changed.reserve(fresh, chat, "two", "hello")).toEqual({
      kind: "denied",
      reason: "unavailable",
    });
    expect(await changed.applyPolicy(true)).toBe(true);
    expect(await changed.reserve(fresh, chat, "two", "hello")).toEqual({
      kind: "denied",
      reason: "budget-exhausted",
    });
    expect(await first.reserve(fresh, chat, "two", "hello")).toEqual({
      kind: "denied",
      reason: "unavailable",
    });
  });

  it("stores no raw transcript, visitor credential or conversation/submission identifiers", async () => {
    const state = createMemoryRuntimeStateNamespace();
    const admission = new GuestAdmission(state, testGuestPolicy, {
      now: (): number => start,
    });
    const owner = visitor();
    const chat = conversation(owner);
    await admission.reserve(
      owner,
      chat,
      "private-submission-id",
      "private visitor message",
    );
    const records = await state
      .scoped({
        namespace: "web-chat.guest-admission",
        schema: guestAdmissionStateSchema,
      })
      .list();
    expect(records).toHaveLength(1);
    const serialized = JSON.stringify(records);
    for (const raw of [
      owner.id,
      chat.id,
      "private-submission-id",
      "private visitor message",
    ])
      expect(serialized).not.toContain(raw);
  });

  it("fails closed on unavailable storage, contention and ambiguous commits", async () => {
    for (const failure of ["read", "conflict", "ambiguous"] as const) {
      const state = createMemoryRuntimeStateNamespace();
      let attempts = 0;
      const failing: IRuntimeStateNamespace = {
        scoped: <T>(
          options: RuntimeStateScopeOptions<T>,
        ): IRuntimeStateStore<T> => {
          const store = state.scoped(options);
          return {
            ...store,
            get: async (key): Promise<T | null> => {
              if (failure === "read") throw new Error("Storage unavailable");
              return store.get(key);
            },
            setIfNotExists: async (key, value): Promise<boolean> => {
              attempts++;
              if (failure === "conflict") return false;
              const committed = await store.setIfNotExists(key, value);
              if (failure === "ambiguous")
                throw new Error("Connection lost after commit");
              return committed;
            },
          };
        },
      };
      const admission = new GuestAdmission(failing, testGuestPolicy, {
        now: (): number => start,
      });
      const owner = visitor();
      const chat = conversation(owner);
      expect(await admission.reserve(owner, chat, "one", "hello")).toEqual({
        kind: "denied",
        reason: "unavailable",
      });
      if (failure === "conflict") {
        expect(attempts).toBeGreaterThan(1);
        expect(attempts).toBeLessThanOrEqual(32);
      }
      if (failure === "ambiguous") {
        const restarted = new GuestAdmission(state, testGuestPolicy, {
          now: (): number => start,
        });
        expect(await restarted.reserve(owner, chat, "one", "hello")).toEqual({
          kind: "duplicate",
          state: "active",
        });
      }
    }
  });

  it("cleans expired terminal receipts but never releases uncertain active work", async () => {
    let now = start;
    const admission = new GuestAdmission(
      createMemoryRuntimeStateNamespace(),
      testGuestPolicy,
      { now: (): number => now },
    );
    const firstVisitor = visitor();
    const secondVisitor = visitor();
    const first = await admission.reserve(
      firstVisitor,
      conversation(firstVisitor),
      "one",
      "hello",
    );
    const second = await admission.reserve(
      secondVisitor,
      conversation(secondVisitor),
      "two",
      "hello",
    );
    if (first.kind !== "reserved" || second.kind !== "reserved")
      throw new Error("Expected two leases");
    await admission.settle(first.lease, "completed");
    now += testGuestPolicy.retention.maxAgeSeconds * 1000;
    expect(await admission.cleanup()).toBe(1);
    expect(await admission.cleanup()).toBe(0);
    expect(await admission.settle(second.lease, "failed")).toBe(true);
    now += 86_400_000;
    expect(await admission.cleanup()).toBe(1);
  });

  it("rejects clock rollback and isolates preview accounting from production", async () => {
    let now = start;
    const state = createMemoryRuntimeStateNamespace();
    const policy = {
      ...testGuestPolicy,
      limits: { ...testGuestPolicy.limits, globalConcurrency: 1 },
    };
    const production = new GuestAdmission(state, policy, {
      now: (): number => now,
    });
    const owner = visitor();
    await production.reserve(owner, conversation(owner), "one", "hello");
    const fresh = visitor();
    const chat = conversation(fresh);
    now--;
    expect(await production.reserve(fresh, chat, "two", "hello")).toEqual({
      kind: "denied",
      reason: "unavailable",
    });
    now = start;
    const preview = new GuestAdmission(
      state,
      { ...policy, origin: "https://preview.brain.test" },
      { now: (): number => now },
    );
    expect((await preview.reserve(fresh, chat, "two", "hello")).kind).toBe(
      "reserved",
    );
  });

  it("enforces one shared budget through competing real SQLite connections and restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "guest-admission-"));
    const config = { url: `file:${join(directory, "state.db")}` };
    await migrateRuntimeState(config);
    const first = RuntimeStateService.createFresh(config);
    const second = RuntimeStateService.createFresh(config);
    const policy = {
      ...testGuestPolicy,
      budget: { dailyUsd: 0.2, maxTurnUsd: 0.1 },
    };
    try {
      await Promise.all([first.initialize(), second.initialize()]);
      const a = new GuestAdmission(first, policy, { now: (): number => start });
      const b = new GuestAdmission(second, policy, {
        now: (): number => start,
      });
      const requests = Array.from({ length: 12 }, () => {
        const owner = visitor();
        return { owner, chat: conversation(owner), id: randomUUID() };
      });
      const results = await Promise.all(
        requests.map((request, index) =>
          (index % 2 === 0 ? a : b).reserve(
            request.owner,
            request.chat,
            request.id,
            "hello",
          ),
        ),
      );
      expect(
        results.filter((result) => result.kind === "reserved"),
      ).toHaveLength(2);
      expect(
        results.filter(
          (result) =>
            result.kind === "denied" && result.reason === "budget-exhausted",
        ),
      ).toHaveLength(10);
      const winnerIndex = results.findIndex(
        (result) => result.kind === "reserved",
      );
      const request = requests[winnerIndex];
      if (!request) throw new Error("Expected admitted request");
      first.close();
      second.close();
      const restarted = RuntimeStateService.createFresh(config);
      try {
        await restarted.initialize();
        const admission = new GuestAdmission(restarted, policy, {
          now: (): number => start,
        });
        expect(
          await admission.reserve(
            request.owner,
            request.chat,
            request.id,
            "hello",
          ),
        ).toEqual({ kind: "duplicate", state: "active" });
        const fresh = visitor();
        expect(
          await admission.reserve(
            fresh,
            conversation(fresh),
            randomUUID(),
            "hello",
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

  it("retains uncertain active reservations across restart instead of guessing cancellation", async () => {
    const state = createMemoryRuntimeStateNamespace();
    const owner = visitor();
    const chat = conversation(owner);
    const admission = new GuestAdmission(state, testGuestPolicy, {
      now: (): number => start,
    });
    const first = await admission.reserve(owner, chat, "one", "hello");
    if (first.kind !== "reserved") throw new Error("Expected lease");
    const restarted = new GuestAdmission(state, testGuestPolicy, {
      now: (): number => start + 100_000,
    });
    expect(await restarted.reserve(owner, chat, "one", "hello")).toEqual({
      kind: "duplicate",
      state: "uncertain",
    });
    expect(await restarted.reserve(owner, chat, "two", "hello")).toEqual({
      kind: "denied",
      reason: "visitor-busy",
    });
  });
});
