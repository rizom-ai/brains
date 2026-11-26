import { createMemoryState } from "@chat-adapter/state-memory";
import type { ClassRuntimeState } from "@brains/sdk/internal/interface-runtime";
import { z } from "@brains/utils/zod";
import type { Lock, QueueEntry, StateAdapter } from "chat";
import type { ChatPlatform } from "./types";

export const chatThreadSubscriptionStateSchema: z.ZodObject<{
  subscribedAt: z.ZodString;
  routingMode: z.ZodOptional<
    z.ZodEnum<{ auto: "auto"; "mention-required": "mention-required" }>
  >;
  mentionRequiredNoticeSent: z.ZodOptional<z.ZodBoolean>;
}> = z.object({
  subscribedAt: z.string().datetime(),
  routingMode: z.enum(["auto", "mention-required"]).optional(),
  mentionRequiredNoticeSent: z.boolean().optional(),
});

export type ChatThreadSubscriptionState = z.output<
  typeof chatThreadSubscriptionStateSchema
>;

export type DiscordThreadSubscriptionState = ChatThreadSubscriptionState;

export const discordThreadSubscriptionStateSchema: typeof chatThreadSubscriptionStateSchema =
  chatThreadSubscriptionStateSchema;

export const discordThreadSubscriptionNamespace = "chat.discord.subscriptions";
export const slackThreadSubscriptionNamespace = "chat.slack.subscriptions";
export const matrixThreadSubscriptionNamespace = "chat.matrix.subscriptions";
/** The Matrix adapter's session, device and sync keys, which must survive restarts. */
export const matrixAdapterStateNamespace = "chat.matrix.adapter-state";

const durableValueSchema = z.object({
  value: z.unknown(),
  expiresAt: z.number().optional(),
});

type DurableValue = z.output<typeof durableValueSchema>;

/** The slice of a runtime-state store the durable keys use. */
interface DurableValueStore {
  get(key: string): Promise<DurableValue | null>;
  set(key: string, value: DurableValue): Promise<void>;
  setIfNotExists(key: string, value: DurableValue): Promise<boolean>;
  delete(key: string): Promise<boolean>;
}

/** Keys the Matrix adapter writes for its session, device and sync position. */
const MATRIX_DURABLE_KEY_PREFIX = "matrix:";

export interface ChatThreadSubscriptionStore {
  set(key: string, value: ChatThreadSubscriptionState): Promise<void>;
  get(key: string): Promise<ChatThreadSubscriptionState | null>;
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<boolean>;
}

export type DiscordThreadSubscriptionStore = ChatThreadSubscriptionStore;

function getSubscriptionNamespace(platform: ChatPlatform): string {
  switch (platform) {
    case "discord":
      return discordThreadSubscriptionNamespace;
    case "slack":
      return slackThreadSubscriptionNamespace;
    case "matrix":
      return matrixThreadSubscriptionNamespace;
  }
}

export function createThreadSubscriptionStore(
  runtimeState: ClassRuntimeState,
  platform: ChatPlatform,
): ChatThreadSubscriptionStore {
  return runtimeState.scoped({
    namespace: getSubscriptionNamespace(platform),
    schema: chatThreadSubscriptionStateSchema,
  });
}

export function createDiscordThreadSubscriptionStore(
  runtimeState: ClassRuntimeState,
): DiscordThreadSubscriptionStore {
  return createThreadSubscriptionStore(runtimeState, "discord");
}

export function createSlackThreadSubscriptionStore(
  runtimeState: ClassRuntimeState,
): ChatThreadSubscriptionStore {
  return createThreadSubscriptionStore(runtimeState, "slack");
}

/**
 * Create Chat SDK state where thread subscriptions, and with Matrix the
 * adapter's own `matrix:` keys, are durable. Locks, cache, lists, queues and
 * every other key remain process-local in the memory adapter.
 */
export function createChatSubscriptionStateAdapter(
  runtimeState: ClassRuntimeState,
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
  const durable = platforms.includes("matrix")
    ? runtimeState.scoped({
        namespace: matrixAdapterStateNamespace,
        schema: durableValueSchema,
      })
    : undefined;
  return new ChatSubscriptionStateAdapter(memoryState, subscriptions, durable);
}

export function createDiscordSubscriptionStateAdapter(
  runtimeState: ClassRuntimeState,
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
  private readonly durable: DurableValueStore | undefined;

  constructor(
    memoryState: StateAdapter,
    subscriptions: ReadonlyMap<ChatPlatform, ChatThreadSubscriptionStore>,
    durable?: DurableValueStore,
  ) {
    this.memoryState = memoryState;
    this.subscriptions = subscriptions;
    this.durable = durable;
  }

  /** The durable store when this key belongs in it. */
  private durableFor(key: string): DurableValueStore | undefined {
    return key.startsWith(MATRIX_DURABLE_KEY_PREFIX) ? this.durable : undefined;
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

  async delete(key: string): Promise<void> {
    const durable = this.durableFor(key);
    if (!durable) return this.memoryState.delete(key);
    await durable.delete(key);
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

  async get<T = unknown>(key: string): Promise<T | null> {
    const durable = this.durableFor(key);
    if (!durable) return this.memoryState.get<T>(key);
    const stored = await durable.get(key);
    if (!stored) return null;
    if (stored.expiresAt !== undefined && stored.expiresAt <= Date.now()) {
      await durable.delete(key);
      return null;
    }
    // The SDK's StateAdapter is generic in the value with no schema to check
    // against; what comes back is what the adapter stored under this key.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above
    return stored.value as T;
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
    const durable = this.durableFor(key);
    if (!durable) return this.memoryState.set<T>(key, value, ttlMs);
    return durable.set(key, durableValue(value, ttlMs));
  }

  async setIfNotExists(
    key: string,
    value: unknown,
    ttlMs?: number,
  ): Promise<boolean> {
    const durable = this.durableFor(key);
    if (!durable) return this.memoryState.setIfNotExists(key, value, ttlMs);
    // An expired value counts as absent; reading it clears it.
    await this.get(key);
    return durable.setIfNotExists(key, durableValue(value, ttlMs));
  }

  private getSubscriptionStore(
    threadId: string,
  ): ChatThreadSubscriptionStore | undefined {
    const prefix = threadId.split(":")[0];
    if (prefix !== "discord" && prefix !== "slack" && prefix !== "matrix") {
      return undefined;
    }
    return this.subscriptions.get(prefix);
  }
}

function durableValue(value: unknown, ttlMs: number | undefined): DurableValue {
  return ttlMs === undefined
    ? { value }
    : { value, expiresAt: Date.now() + ttlMs };
}
