import { describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RuntimeStateService } from "@brains/runtime-state";
import { migrateRuntimeState } from "@brains/runtime-state/migrate";
import { createMemoryRuntimeStateNamespace } from "@brains/plugins/test";
import type {
  IRuntimeStateNamespace,
  IRuntimeStateStore,
  RuntimeStateScopeOptions,
} from "@brains/plugins";
import { deferred } from "@brains/utils/deferred";
import { z } from "@brains/utils/zod";
import { GuestVisitorStore } from "../src/guest-access";
import {
  GuestIssuance,
  guestIssuanceNamespace,
  guestIssuanceStateSchema,
} from "../src/guest-issuance";
import { testGuestPolicy } from "./fixtures/guest-policy";
import { guestPolicySchema } from "../src/guest-policy";

const start = 86400000;
const policy = {
  ...testGuestPolicy,
  issuance: {
    requestsPerMinute: 2,
    requestsPerDay: 3,
    maxStoredCredentials: 2,
  },
};
function request(cookie?: string, origin = policy.origin): Request {
  return new Request(`${origin}/api/chat/guest/session`, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
}
function records(state: IRuntimeStateNamespace): IRuntimeStateStore<unknown> {
  return state.scoped({
    namespace: "web-chat.guest-visitors",
    schema: z.unknown(),
  });
}

describe("guest credential issuance", () => {
  it("bounds parallel cookie resets across replicas and origins, and survives restart", async () => {
    const dir = await mkdtemp(join(tmpdir(), "guest-issuance-"));
    const config = { url: `file:${join(dir, "state.db")}` };
    await migrateRuntimeState(config);
    const first = RuntimeStateService.createFresh(config);
    const second = RuntimeStateService.createFresh(config);
    const preview = { ...policy, origin: "https://preview.brain.test" };
    try {
      await Promise.all([first.initialize(), second.initialize()]);
      const a = new GuestVisitorStore(first, policy, () => start);
      const b = new GuestVisitorStore(second, preview, () => start);
      const outcomes = await Promise.allSettled(
        Array.from({ length: 12 }, (_, i) =>
          i % 2
            ? a.issue(request())
            : b.issue(request(undefined, preview.origin)),
        ),
      );
      expect(
        outcomes.filter((outcome) => outcome.status === "fulfilled"),
      ).toHaveLength(2);
      expect(await records(first).list()).toHaveLength(2);
      first.close();
      second.close();
      const restarted = RuntimeStateService.createFresh(config);
      try {
        await restarted.initialize();
        expect(
          new GuestVisitorStore(restarted, policy, () => start + 60000).issue(
            request(),
          ),
        ).rejects.toThrow("Guest access unavailable");
      } finally {
        restarted.close();
      }
    } finally {
      first.close();
      second.close();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("reclaims storage only after deletion, without refunding rolling request windows", async () => {
    const state = createMemoryRuntimeStateNamespace();
    let now = start;
    const visitors = new GuestVisitorStore(state, policy, () => now);
    const a = await visitors.issue(request());
    const b = await visitors.issue(request());
    await visitors.revoke(request(a.cookie));
    expect(visitors.issue(request())).rejects.toThrow(
      "Guest access unavailable",
    );
    now += 60000;
    const c = await visitors.issue(request());
    await visitors.revoke(request(b.cookie));
    await visitors.revoke(request(c.cookie));
    expect(visitors.issue(request())).rejects.toThrow(
      "Guest access unavailable",
    );
    now = start + 86400000;
    await visitors.issue(request());
    expect(await records(state).list()).toHaveLength(1);
  });

  it("does not reuse expired storage capacity before acknowledged cleanup", async () => {
    const state = createMemoryRuntimeStateNamespace();
    let now = start;
    const visitors = new GuestVisitorStore(state, policy, () => now);
    await visitors.issue(request());
    await visitors.issue(request());
    now += 86400000;
    expect(visitors.issue(request())).rejects.toThrow(
      "Guest access unavailable",
    );
    const maintenance = new GuestVisitorStore(
      state,
      { enabled: false },
      () => now,
    );
    expect((await maintenance.cleanup()).removed).toBe(2);
    await visitors.issue(request());
  });

  it("keeps an uncertain write reserved after expiry until the original writer acknowledges completion", async () => {
    const state = createMemoryRuntimeStateNamespace();
    const began = deferred<void>();
    const release = deferred<void>();
    const delayed: IRuntimeStateNamespace = {
      scoped: <T>(
        options: RuntimeStateScopeOptions<T>,
      ): IRuntimeStateStore<T> => {
        const store = state.scoped(options);
        if (options.namespace !== "web-chat.guest-visitors") return store;
        return {
          ...store,
          setIfNotExists: async (key, value): Promise<boolean> => {
            began.resolve();
            await release.promise;
            return store.setIfNotExists(key, value);
          },
        };
      },
    };
    let now = start;
    const small = {
      ...policy,
      issuance: { ...policy.issuance, maxStoredCredentials: 1 },
    };
    const writing = new GuestVisitorStore(delayed, small, () => now)
      .issue(request())
      .catch(() => null);
    await began.promise;
    now += 86400000;
    const maintenance = new GuestVisitorStore(
      state,
      { enabled: false },
      () => now,
    );
    expect((await maintenance.cleanup()).uncertain).toBe(1);
    expect(
      new GuestVisitorStore(state, small, () => now).issue(request()),
    ).rejects.toThrow("Guest access unavailable");
    release.resolve();
    expect(await writing).toBeNull();
    expect((await maintenance.cleanup()).removed).toBe(1);
    await new GuestVisitorStore(state, small, () => now).issue(request());
  });

  it("preserves capacity after ambiguous deletion and denies the deleting credential", async () => {
    const state = createMemoryRuntimeStateNamespace();
    const issued = await new GuestVisitorStore(
      state,
      policy,
      () => start,
    ).issue(request());
    const failing: IRuntimeStateNamespace = {
      scoped: <T>(
        options: RuntimeStateScopeOptions<T>,
      ): IRuntimeStateStore<T> => {
        const store = state.scoped(options);
        return options.namespace !== "web-chat.guest-visitors"
          ? store
          : {
              ...store,
              delete: async (key): Promise<boolean> => {
                await store.delete(key);
                throw new Error("private database details");
              },
            };
      },
    };
    const visitors = new GuestVisitorStore(failing, policy, () => start);
    expect(visitors.revoke(request(issued.cookie))).rejects.toThrow(
      "Guest access unavailable",
    );
    expect(await visitors.resolve(request(issued.cookie))).toBeNull();
    const ledger = state.scoped({
      namespace: guestIssuanceNamespace,
      schema: guestIssuanceStateSchema,
    });
    expect(
      Object.values((await ledger.get("deployment"))?.slots ?? {}).map(
        (slot) => slot.state,
      ),
    ).toEqual(["deleting"]);
    await new GuestVisitorStore(
      state,
      { enabled: false },
      () => start,
    ).cleanup();
    expect(
      Object.keys((await ledger.get("deployment"))?.slots ?? {}),
    ).toHaveLength(0);
  });

  it("requires explicit, finite issuance bounds without launch defaults or unknown authority", () => {
    for (const issuance of [
      undefined,
      {},
      { ...policy.issuance, requestsPerMinute: 0 },
      { ...policy.issuance, requestsPerMinute: 4 },
      { ...policy.issuance, requestsPerDay: Infinity },
      { ...policy.issuance, maxStoredCredentials: 1.5 },
      { ...policy.issuance, admin: true },
    ]) {
      expect(guestPolicySchema.safeParse({ ...policy, issuance }).success).toBe(
        false,
      );
    }
  });

  it("keeps ambiguous credential writes charged without promoting existing rows", async () => {
    const state = createMemoryRuntimeStateNamespace();
    const failing: IRuntimeStateNamespace = {
      scoped: <T>(
        options: RuntimeStateScopeOptions<T>,
      ): IRuntimeStateStore<T> => {
        const store = state.scoped(options);
        return options.namespace !== "web-chat.guest-visitors"
          ? store
          : {
              ...store,
              setIfNotExists: async (key, value): Promise<boolean> => {
                await store.setIfNotExists(key, value);
                throw new Error("private write payload");
              },
            };
      },
    };
    expect(
      await new GuestVisitorStore(failing, policy, () => start)
        .issue(request())
        .catch(() => null),
    ).toBeNull();
    const maintenance = new GuestVisitorStore(
      state,
      { enabled: false },
      () => start + 86400000,
    );
    expect(await maintenance.cleanup()).toMatchObject({
      removed: 0,
      uncertain: 1,
    });
    expect((await maintenance.cleanup("f".repeat(64))).uncertain).toBe(1);
    expect(await records(state).list()).toHaveLength(1);
  });

  it("holds an ambiguously committed reservation even when no credential was materialized", async () => {
    const state = createMemoryRuntimeStateNamespace();
    const failing: IRuntimeStateNamespace = {
      scoped: <T>(
        options: RuntimeStateScopeOptions<T>,
      ): IRuntimeStateStore<T> => {
        const store = state.scoped(options);
        return options.namespace !== guestIssuanceNamespace
          ? store
          : {
              ...store,
              setIfNotExists: async (key, value): Promise<boolean> => {
                await store.setIfNotExists(key, value);
                throw new Error("private ledger payload");
              },
            };
      },
    };
    const small = {
      ...policy,
      issuance: { ...policy.issuance, maxStoredCredentials: 1 },
    };
    expect(
      await new GuestVisitorStore(failing, small, () => start)
        .issue(request())
        .catch(() => null),
    ).toBeNull();
    expect(await records(state).list()).toHaveLength(0);
    expect(
      await new GuestVisitorStore(state, small, () => start + 86400000)
        .issue(request())
        .catch(() => null),
    ).toBeNull();
    expect(
      (
        await new GuestVisitorStore(
          state,
          { enabled: false },
          () => start + 86400000,
        ).cleanup()
      ).uncertain,
    ).toBe(1);
  });

  it("bounds CAS contention without materializing another credential", async () => {
    const state = createMemoryRuntimeStateNamespace();
    await new GuestVisitorStore(state, policy, () => start).issue(request());
    let attempts = 0;
    const busy: IRuntimeStateNamespace = {
      scoped: <T>(
        options: RuntimeStateScopeOptions<T>,
      ): IRuntimeStateStore<T> => {
        const store = state.scoped(options);
        return options.namespace !== guestIssuanceNamespace
          ? store
          : {
              ...store,
              compareAndSet: async (): Promise<boolean> => {
                attempts++;
                return false;
              },
            };
      },
    };
    expect(
      await new GuestVisitorStore(busy, policy, () => start)
        .issue(request())
        .catch(() => null),
    ).toBeNull();
    expect(attempts).toBe(32);
    expect(await records(state).list()).toHaveLength(1);
  });

  it("supports overlapping cleanup and revocation without double release, and prunes expired request references", async () => {
    const state = createMemoryRuntimeStateNamespace();
    let now = start;
    const a = new GuestVisitorStore(state, policy, () => now);
    const issued = await a.issue(request());
    now += 86400000;
    const b = new GuestVisitorStore(state, { enabled: false }, () => now);
    const results = await Promise.allSettled([
      a.revoke(request(issued.cookie)),
      b.cleanup(),
      b.cleanup(),
    ]);
    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    expect(await records(state).list()).toHaveLength(0);
    const ledger = await state
      .scoped({
        namespace: guestIssuanceNamespace,
        schema: guestIssuanceStateSchema,
      })
      .get("deployment");
    expect(ledger?.slots).toEqual({});
    expect(ledger?.attempts).toEqual([]);
  });

  it("refuses to bootstrap over unaccounted credentials and alerts instead of guessing cleanup", async () => {
    const state = createMemoryRuntimeStateNamespace();
    await records(state).set("unaccounted", { private: "not a credential" });
    const visitors = new GuestVisitorStore(state, policy, () => start);
    expect(await visitors.issue(request()).catch(() => null)).toBeNull();
    expect(await visitors.cleanup().catch(() => null)).toBeNull();
    expect(await records(state).list()).toHaveLength(1);
  });

  it("does not adopt changed policy or reset held slots when the operator disables issuance", async () => {
    const state = createMemoryRuntimeStateNamespace();
    await new GuestVisitorStore(state, policy, () => start).issue(request());
    const changed = {
      ...policy,
      issuance: { ...policy.issuance, requestsPerMinute: 3 },
    };
    expect(
      new GuestVisitorStore(state, changed, () => start).issue(request()),
    ).rejects.toThrow("Guest access unavailable");
    const book = new GuestIssuance(state, () => start);
    expect(await book.applyPolicy(changed.issuance, false)).toBe(true);
    expect(
      new GuestVisitorStore(state, changed, () => start).issue(request()),
    ).rejects.toThrow("Guest access unavailable");
    expect(await book.applyPolicy(changed.issuance, true)).toBe(true);
    await new GuestVisitorStore(state, changed, () => start).issue(request());
    expect(await records(state).list()).toHaveLength(2);
    expect(
      new GuestVisitorStore(state, changed, () => start - 1).issue(request()),
    ).rejects.toThrow("Guest access unavailable");
  });
});
