import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import type { IRuntimeStateNamespace } from "@brains/plugins";
import { createMemoryRuntimeStateNamespace } from "@brains/plugins/test";
import { z } from "@brains/utils/zod";
import {
  GuestUsageRecord,
  type GuestUsageBounds,
} from "../src/guest-usage-record";

const origin = "https://brain.test";
const bounds: GuestUsageBounds = {
  maxRecords: 2,
  maxDenialRecords: 2,
  retentionSeconds: 86400,
  questionBytes: 16_000,
  maxStoredBytes: 1_000_000,
};
const visitor = "visitor-9f1c";
const request = (conversation: string, submission = "submission-1"): string =>
  GuestUsageRecord.id(origin, visitor, conversation, submission);

const start = Date.parse("2026-09-26T08:00:00Z");

function record(
  state: IRuntimeStateNamespace = createMemoryRuntimeStateNamespace(),
  limits: GuestUsageBounds = bounds,
  now: () => number = (): number => start,
): GuestUsageRecord {
  return new GuestUsageRecord(state, limits, now);
}

/** Every value the record holds, as written. */
async function stored(state: IRuntimeStateNamespace): Promise<string> {
  const rows = await Promise.all(
    GuestUsageRecord.namespaces.map((namespace) =>
      state.scoped({ namespace, schema: z.unknown() }).list(),
    ),
  );
  return JSON.stringify(rows);
}

describe("guest usage record", () => {
  it("keeps an admitted request visibly unresolved until its outcome is recorded, across a restart", async () => {
    const state = createMemoryRuntimeStateNamespace();
    const usage = record(state);
    const id = request("conversation-a");
    expect(await usage.open(id)).toBe("opened");
    expect(
      await usage.admit(id, {
        visitorId: visitor,
        reservedMicroUsd: 2_000_000,
      }),
    ).toBe(true);

    // A new process finds the admission it did not see finish.
    const [event] = await record(state).list(10);
    expect(event).toMatchObject({
      state: "unresolved",
      reservedMicroUsd: 2_000_000,
    });
    expect(event?.settledAt).toBeUndefined();
  });

  it("records an outcome once, whatever retries or concurrent settlements follow", async () => {
    const usage = record();
    const id = request("conversation-a");
    await usage.open(id);
    await usage.admit(id, { visitorId: visitor, reservedMicroUsd: 2_000_000 });

    const settled = await Promise.all([
      usage.settle(id, "completed", undefined),
      usage.settle(id, "failed", undefined),
    ]);
    expect(settled).toEqual([true, true]);
    const [first] = await usage.list(10);
    expect(
      await usage.settle(
        id,
        first?.state === "completed" ? "failed" : "completed",
        undefined,
      ),
    ).toBe(true);
    const [after] = await usage.list(10);
    expect(after?.state).toBe(first?.state);
    expect(after?.settledAt).toBe(first?.settledAt);
  });

  it("keeps a turn's reported usage and cost with its outcome", async () => {
    const usage = record();
    const id = request("conversation-a");
    await usage.open(id);
    await usage.admit(id, { visitorId: visitor, reservedMicroUsd: 2_000_000 });
    const settlement = {
      usage: {
        modelCalls: 2,
        inputTokens: 12_000,
        cachedInputTokens: 4_000,
        outputTokens: 600,
        reasoningTokens: 80,
        embeddingTokens: 800,
      },
      cost: {
        state: "known" as const,
        microUsd: 2_336,
        pricing: "openai-gpt-5.6-luna-2026-09-26",
      },
    };
    await usage.settle(id, "completed", settlement);
    const [event] = await usage.list(10);
    expect(event).toMatchObject({ state: "completed", ...settlement });
  });

  it("records an outcome without reported usage as unknown cost, never zero", async () => {
    const usage = record();
    const id = request("conversation-a");
    await usage.open(id);
    await usage.admit(id, { visitorId: visitor, reservedMicroUsd: 2_000_000 });
    await usage.settle(id, "completed", undefined);
    const [event] = await usage.list(10);
    expect(event?.cost).toEqual({ state: "unknown", reason: "missing-usage" });
    expect(event?.usage).toBeUndefined();
  });

  it("keeps an admitted question within the policy's bytes, cut on a character boundary", async () => {
    const usage = record(createMemoryRuntimeStateNamespace(), {
      ...bounds,
      questionBytes: 5,
    });
    const id = request("conversation-a");
    await usage.open(id);
    await usage.admit(id, {
      visitorId: visitor,
      reservedMicroUsd: 2_000_000,
      question: "ééé",
    });
    const [event] = await usage.list(10);
    expect(event?.question).toBe("éé");
    expect(event?.questionTruncated).toBe(true);
  });

  it("keeps no question text for a request admitted without one", async () => {
    const usage = record();
    const id = request("conversation-a");
    await usage.open(id);
    await usage.admit(id, { visitorId: visitor, reservedMicroUsd: 2_000_000 });
    const [event] = await usage.list(10);
    if (!event) throw new Error("Admitted request missing from the record");
    expect(event.state).toBe("unresolved");
    expect(Object.keys(event)).not.toContain("question");
    expect(Object.keys(event)).not.toContain("questionTruncated");
  });

  it("refuses a new request once the record is full, and keeps what it holds", async () => {
    const usage = record();
    expect(await usage.open(request("a"))).toBe("opened");
    expect(await usage.open(request("b"))).toBe("opened");
    expect(await usage.open(request("c"))).toBe("full");
    expect(await usage.list(10)).toHaveLength(2);
  });

  it("gives back the place of a request the admission ledger turned away", async () => {
    const usage = record();
    await usage.open(request("a"));
    await usage.withdraw(request("a"));
    expect(await usage.open(request("b"))).toBe("opened");
    expect(await usage.open(request("c"))).toBe("opened");
    expect((await usage.list(10)).map((event) => event.state)).toEqual([
      "pending",
      "pending",
    ]);
  });

  it("never withdraws a request that was admitted", async () => {
    const usage = record();
    const id = request("a");
    await usage.open(id);
    await usage.admit(id, { visitorId: visitor, reservedMicroUsd: 2_000_000 });
    await usage.withdraw(id);
    expect((await usage.list(10)).map((event) => event.state)).toEqual([
      "unresolved",
    ]);
  });

  it("opens a retried submission once", async () => {
    const usage = record();
    expect(await usage.open(request("a"))).toBe("opened");
    expect(await usage.open(request("a"))).toBe("exists");
    expect(await usage.list(10)).toHaveLength(1);
  });

  it("identifies the visitor only by a digest salted per deployment", async () => {
    const first = createMemoryRuntimeStateNamespace();
    const second = createMemoryRuntimeStateNamespace();
    for (const state of [first, second]) {
      const usage = record(state);
      await usage.open(request("conversation-a"));
      await usage.admit(request("conversation-a"), {
        visitorId: visitor,
        reservedMicroUsd: 2_000_000,
      });
    }
    const [a] = await record(first).list(10);
    const [b] = await record(second).list(10);
    expect(a?.visitor).toMatch(/^[a-f0-9]{64}$/);
    expect(a?.visitor).not.toBe(b?.visitor);
    expect(a?.visitor).not.toBe(
      createHash("sha256").update(visitor).digest("hex"),
    );
    const written = await stored(first);
    for (const secret of [visitor, "conversation-a", "submission-1"])
      expect(written).not.toContain(secret);
  });

  it("reports an unwritable record as unavailable instead of admitting blind", async () => {
    const broken: IRuntimeStateNamespace = {
      scoped: () => {
        throw new Error("runtime state unavailable");
      },
    };
    expect(await record(broken).open(request("a"))).toBe("unavailable");
  });
});

describe("guest usage denials", () => {
  it("keeps a detailed denial with its reason and visitor digest, never text", async () => {
    const state = createMemoryRuntimeStateNamespace();
    const usage = record(state);
    await usage.deny("visitor-rate-limit", visitor);
    await usage.deny("oversized", undefined);
    const denials = await usage.denials(10);
    expect(denials.map((denial) => denial.reason).sort()).toEqual([
      "oversized",
      "visitor-rate-limit",
    ]);
    const known = denials.find(
      (denial) => denial.reason === "visitor-rate-limit",
    );
    expect(known?.visitor).toMatch(/^[a-f0-9]{64}$/);
    const unknown = denials.find((denial) => denial.reason === "oversized");
    if (!unknown) throw new Error("Oversized denial missing");
    expect(Object.keys(unknown)).not.toContain("visitor");
    expect(await stored(state)).not.toContain(visitor);
  });

  it("counts denials by day and reason, without visitors, once the detailed allowance is full", async () => {
    const usage = record();
    await usage.deny("visitor-rate-limit", visitor);
    await usage.deny("visitor-rate-limit", visitor);
    await usage.deny("visitor-rate-limit", visitor);
    await usage.deny("forbidden", undefined);
    await usage.flush();
    expect(await usage.denials(10)).toHaveLength(2);
    expect(await usage.denialCounts()).toEqual([
      {
        day: "2026-09-26",
        counts: { "visitor-rate-limit": 1, forbidden: 1 },
      },
    ]);
  });

  it("writes a flood of counted denials once per flush, however many arrive", async () => {
    const state = createMemoryRuntimeStateNamespace();
    const writes: string[] = [];
    const counting: IRuntimeStateNamespace = {
      scoped: (options) => {
        const store = state.scoped(options);
        return {
          ...store,
          set: async (key, value): Promise<void> => {
            writes.push(options.namespace);
            return store.set(key, value);
          },
          setIfNotExists: async (key, value): Promise<boolean> => {
            writes.push(options.namespace);
            return store.setIfNotExists(key, value);
          },
          compareAndSet: async (key, expected, value): Promise<boolean> => {
            writes.push(options.namespace);
            return store.compareAndSet(key, expected, value);
          },
        };
      },
    };
    const usage = record(counting, { ...bounds, maxDenialRecords: 1 });
    await usage.deny("forbidden", undefined);
    const afterDetailed = writes.length;
    await Promise.all(
      Array.from({ length: 200 }, () => usage.deny("forbidden", undefined)),
    );
    expect(writes.length).toBe(afterDetailed);
    await usage.flush();
    expect(writes.length).toBe(afterDetailed + 1);
    expect(await usage.denialCounts()).toEqual([
      { day: "2026-09-26", counts: { forbidden: 200 } },
    ]);
  });

  it("keeps unwritten counts for the next flush", async () => {
    const state = createMemoryRuntimeStateNamespace();
    let failing = true;
    const flaky: IRuntimeStateNamespace = {
      scoped: (options) => {
        const store = state.scoped(options);
        return {
          ...store,
          set: async (key, value): Promise<void> => {
            if (failing && options.namespace.endsWith("denial-counts"))
              throw new Error("runtime state unavailable");
            return store.set(key, value);
          },
          setIfNotExists: async (key, value): Promise<boolean> => {
            if (failing && options.namespace.endsWith("denial-counts"))
              throw new Error("runtime state unavailable");
            return store.setIfNotExists(key, value);
          },
        };
      },
    };
    const usage = record(flaky, { ...bounds, maxDenialRecords: 1 });
    await usage.deny("forbidden", undefined);
    await usage.deny("forbidden", undefined);
    await usage.deny("forbidden", undefined);
    expect(usage.flush()).rejects.toThrow("Guest usage counts unavailable");
    failing = false;
    await usage.flush();
    expect(await usage.denialCounts()).toEqual([
      { day: "2026-09-26", counts: { forbidden: 2 } },
    ]);
  });
});

describe("guest usage retention and health", () => {
  it("removes requests, denials and daily counts past their own retention, and nothing younger", async () => {
    const state = createMemoryRuntimeStateNamespace();
    let now = start;
    const usage = record(state, { ...bounds, maxDenialRecords: 1 }, () => now);
    await usage.open(request("old"));
    await usage.deny("forbidden", undefined);
    await usage.deny("forbidden", undefined);
    await usage.flush();
    // A day's counts go once the whole day is past retention.
    now = start + 2 * 86_400_000;
    await usage.open(request("young"));
    await usage.cleanup();
    expect((await usage.list(10)).map((event) => event.openedAt)).toEqual([
      now,
    ]);
    expect(await usage.denials(10)).toEqual([]);
    expect(await usage.denialCounts()).toEqual([]);
    expect(await stored(state)).not.toContain(request("old"));
  });

  it("leaves the admission ledger's accounting alone", async () => {
    const state = createMemoryRuntimeStateNamespace();
    const admission = state.scoped({
      namespace: "web-chat.guest-admission",
      schema: z.unknown(),
    });
    await admission.set("ledger", { lifetime: { requests: 2 } });
    let now = start;
    const usage = record(state, bounds, () => now);
    await usage.open(request("old"));
    now = start + 86_400_000 + 1;
    await usage.cleanup();
    expect(await admission.get("ledger")).toEqual({
      lifetime: { requests: 2 },
    });
  });

  it("refuses a request whose question could push kept text past the storage limit", async () => {
    const usage = record(createMemoryRuntimeStateNamespace(), {
      ...bounds,
      questionBytes: 8,
      maxStoredBytes: 12,
    });
    await usage.open(request("a"));
    await usage.admit(request("a"), {
      visitorId: visitor,
      reservedMicroUsd: 2_000_000,
      question: "eight by",
    });
    expect(await usage.open(request("b"))).toBe("full");
  });

  it("reports degraded while full, unhealthy while writes fail, and only counts", async () => {
    const state = createMemoryRuntimeStateNamespace();
    const full = record(state, { ...bounds, maxRecords: 1 });
    expect((await full.health()).status).toBe("healthy");
    await full.open(request("a"));
    await full.admit(request("a"), {
      visitorId: visitor,
      reservedMicroUsd: 2_000_000,
      question: "What is public?",
    });
    const degraded = await full.health();
    expect(degraded.status).toBe("degraded");
    expect(degraded.details).toMatchObject({ records: 1, maxRecords: 1 });
    expect(JSON.stringify(degraded)).not.toContain("What is public?");

    let failing = true;
    const flaky: IRuntimeStateNamespace = {
      scoped: (options) => {
        const store = state.scoped(options);
        return {
          ...store,
          compareAndSet: async (key, expected, value): Promise<boolean> => {
            if (failing) throw new Error("private storage detail");
            return store.compareAndSet(key, expected, value);
          },
          setIfNotExists: async (key, value): Promise<boolean> => {
            if (failing) throw new Error("private storage detail");
            return store.setIfNotExists(key, value);
          },
        };
      },
    };
    const broken = record(flaky);
    expect(await broken.open(request("b"))).toBe("unavailable");
    const unhealthy = await broken.health();
    expect(unhealthy.status).toBe("unhealthy");
    expect(JSON.stringify(unhealthy)).not.toContain("private storage detail");
    failing = false;
  });
});
