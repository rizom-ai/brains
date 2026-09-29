import { createMockShell } from "@brains/plugins/test";
import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import type { Lock, QueueEntry, StateAdapter } from "chat";
import {
  createChatSubscriptionStateAdapter,
  createThreadSubscriptionStore,
  threadSubscriptionNamespace,
  type ChatRuntimeState,
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
    // The SDK's StateAdapter declares get/getList generic in the value with no
    // schema to check against, so a store that holds `unknown` cannot produce
    // a `T` any other way. The contract is external; there is nothing here to
    // narrow.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above
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
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see the note on get()
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

/**
 * Supply isolated stores to the adapter unit tests. Production package/ID
 * ownership encoding is exercised by the framework's SDK and SQLite tests.
 */
function runtimeStateFor(
  shell: ReturnType<typeof createMockShell>,
  declarationId: string,
): ChatRuntimeState {
  const raw = shell.getRuntimeState();
  return (options) =>
    raw.scoped({
      ...options,
      namespace: `fixture.${declarationId}.${options.namespace}`,
    });
}

describe("chat subscription state", () => {
  it("persists only thread subscriptions across adapter recreation", async () => {
    const runtimeState = runtimeStateFor(createMockShell(), "discord");
    const first = createChatSubscriptionStateAdapter(
      runtimeState,
      "discord",
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

    const restarted = createChatSubscriptionStateAdapter(
      runtimeState,
      "discord",
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

  it("keeps each interface's subscriptions in its own store", async () => {
    const shell = createMockShell();
    const discord = createChatSubscriptionStateAdapter(
      runtimeStateFor(shell, "discord"),
      "discord",
      new FakeMemoryStateAdapter(),
    );
    const slack = createChatSubscriptionStateAdapter(
      runtimeStateFor(shell, "slack"),
      "slack",
      new FakeMemoryStateAdapter(),
    );

    await discord.subscribe("discord:guild:channel:thread");
    await slack.subscribe("slack:C123:1712345678.000100");
    await slack.unsubscribe("slack:C123:1712345678.000100");

    expect(await discord.isSubscribed("discord:guild:channel:thread")).toBe(
      true,
    );
    expect(await slack.isSubscribed("slack:C123:1712345678.000100")).toBe(
      false,
    );
    const slackStore = createThreadSubscriptionStore(
      runtimeStateFor(shell, "slack"),
    );
    expect(await slackStore.has("discord:guild:channel:thread")).toBe(false);
  });

  it("leaves another platform's thread to the memory adapter", async () => {
    // A Discord app is never asked about a Slack thread, but if it were, the
    // answer is not "subscribed" on the strength of a durable store it does
    // not own.
    const state = createChatSubscriptionStateAdapter(
      runtimeStateFor(createMockShell(), "discord"),
      "discord",
      new FakeMemoryStateAdapter(),
    );

    await state.subscribe("slack:C123:1712345678.000100");

    expect(await state.isSubscribed("slack:C123:1712345678.000100")).toBe(
      false,
    );
  });

  it("removes persisted subscriptions on unsubscribe", async () => {
    const state = createChatSubscriptionStateAdapter(
      runtimeStateFor(createMockShell(), "discord"),
      "discord",
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
    const runtimeState = runtimeStateFor(createMockShell(), "discord");
    const first = createThreadSubscriptionStore(runtimeState);
    await first.set("discord:guild:channel:thread", {
      subscribedAt: new Date().toISOString(),
      routingMode: "mention-required",
      mentionRequiredNoticeSent: true,
    });

    const restarted = createThreadSubscriptionStore(runtimeState);

    expect(await restarted.get("discord:guild:channel:thread")).toEqual(
      expect.objectContaining({
        routingMode: "mention-required",
        mentionRequiredNoticeSent: true,
      }),
    );
  });

  it("uses the documented local runtime-state namespace", async () => {
    const shell = createMockShell();
    const namespaces: string[] = [];
    const scoped = runtimeStateFor(shell, "discord");
    const state = createChatSubscriptionStateAdapter(
      (options) => {
        namespaces.push(options.namespace);
        return scoped(options);
      },
      "discord",
      new FakeMemoryStateAdapter(),
    );
    await state.connect();

    await state.subscribe("discord:guild:channel:thread");

    expect(namespaces).toEqual([threadSubscriptionNamespace]);
    const rawStore = shell.getRuntimeState().scoped({
      namespace: `fixture.discord.${threadSubscriptionNamespace}`,
      schema: z.object({ subscribedAt: z.iso.datetime() }),
    });
    expect(await rawStore.has("discord:guild:channel:thread")).toBe(true);
    await state.disconnect();
  });
});
