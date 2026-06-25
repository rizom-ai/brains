import { describe, expect, it } from "bun:test";
import { createMockShell } from "@brains/test-utils";
import { z } from "@brains/utils/zod-v4";
import type { Lock, QueueEntry, StateAdapter } from "chat";
import {
  createDiscordSubscriptionStateAdapter,
  createDiscordThreadSubscriptionStore,
  discordThreadSubscriptionNamespace,
} from "../src/subscription-state";

class FakeMemoryStateAdapter implements StateAdapter {
  private readonly values = new Map<string, unknown>();
  private readonly lists = new Map<string, unknown[]>();

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}

  async subscribe(_threadId: string): Promise<void> {}
  async unsubscribe(_threadId: string): Promise<void> {}
  async isSubscribed(_threadId: string): Promise<boolean> {
    return false;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    return (this.values.get(key) as T | undefined) ?? null;
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
    this.values.set(key, value);
  }

  async setIfNotExists(key: string, value: unknown): Promise<boolean> {
    if (this.values.has(key)) return false;
    this.values.set(key, value);
    return true;
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }

  async appendToList(
    key: string,
    value: unknown,
    options?: { maxLength?: number },
  ): Promise<void> {
    const next = [...(this.lists.get(key) ?? []), value];
    this.lists.set(
      key,
      options?.maxLength ? next.slice(-options.maxLength) : next,
    );
  }

  async getList<T = unknown>(key: string): Promise<T[]> {
    return (this.lists.get(key) ?? []) as T[];
  }

  async acquireLock(threadId: string, ttlMs: number): Promise<Lock> {
    return { threadId, token: "fake-lock", expiresAt: Date.now() + ttlMs };
  }

  async releaseLock(_lock: Lock): Promise<void> {}
  async extendLock(_lock: Lock, _ttlMs: number): Promise<boolean> {
    return true;
  }

  async forceReleaseLock(_threadId: string): Promise<void> {}
  async enqueue(
    _threadId: string,
    _entry: QueueEntry,
    _maxSize: number,
  ): Promise<number> {
    return 1;
  }

  async dequeue(_threadId: string): Promise<QueueEntry | null> {
    return null;
  }

  async queueDepth(_threadId: string): Promise<number> {
    return 0;
  }
}

describe("createDiscordSubscriptionStateAdapter", () => {
  it("persists only Discord thread subscriptions across adapter recreation", async () => {
    const runtimeState = createMockShell().getRuntimeState();
    const first = createDiscordSubscriptionStateAdapter(
      runtimeState,
      new FakeMemoryStateAdapter(),
    );
    await first.connect();

    await first.subscribe("discord:guild:channel:thread");
    await first.set("cache-key", "cache-value");
    await first.appendToList("list-key", "list-value");

    expect(await first.isSubscribed("discord:guild:channel:thread")).toBe(true);
    expect(await first.get<string>("cache-key")).toBe("cache-value");
    expect(await first.getList("list-key")).toEqual(["list-value"]);
    await first.disconnect();

    const restarted = createDiscordSubscriptionStateAdapter(
      runtimeState,
      new FakeMemoryStateAdapter(),
    );
    await restarted.connect();

    expect(await restarted.isSubscribed("discord:guild:channel:thread")).toBe(
      true,
    );
    expect(await restarted.get<string>("cache-key")).toBeNull();
    expect(await restarted.getList("list-key")).toEqual([]);
    await restarted.disconnect();
  });

  it("removes persisted subscriptions on unsubscribe", async () => {
    const runtimeState = createMockShell().getRuntimeState();
    const state = createDiscordSubscriptionStateAdapter(
      runtimeState,
      new FakeMemoryStateAdapter(),
    );
    await state.connect();

    await state.subscribe("discord:guild:channel:thread");
    await state.unsubscribe("discord:guild:channel:thread");

    expect(await state.isSubscribed("discord:guild:channel:thread")).toBe(
      false,
    );
    await state.disconnect();
  });

  it("persists mention-required routing policy with the subscription", async () => {
    const runtimeState = createMockShell().getRuntimeState();
    const first = createDiscordThreadSubscriptionStore(runtimeState);
    await first.set("discord:guild:channel:thread", {
      subscribedAt: new Date().toISOString(),
      routingMode: "mention-required",
      mentionRequiredNoticeSent: true,
    });

    const restarted = createDiscordThreadSubscriptionStore(runtimeState);

    expect(await restarted.get("discord:guild:channel:thread")).toEqual(
      expect.objectContaining({
        routingMode: "mention-required",
        mentionRequiredNoticeSent: true,
      }),
    );
  });

  it("uses the documented runtime-state namespace", async () => {
    const runtimeState = createMockShell().getRuntimeState();
    const state = createDiscordSubscriptionStateAdapter(
      runtimeState,
      new FakeMemoryStateAdapter(),
    );
    await state.connect();

    await state.subscribe("discord:guild:channel:thread");

    const rawStore = runtimeState.scoped({
      namespace: discordThreadSubscriptionNamespace,
      schema: z.object({ subscribedAt: z.string().datetime() }),
    });
    expect(await rawStore.has("discord:guild:channel:thread")).toBe(true);
    await state.disconnect();
  });
});
