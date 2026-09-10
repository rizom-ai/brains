import { describe, expect, it, spyOn } from "bun:test";
import { BunSchedulerBackend } from "@brains/scheduler";
import { TestSchedulerBackend } from "@brains/scheduler/test";
import { WebChatInterface } from "../src/web-chat-interface";
import { randomUUID } from "node:crypto";
import { z } from "@brains/utils/zod";
import {
  createMemoryRuntimeStateNamespace,
  createPluginHarness,
} from "@brains/plugins/test";
import type {
  IRuntimeStateNamespace,
  IRuntimeStateStore,
  RuntimeStateScopeOptions,
} from "@brains/plugins";
import { GuestStateMaintenance } from "../src/guest-maintenance";
import {
  guestAdmissionNamespace,
  guestAdmissionStateSchema,
  type GuestAdmissionState,
  type GuestAdmissionReceipt,
} from "../src/guest-admission-state";

const now = 3 * 86400000;
const key = "a".repeat(64);
const expiredKey = "1".repeat(64);
const activeKey = "2".repeat(64);
const recentKey = "3".repeat(64);
function receipt(state: GuestAdmissionReceipt["state"]): GuestAdmissionReceipt {
  return {
    id: randomUUID(),
    visitor: "d".repeat(64),
    conversation: "e".repeat(64),
    fingerprint: "f".repeat(64),
    createdAt: now - 2 * 86400000,
    deadline: now - 86400000,
    retainUntil: now,
    reservedMicroUsd: 100000,
    state,
    ...(state === "active" ? {} : { settledAt: now - 86400000 }),
  };
}
function ledger(): GuestAdmissionState {
  return {
    version: 1,
    revision: 4,
    policy: "b".repeat(64),
    enabled: false,
    lastSeenAt: now - 1,
    receipts: {
      [expiredKey]: receipt("completed"),
      [activeKey]: receipt("active"),
      [recentKey]: { ...receipt("failed"), retainUntil: now + 1 },
    },
  };
}

describe("guest state maintenance", () => {
  it("runs through the installed Web Chat daemon while anonymous chat stays disabled", async () => {
    const scheduler = new TestSchedulerBackend();
    const scheduled = spyOn(
      BunSchedulerBackend.prototype,
      "scheduleInterval",
    ).mockImplementation((interval, callback) =>
      scheduler.scheduleInterval(interval, callback),
    );
    const harness = createPluginHarness<WebChatInterface>();
    const shell = harness.getMockShell();
    const registry = shell.getDaemonRegistry();
    const visitors = shell
      .getRuntimeState()
      .scoped({ namespace: "web-chat.guest-visitors", schema: z.unknown() });
    await visitors.set("expired-digest", {
      kind: "guest",
      id: randomUUID(),
      createdAt: 0,
      expiresAt: 1,
    });
    const plugin = new WebChatInterface(
      {},
      { resolveAuthPrincipal: async (): Promise<undefined> => undefined },
    );
    try {
      await harness.installPlugin(plugin);
      expect(registry.get("web-chat:guest-maintenance")?.status).toBe(
        "stopped",
      );
      expect(await visitors.list()).toHaveLength(1);
      await registry.startPlugin("web-chat");
      await scheduler.advanceBy(60000);
      expect(await visitors.list()).toEqual([]);
      expect(
        (await registry.checkHealth("web-chat:guest-maintenance"))?.status,
      ).toBe("healthy");
      const route = plugin
        .getWebRoutes()
        .find((entry) => entry.path === "/api/chat" && entry.method === "POST");
      if (!route) throw new Error("Expected chat route");
      const response = await route.handler(
        new Request("https://brain.test/api/chat", {
          method: "POST",
          body: "{}",
        }),
      );
      expect(response.status).toBe(403);
    } finally {
      await registry.stopPlugin("web-chat");
      await harness.reset();
      scheduled.mockRestore();
    }
  });
  it("prunes terminal references without enabling admission, adopting policy or releasing uncertain work", async () => {
    const state = createMemoryRuntimeStateNamespace();
    const store = state.scoped({
      namespace: guestAdmissionNamespace,
      schema: guestAdmissionStateSchema,
    });
    const original = ledger();
    await store.set(key, original);
    await new GuestStateMaintenance(state, () => now).run();
    const cleaned = await store.get(key);
    const retained = { ...original.receipts };
    delete retained[expiredKey];
    expect(cleaned).toEqual({
      ...original,
      revision: 5,
      lastSeenAt: now,
      receipts: retained,
    });
  });

  it("preserves concurrent reservations and policy changes, or a concurrently deleted ledger", async () => {
    for (const deletion of [false, true]) {
      const state = createMemoryRuntimeStateNamespace();
      const store = state.scoped({
        namespace: guestAdmissionNamespace,
        schema: guestAdmissionStateSchema,
      });
      const original = ledger();
      const lateKey = "4".repeat(64);
      const updated: GuestAdmissionState = {
        ...original,
        revision: 5,
        enabled: true,
        policy: "c".repeat(64),
        receipts: { ...original.receipts, [lateKey]: receipt("active") },
      };
      await store.set(key, original);
      let raced = false;
      const concurrent: IRuntimeStateNamespace = {
        scoped: <T>(
          options: RuntimeStateScopeOptions<T>,
        ): IRuntimeStateStore<T> => {
          const scoped = state.scoped(options);
          return {
            ...scoped,
            compareAndSet: async (id, expected, value): Promise<boolean> => {
              if (!raced && options.namespace === guestAdmissionNamespace) {
                raced = true;
                if (deletion) await store.delete(key);
                else await store.set(key, updated);
                return false;
              }
              return scoped.compareAndSet(id, expected, value);
            },
          };
        },
      };
      await new GuestStateMaintenance(concurrent, () => now).run();
      const cleaned = await store.get(key);
      if (deletion) expect(cleaned).toBeNull();
      else {
        expect(cleaned?.revision).toBe(6);
        expect(cleaned?.policy).toBe(updated.policy);
        expect(cleaned?.enabled).toBe(true);
        expect(cleaned?.receipts[lateKey]).toEqual(updated.receipts[lateKey]);
        expect(cleaned?.receipts[activeKey]).toEqual(
          original.receipts[activeKey],
        );
        expect(cleaned?.receipts[expiredKey]).toBeUndefined();
      }
    }
  });

  it("bounds contention retries and advances to the next origin without changing the busy ledger", async () => {
    const state = createMemoryRuntimeStateNamespace();
    const store = state.scoped({
      namespace: guestAdmissionNamespace,
      schema: guestAdmissionStateSchema,
    });
    const nextKey = "b".repeat(64);
    const original = ledger();
    await store.set(key, original);
    await store.set(nextKey, original);
    let attempts = 0;
    const busy: IRuntimeStateNamespace = {
      scoped: <T>(
        options: RuntimeStateScopeOptions<T>,
      ): IRuntimeStateStore<T> => {
        const scoped = state.scoped(options);
        return {
          ...scoped,
          compareAndSet: async (id, expected, value): Promise<boolean> => {
            if (options.namespace === guestAdmissionNamespace && id === key) {
              attempts++;
              return false;
            }
            return scoped.compareAndSet(id, expected, value);
          },
        };
      },
    };
    const maintenance = new GuestStateMaintenance(busy, () => now);
    expect(maintenance.run()).rejects.toThrow("Guest maintenance unavailable");
    expect(attempts).toBe(4);
    expect(await store.get(key)).toEqual(original);
    await maintenance.run();
    expect((await store.get(nextKey))?.receipts[expiredKey]).toBeUndefined();
    expect(await store.get(key)).toEqual(original);
  });

  it("reports ledger clock rollback without starving credential cleanup", async () => {
    const state = createMemoryRuntimeStateNamespace();
    const store = state.scoped({
      namespace: guestAdmissionNamespace,
      schema: guestAdmissionStateSchema,
    });
    const original = { ...ledger(), lastSeenAt: now + 1 };
    await store.set(key, original);
    const visitors = state.scoped({
      namespace: "web-chat.guest-visitors",
      schema: z.unknown(),
    });
    await visitors.set("expired-digest", {
      kind: "guest",
      id: randomUUID(),
      createdAt: 1,
      expiresAt: now,
    });
    expect(new GuestStateMaintenance(state, () => now).run()).rejects.toThrow(
      "Guest maintenance unavailable",
    );
    expect(await store.get(key)).toEqual(original);
    expect(await visitors.list()).toEqual([]);
  });
});
