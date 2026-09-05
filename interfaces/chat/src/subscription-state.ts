import { createMemoryState } from "@chat-adapter/state-memory";
import type {
  InterfaceSetupContext,
  IRuntimeStateStore,
} from "@brains/sdk/interfaces";
import { z } from "@brains/utils/zod";
import type { Lock, QueueEntry, StateAdapter } from "chat";
import type { chatConfigSchema } from "./config";
import type { ChatPlatform } from "./types";

/** The durable, schema-validated store the runtime hands an interface at setup. */
export type ChatRuntimeState = InterfaceSetupContext<
  typeof chatConfigSchema
>["runtimeState"];

export const chatThreadSubscriptionStateSchema: z.ZodObject<{
  subscribedAt: z.ZodISODateTime;
  routingMode: z.ZodOptional<
    z.ZodEnum<{ auto: "auto"; "mention-required": "mention-required" }>
  >;
  mentionRequiredNoticeSent: z.ZodOptional<z.ZodBoolean>;
}> = z.object({
  subscribedAt: z.iso.datetime(),
  routingMode: z.enum(["auto", "mention-required"]).optional(),
  mentionRequiredNoticeSent: z.boolean().optional(),
});

export type ChatThreadSubscriptionState = z.output<
  typeof chatThreadSubscriptionStateSchema
>;

export type ChatThreadSubscriptionStore =
  IRuntimeStateStore<ChatThreadSubscriptionState>;

/**
 * The runtime files an interface's state under the interface's own id, so
 * Discord's subscriptions and Slack's never share a store; the namespace
 * names only what it holds.
 */
export const threadSubscriptionNamespace = "subscriptions";

export function createThreadSubscriptionStore(
  runtimeState: ChatRuntimeState,
): ChatThreadSubscriptionStore {
  return runtimeState({
    namespace: threadSubscriptionNamespace,
    schema: chatThreadSubscriptionStateSchema,
  });
}

/**
 * Create Chat SDK state where only thread subscriptions are durable. Locks,
 * cache, lists, and queues remain process-local in the memory adapter.
 */
export function createChatSubscriptionStateAdapter(
  runtimeState: ChatRuntimeState,
  platform: ChatPlatform,
  memoryState: StateAdapter = createMemoryState(),
): StateAdapter {
  return new ChatSubscriptionStateAdapter(
    memoryState,
    platform,
    createThreadSubscriptionStore(runtimeState),
  );
}

class ChatSubscriptionStateAdapter implements StateAdapter {
  private readonly memoryState: StateAdapter;
  private readonly platform: ChatPlatform;
  private readonly subscriptions: ChatThreadSubscriptionStore;

  constructor(
    memoryState: StateAdapter,
    platform: ChatPlatform,
    subscriptions: ChatThreadSubscriptionStore,
  ) {
    this.memoryState = memoryState;
    this.platform = platform;
    this.subscriptions = subscriptions;
  }

  connect(): Promise<void> {
    return this.memoryState.connect();
  }

  disconnect(): Promise<void> {
    return this.memoryState.disconnect();
  }

  async subscribe(threadId: string): Promise<void> {
    if (!this.owns(threadId)) return this.memoryState.subscribe(threadId);
    await this.subscriptions.set(threadId, {
      subscribedAt: new Date().toISOString(),
    });
  }

  async unsubscribe(threadId: string): Promise<void> {
    if (!this.owns(threadId)) return this.memoryState.unsubscribe(threadId);
    await this.subscriptions.delete(threadId);
  }

  isSubscribed(threadId: string): Promise<boolean> {
    return this.owns(threadId)
      ? this.subscriptions.has(threadId)
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

  /** Thread ids are prefixed with their platform; only this platform's are durable here. */
  private owns(threadId: string): boolean {
    return threadId.split(":")[0] === this.platform;
  }
}
