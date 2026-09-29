import { describe, expect, it } from "bun:test";
import { createMemoryRuntimeStateNamespace } from "@brains/plugins/test";
import type {
  IRuntimeStateNamespace,
  IRuntimeStateStore,
  RuntimeStateScopeOptions,
} from "@brains/plugins";
import { ContactAdmission, type ContactAdmissionPolicy } from "../src";

const start = Date.parse("2026-09-21T10:00:00.000Z");
const network = "192.0.2.1";
const input = {
  name: "Ada",
  email: "private@example.com",
  message: "Private message",
};
const policy: ContactAdmissionPolicy = {
  windowSeconds: 60,
  globalRequests: 100,
  networkRequests: 50,
  globalForms: 10,
  networkForms: 5,
  globalSubmissions: 4,
  networkSubmissions: 2,
  tokenTtlSeconds: 30,
  receiptTtlSeconds: 120,
  maxEntries: 20,
};

async function issue(
  admission: ContactAdmission,
  peer = network,
): Promise<string> {
  const result = await admission.issue(peer);
  if (result.kind !== "issued")
    throw new Error(`Expected issued form: ${result.reason}`);
  return result.token;
}

describe("contact admission", () => {
  it("requires explicit bounded policy and trusted socket identity", async () => {
    const state = createMemoryRuntimeStateNamespace();
    expect(
      () => new ContactAdmission(state, { ...policy, maxEntries: 1001 }),
    ).toThrow();
    expect(
      () => new ContactAdmission(state, { ...policy, networkForms: 11 }),
    ).toThrow();
    const admission = new ContactAdmission(state, policy, () => start);
    for (const peer of [
      undefined,
      "",
      "forged-forwarded-header",
      "192.0.2.1, 198.51.100.1",
    ]) {
      expect(await admission.issue(peer)).toEqual({
        kind: "denied",
        reason: "invalid-network",
      });
    }
  });

  it("deduplicates concurrent reservations with a stable entity id and original timestamp", async () => {
    const state = createMemoryRuntimeStateNamespace();
    const a = new ContactAdmission(state, policy, () => start);
    const b = new ContactAdmission(state, policy, () => start);
    const token = await issue(a);
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        (i % 2 ? a : b).reserve(token, input, network),
      ),
    );
    expect(results.filter((r) => r.kind === "reserved")).toHaveLength(1);
    expect(results.filter((r) => r.kind === "duplicate")).toHaveLength(5);
    const reserved = results.find((r) => r.kind === "reserved");
    if (reserved?.kind !== "reserved") throw new Error("Missing reservation");
    for (const result of results)
      expect(result).toMatchObject({ id: reserved.id, receivedAt: start });
    expect(reserved.id).not.toContain(token);
    expect(
      await b.reserve(token, { ...input, message: "different" }, network),
    ).toEqual({ kind: "denied", reason: "submission-conflict" });
    expect(await b.reserve(token, input, "198.51.100.1")).toEqual({
      kind: "denied",
      reason: "invalid-token",
    });
  });

  it("keeps submission limits across fresh tokens, new instances and network changes", async () => {
    const state = createMemoryRuntimeStateNamespace();
    const a = new ContactAdmission(state, policy, () => start);
    const tokens = await Promise.all(Array.from({ length: 4 }, () => issue(a)));
    const results = await Promise.all(
      tokens.map((token) => a.reserve(token, input, network)),
    );
    expect(results.filter((r) => r.kind === "reserved")).toHaveLength(2);
    expect(results.filter((r) => r.kind === "denied")).toHaveLength(2);
    const restarted = new ContactAdmission(state, policy, () => start);
    const resetToken = await issue(restarted);
    expect(await restarted.reserve(resetToken, input, "192.0.2.222")).toEqual({
      kind: "denied",
      reason: "rate-limited",
    });
    for (const peer of ["198.51.100.1", "203.0.113.1"]) {
      expect(
        (await restarted.reserve(await issue(restarted, peer), input, peer))
          .kind,
      ).toBe("reserved");
    }
    const another = "198.51.100.55";
    expect(
      await restarted.reserve(await issue(restarted, another), input, another),
    ).toEqual({ kind: "denied", reason: "rate-limited" });
  });

  it("bounds issuance globally and groups equivalent IPv4/IPv6 networks", async () => {
    for (const peers of [
      ["192.0.2.1", "::ffff:192.0.2.222"],
      ["2001:db8:0:1::1", "2001:0db8:0000:0001:ffff:ffff:ffff:ffff"],
    ]) {
      const admission = new ContactAdmission(
        createMemoryRuntimeStateNamespace(),
        { ...policy, networkForms: 1 },
        () => start,
      );
      expect((await admission.issue(peers[0])).kind).toBe("issued");
      expect(await admission.issue(peers[1])).toEqual({
        kind: "denied",
        reason: "rate-limited",
      });
    }
    const admission = new ContactAdmission(
      createMemoryRuntimeStateNamespace(),
      { ...policy, globalForms: 1, networkForms: 1 },
      () => start,
    );
    await issue(admission);
    expect(await admission.issue("198.51.100.1")).toEqual({
      kind: "denied",
      reason: "rate-limited",
    });
  });

  it("expires unclaimed tokens without refunding issuance quota", async () => {
    let now = start;
    const admission = new ContactAdmission(
      createMemoryRuntimeStateNamespace(),
      { ...policy, networkForms: 1 },
      () => now,
    );
    const token = await issue(admission);
    now += policy.tokenTtlSeconds * 1000;
    expect(await admission.reserve(token, input, network)).toEqual({
      kind: "denied",
      reason: "invalid-token",
    });
    expect(await admission.issue(network)).toEqual({
      kind: "denied",
      reason: "rate-limited",
    });
    now = start + policy.windowSeconds * 1000;
    expect((await admission.issue(network)).kind).toBe("issued");
  });

  it("keeps receipts for bounded retry without renewing their lifetime or replaying expiry", async () => {
    let now = start;
    const admission = new ContactAdmission(
      createMemoryRuntimeStateNamespace(),
      policy,
      () => now,
    );
    const token = await issue(admission);
    const reserved = await admission.reserve(token, input, network);
    now += 60_000;
    expect(await admission.reserve(token, input, network)).toMatchObject({
      ...reserved,
      kind: "duplicate",
    });
    now = start + policy.receiptTtlSeconds * 1000;
    expect(await admission.reserve(token, input, network)).toEqual({
      kind: "denied",
      reason: "invalid-token",
    });
  });

  it("fails closed at bounded ledger capacity and on clock regression", async () => {
    let now = start;
    const admission = new ContactAdmission(
      createMemoryRuntimeStateNamespace(),
      { ...policy, maxEntries: 1 },
      () => now,
    );
    const token = await issue(admission);
    expect(await admission.issue("198.51.100.1")).toEqual({
      kind: "denied",
      reason: "capacity",
    });
    now--;
    expect(await admission.reserve(token, input, network)).toEqual({
      kind: "denied",
      reason: "unavailable",
    });
    now = start + 30_000;
    expect((await admission.issue(network)).kind).toBe("issued");
  });

  it("rejects invalid submissions without consuming or changing a token", async () => {
    const admission = new ContactAdmission(
      createMemoryRuntimeStateNamespace(),
      policy,
      () => start,
    );
    const token = await issue(admission);
    for (const bad of [
      { ...input, website: "spam" },
      { ...input, message: "x".repeat(4001) },
      { ...input, email: "wrong" },
      { ...input, visibility: "public" },
    ]) {
      expect(await admission.reserve(token, bad, network)).toEqual({
        kind: "denied",
        reason: "invalid-submission",
      });
    }
    expect((await admission.reserve(token, input, network)).kind).toBe(
      "reserved",
    );
  });

  it("keeps credentials and contact details out of runtime state", async () => {
    const state = createMemoryRuntimeStateNamespace();
    const admission = new ContactAdmission(state, policy, () => start);
    const token = await issue(admission);
    await admission.reserve(token, input, network);
    const serialized = JSON.stringify(await admissionState(state));
    for (const secret of [
      token,
      input.name,
      input.email,
      input.message,
      network,
    ])
      expect(serialized).not.toContain(secret);
  });

  it("fails closed on read failure, contention and ambiguous committed reservations", async () => {
    for (const failure of ["read", "conflict", "ambiguous"] as const) {
      const backing = createMemoryRuntimeStateNamespace();
      const working = new ContactAdmission(backing, policy, () => start);
      const token = await issue(working);
      let attempts = 0;
      const failing: IRuntimeStateNamespace = {
        scoped: <T>(
          options: RuntimeStateScopeOptions<T>,
        ): IRuntimeStateStore<T> => {
          const store = backing.scoped(options);
          return {
            ...store,
            get: async (key): Promise<T | null> => {
              if (failure === "read") throw new Error("PRIVATE storage detail");
              return store.get(key);
            },
            compareAndSet: async (key, expected, value): Promise<boolean> => {
              attempts++;
              if (failure === "conflict") return false;
              const committed = await store.compareAndSet(key, expected, value);
              throw new Error(`PRIVATE ambiguous commit: ${committed}`);
            },
          };
        },
      };
      const admission = new ContactAdmission(failing, policy, () => start);
      expect(await admission.reserve(token, input, network)).toEqual({
        kind: "denied",
        reason: "unavailable",
      });
      expect(attempts).toBeLessThanOrEqual(16);
      if (failure === "ambiguous") {
        expect((await working.reserve(token, input, network)).kind).toBe(
          "duplicate",
        );
        expect(attempts).toBe(1);
      }
    }
  });

  it("does not expose storage exceptions", async () => {
    const state: IRuntimeStateNamespace = {
      scoped: () => {
        throw new Error("private backend credential");
      },
    };
    expect(() => new ContactAdmission(state, policy, () => start)).toThrow(
      "Contact admission unavailable",
    );
  });
});

async function admissionState(state: IRuntimeStateNamespace): Promise<unknown> {
  const { contactAdmissionStateSchema } =
    await import("../src/admission-state");
  return state
    .scoped({
      namespace: "contact.admission",
      schema: contactAdmissionStateSchema,
    })
    .get("ledger");
}
