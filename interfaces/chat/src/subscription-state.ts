import { createMemoryState } from "@chat-adapter/state-memory";
import type { IRuntimeStateNamespace } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { Lock, QueueEntry, StateAdapter } from "chat";
import type { ChatPlatform } from "./types";

export interface ChatThreadSubscriptionState {
  subscribedAt: string;
  routingMode?: "auto" | "mention-required" | undefined;
  mentionRequiredNoticeSent?: boolean | undefined;
}

export type DiscordThreadSubscriptionState = ChatThreadSubscriptionState;

export const chatThreadSubscriptionStateSchema: z.ZodType<ChatThreadSubscriptionState> =
  z.object({
    subscribedAt: z.string().datetime(),
    routingMode: z.enum(["auto", "mention-required"]).optional(),
    mentionRequiredNoticeSent: z.boolean().optional(),
  });

export const discordThreadSubscriptionStateSchema: z.ZodType<DiscordThreadSubscriptionState> =
  chatThreadSubscriptionStateSchema;

export const discordThreadSubscriptionNamespace = "chat.discord.subscriptions";
export const slackThreadSubscriptionNamespace = "chat.slack.subscriptions";

export interface ChatThreadSubscriptionStore {
  set(key: string, value: ChatThreadSubscriptionState): Promise<void>;
  get(key: string): Promise<ChatThreadSubscriptionState | null>;
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<boolean>;
}

export type DiscordThreadSubscriptionStore = ChatThreadSubscriptionStore;

function getSubscriptionNamespace(platform: ChatPlatform): string {
  return platform === "discord"
    ? discordThreadSubscriptionNamespace
    : slackThreadSubscriptionNamespace;
}

export function createThreadSubscriptionStore(
  runtimeState: IRuntimeStateNamespace,
  platform: ChatPlatform,
): ChatThreadSubscriptionStore {
  return runtimeState.scoped({
    namespace: getSubscriptionNamespace(platform),
    schema: chatThreadSubscriptionStateSchema,
  });
}

export function createDiscordThreadSubscriptionStore(
  runtimeState: IRuntimeStateNamespace,
): DiscordThreadSubscriptionStore {
  return createThreadSubscriptionStore(runtimeState, "discord");
}

export function createSlackThreadSubscriptionStore(
  runtimeState: IRuntimeStateNamespace,
): ChatThreadSubscriptionStore {
  return createThreadSubscriptionStore(runtimeState, "slack");
}

/**
 * Create Chat SDK state where only thread subscriptions are durable. Locks,
 * cache, lists, and queues remain process-local in the memory adapter.
 */
export function createChatSubscriptionStateAdapter(
  runtimeState: IRuntimeStateNamespace,
  platforms: readonly ChatPlatform[],
  memoryState: StateAdapter = createMemoryState(),
): StateAdapter {
  const subscriptions = new Map<ChatPlatform, ChatThreadSubscriptionStore>();
  for (const platform of platforms) {
    subscriptions.set(
      platform,
      createThreadSubscriptionStore(runtimeState, platform),
    );
  }
  return new ChatSubscriptionStateAdapter(memoryState, subscriptions);
}

export function createDiscordSubscriptionStateAdapter(
  runtimeState: IRuntimeStateNamespace,
  memoryState: StateAdapter = createMemoryState(),
): StateAdapter {
  return createChatSubscriptionStateAdapter(
    runtimeState,
    ["discord"],
    memoryState,
  );
}

class ChatSubscriptionStateAdapter implements StateAdapter {
  private readonly memoryState: StateAdapter;
  private readonly subscriptions: ReadonlyMap<
    ChatPlatform,
    ChatThreadSubscriptionStore
  >;

  constructor(
    memoryState: StateAdapter,
    subscriptions: ReadonlyMap<ChatPlatform, ChatThreadSubscriptionStore>,
  ) {
    this.memoryState = memoryState;
    this.subscriptions = subscriptions;
  }

  connect(): Promise<void> {
    return this.memoryState.connect();
  }

  disconnect(): Promise<void> {
    return this.memoryState.disconnect();
  }

  async subscribe(threadId: string): Promise<void> {
    const store = this.getSubscriptionStore(threadId);
    if (!store) return this.memoryState.subscribe(threadId);
    await store.set(threadId, { subscribedAt: new Date().toISOString() });
  }

  async unsubscribe(threadId: string): Promise<void> {
    const store = this.getSubscriptionStore(threadId);
    if (!store) return this.memoryState.unsubscribe(threadId);
    await store.delete(threadId);
  }

  isSubscribed(threadId: string): Promise<boolean> {
    const store = this.getSubscriptionStore(threadId);
    return store
      ? store.has(threadId)
      : this.memoryState.isSubscribed(threadId);
  }

  acquireLock(threadId: string, ttlMs: number): Promise<Lock | null> {
    return this.memoryState.acquireLock(threadId, ttlMs);
  }

  appendToList(
    key: string,
    value: unknown,
    options?: { maxLength?: number; ttlMs?: number },
  ): Promise<void> {
    return this.memoryState.appendToList(key, value, options);
  }

  delete(key: string): Promise<void> {
    return this.memoryState.delete(key);
  }

  dequeue(threadId: string): Promise<QueueEntry | null> {
    return this.memoryState.dequeue(threadId);
  }

  enqueue(
    threadId: string,
    entry: QueueEntry,
    maxSize: number,
  ): Promise<number> {
    return this.memoryState.enqueue(threadId, entry, maxSize);
  }

  extendLock(lock: Lock, ttlMs: number): Promise<boolean> {
    return this.memoryState.extendLock(lock, ttlMs);
  }

  forceReleaseLock(threadId: string): Promise<void> {
    return this.memoryState.forceReleaseLock(threadId);
  }

  get<T = unknown>(key: string): Promise<T | null> {
    return this.memoryState.get<T>(key);
  }

  getList<T = unknown>(key: string): Promise<T[]> {
    return this.memoryState.getList<T>(key);
  }

  queueDepth(threadId: string): Promise<number> {
    return this.memoryState.queueDepth(threadId);
  }

  releaseLock(lock: Lock): Promise<void> {
    return this.memoryState.releaseLock(lock);
  }

  set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void> {
    return this.memoryState.set<T>(key, value, ttlMs);
  }

  setIfNotExists(
    key: string,
    value: unknown,
    ttlMs?: number,
  ): Promise<boolean> {
    return this.memoryState.setIfNotExists(key, value, ttlMs);
  }

  private getSubscriptionStore(
    threadId: string,
  ): ChatThreadSubscriptionStore | undefined {
    const prefix = threadId.split(":")[0];
    if (prefix !== "discord" && prefix !== "slack") return undefined;
    return this.subscriptions.get(prefix);
  }
}
