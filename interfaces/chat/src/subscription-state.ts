import { createMemoryState } from "@chat-adapter/state-memory";
import type { IRuntimeStateNamespace } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { Lock, QueueEntry, StateAdapter } from "chat";

export const discordThreadSubscriptionStateSchema = z.object({
  subscribedAt: z.string().datetime(),
  routingMode: z.enum(["auto", "mention-required"]).optional(),
  mentionRequiredNoticeSent: z.boolean().optional(),
});

export const discordThreadSubscriptionNamespace = "chat.discord.subscriptions";

export type DiscordThreadSubscriptionState = z.infer<
  typeof discordThreadSubscriptionStateSchema
>;

export interface DiscordThreadSubscriptionStore {
  set(key: string, value: DiscordThreadSubscriptionState): Promise<void>;
  get(key: string): Promise<DiscordThreadSubscriptionState | null>;
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<boolean>;
}

export function createDiscordThreadSubscriptionStore(
  runtimeState: IRuntimeStateNamespace,
): DiscordThreadSubscriptionStore {
  return runtimeState.scoped({
    namespace: discordThreadSubscriptionNamespace,
    schema: discordThreadSubscriptionStateSchema,
  });
}

/**
 * Create Chat SDK state where only Discord thread subscriptions are durable.
 *
 * The Chat SDK state adapter also owns locks, cache, lists, and queues. Those
 * stay delegated to the memory adapter so process restarts do not resurrect
 * stale locks or transient queues. Only subscribe/unsubscribe/isSubscribed use
 * shell-owned runtime state.
 */
export function createDiscordSubscriptionStateAdapter(
  runtimeState: IRuntimeStateNamespace,
  memoryState: StateAdapter = createMemoryState(),
): StateAdapter {
  const subscriptions = createDiscordThreadSubscriptionStore(runtimeState);

  return new DiscordSubscriptionStateAdapter(memoryState, subscriptions);
}

class DiscordSubscriptionStateAdapter implements StateAdapter {
  constructor(
    private readonly memoryState: StateAdapter,
    private readonly subscriptions: DiscordThreadSubscriptionStore,
  ) {}

  connect(): Promise<void> {
    return this.memoryState.connect();
  }

  disconnect(): Promise<void> {
    return this.memoryState.disconnect();
  }

  async subscribe(threadId: string): Promise<void> {
    await this.subscriptions.set(threadId, {
      subscribedAt: new Date().toISOString(),
    });
  }

  async unsubscribe(threadId: string): Promise<void> {
    await this.subscriptions.delete(threadId);
  }

  isSubscribed(threadId: string): Promise<boolean> {
    return this.subscriptions.has(threadId);
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
}
