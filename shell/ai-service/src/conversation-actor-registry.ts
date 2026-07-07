/**
 * Conversation Actor Registry
 *
 * Owns per-conversation machine actors and the serialization that keeps
 * service callers from resolving against another turn's machine state:
 * one FIFO operation chain per conversation (bounded), plus idle-TTL
 * eviction of actors that have gone quiet.
 *
 * Deliberately xstate-free: actor construction and the idle check are
 * injected, so the registry is unit-testable with fake actors and the
 * machine wiring stays in AgentService.
 */

const DEFAULT_MAX_OPERATIONS_PER_CONVERSATION = 10;

type EvictionTimer = ReturnType<typeof setTimeout>;

export interface ConversationActorRegistryOptions<TActor> {
  /** Create (and start) a fresh actor for a conversation. */
  createActor: () => TActor;
  /** Whether an actor may be evicted right now (e.g. machine is idle). */
  isEvictable: (actor: TActor) => boolean;
  /** Idle TTL in ms; <= 0 disables eviction entirely. */
  idleTtlMs: number;
  /** Queue bound per conversation before callers get a busy error. */
  maxOperationsPerConversation?: number;
}

export class ConversationActorRegistry<TActor extends { stop(): void }> {
  private readonly createActor: () => TActor;
  private readonly isEvictable: (actor: TActor) => boolean;
  private readonly idleTtlMs: number;
  private readonly maxOperations: number;

  private readonly actors = new Map<string, TActor>();
  private readonly operations = new Map<string, Promise<void>>();
  private readonly operationCounts = new Map<string, number>();
  private readonly evictionTimers = new Map<string, EvictionTimer>();

  constructor(options: ConversationActorRegistryOptions<TActor>) {
    this.createActor = options.createActor;
    this.isEvictable = options.isEvictable;
    this.idleTtlMs = options.idleTtlMs;
    this.maxOperations =
      options.maxOperationsPerConversation ??
      DEFAULT_MAX_OPERATIONS_PER_CONVERSATION;
  }

  /** Get the conversation's actor, creating it if needed. */
  public acquire(conversationId: string): TActor {
    this.clearEvictionTimer(conversationId);

    let actor = this.actors.get(conversationId);
    if (!actor) {
      actor = this.createActor();
      this.actors.set(conversationId, actor);
    }
    return actor;
  }

  /** Get the conversation's actor without creating one. */
  public peek(conversationId: string): TActor | undefined {
    return this.actors.get(conversationId);
  }

  /**
   * Append an operation to the conversation's FIFO chain. Rejects with a
   * busy error when the chain is already at the bound.
   */
  public enqueue<T>(
    conversationId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const count = this.operationCounts.get(conversationId) ?? 0;
    if (count >= this.maxOperations) {
      return Promise.reject(
        new Error(
          "Conversation is busy. Please wait for earlier messages to finish.",
        ),
      );
    }

    this.operationCounts.set(conversationId, count + 1);

    const previous = this.operations.get(conversationId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(operation);
    const tracked = run.catch(() => undefined).then(() => undefined);

    this.operations.set(conversationId, tracked);
    void tracked.then(() => {
      const remaining = (this.operationCounts.get(conversationId) ?? 1) - 1;
      if (remaining <= 0) {
        this.operationCounts.delete(conversationId);
      } else {
        this.operationCounts.set(conversationId, remaining);
      }

      if (this.operations.get(conversationId) === tracked) {
        this.operations.delete(conversationId);
      }

      this.scheduleEviction(conversationId);
    });

    return run;
  }

  /** (Re)arm the idle-eviction timer for a conversation. */
  public scheduleEviction(conversationId: string): void {
    this.clearEvictionTimer(conversationId);
    if (this.idleTtlMs <= 0) return;

    const timer = setTimeout(() => {
      this.evictionTimers.delete(conversationId);
      const actor = this.actors.get(conversationId);
      if (!actor) return;
      if ((this.operationCounts.get(conversationId) ?? 0) > 0) {
        return;
      }
      if (!this.isEvictable(actor)) return;

      actor.stop();
      this.actors.delete(conversationId);
    }, this.idleTtlMs);

    const unref = Reflect.get(timer, "unref");
    if (typeof unref === "function") {
      Reflect.apply(unref, timer, []);
    }

    this.evictionTimers.set(conversationId, timer);
  }

  /** Stop every actor and drop all registry state. */
  public dispose(): void {
    for (const actor of this.actors.values()) {
      actor.stop();
    }
    for (const timer of this.evictionTimers.values()) {
      clearTimeout(timer);
    }
    this.actors.clear();
    this.operations.clear();
    this.operationCounts.clear();
    this.evictionTimers.clear();
  }

  private clearEvictionTimer(conversationId: string): void {
    const timer = this.evictionTimers.get(conversationId);
    if (!timer) return;
    clearTimeout(timer);
    this.evictionTimers.delete(conversationId);
  }
}
