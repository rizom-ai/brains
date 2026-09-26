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
const bounds: GuestUsageBounds = { maxRecords: 2, retentionSeconds: 86400 };
const visitor = "visitor-9f1c";
const request = (conversation: string, submission = "submission-1"): string =>
  GuestUsageRecord.id(origin, visitor, conversation, submission);

function record(
  state: IRuntimeStateNamespace = createMemoryRuntimeStateNamespace(),
  limits: GuestUsageBounds = bounds,
): GuestUsageRecord {
  return new GuestUsageRecord(state, limits, () =>
    Date.parse("2026-09-26T08:00:00Z"),
  );
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
