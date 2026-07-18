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

import {
  Effect,
  Exit,
  Fiber,
  FiberMap,
  Option,
  Scope,
} from "@brains/utils/effect";
import type { Clock } from "@brains/utils/effect";

const DEFAULT_MAX_OPERATIONS_PER_CONVERSATION = 10;

function raceWithSignal<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);

  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    void promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

interface EvictionSupervisor {
  scope: Scope.CloseableScope;
  fibers: FiberMap.FiberMap<string, void, never>;
}

interface ConversationActorRegistryRuntimeOptions {
  /** Internal clock boundary used for deterministic eviction tests. */
  clock?: Clock.Clock;
}

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
  private readonly evictionRevisions = new Map<string, number>();
  private evictionGeneration = 0;
  private readonly evictionSupervisor: EvictionSupervisor;
  private readonly lifecycleController = new AbortController();
  private closePromise: Promise<void> | null = null;
  private closeReason: unknown;
  private closed = false;
  private readonly clock: Clock.Clock | undefined;

  constructor(options: ConversationActorRegistryOptions<TActor>);
  constructor(
    options: ConversationActorRegistryOptions<TActor>,
    runtimeOptions?: ConversationActorRegistryRuntimeOptions,
  ) {
    this.createActor = options.createActor;
    this.isEvictable = options.isEvictable;
    this.idleTtlMs = options.idleTtlMs;
    this.maxOperations =
      options.maxOperationsPerConversation ??
      DEFAULT_MAX_OPERATIONS_PER_CONVERSATION;
    this.clock = runtimeOptions?.clock;
    this.evictionSupervisor = this.createEvictionSupervisor();
  }

  /** Get the conversation's actor, creating it if needed. */
  public acquire(conversationId: string): TActor {
    this.assertOpen();
    this.cancelEviction(conversationId);

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
    operation: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    if (this.closed) return Promise.reject(this.closeReason);
    const operationSignal = signal
      ? AbortSignal.any([this.lifecycleController.signal, signal])
      : this.lifecycleController.signal;
    if (operationSignal.aborted) {
      return Promise.reject(operationSignal.reason);
    }

    const count = this.operationCounts.get(conversationId) ?? 0;
    if (count >= this.maxOperations) {
      return Promise.reject(
        new Error(
          "Conversation is busy. Please wait for earlier messages to finish.",
        ),
      );
    }

    this.operationCounts.set(conversationId, count + 1);

    const generation = this.evictionGeneration;
    const previous = this.operations.get(conversationId) ?? Promise.resolve();
    const run = previous
      .catch(() => undefined)
      .then(() => {
        operationSignal.throwIfAborted();
        return operation(operationSignal);
      });
    const tracked = run.catch(() => undefined).then(() => undefined);

    this.operations.set(conversationId, tracked);
    void tracked.then(() => {
      if (generation !== this.evictionGeneration) return;
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

    return raceWithSignal(run, operationSignal);
  }

  /** (Re)arm the supervised idle-eviction fiber for a conversation. */
  public scheduleEviction(conversationId: string): void {
    if (this.closed) return;
    const revision = this.cancelEviction(conversationId);
    if (this.idleTtlMs <= 0) return;

    const generation = this.evictionGeneration;
    const timedEviction = Effect.sleep(this.idleTtlMs).pipe(
      Effect.andThen(
        Effect.sync(() => {
          if (generation !== this.evictionGeneration) return;
          if (this.evictionRevisions.get(conversationId) !== revision) return;

          this.evictionRevisions.delete(conversationId);
          const actor = this.actors.get(conversationId);
          if (!actor) return;
          if ((this.operationCounts.get(conversationId) ?? 0) > 0) {
            return;
          }
          if (!this.isEvictable(actor)) return;

          actor.stop();
          this.actors.delete(conversationId);
        }),
      ),
    );
    const eviction = this.clock
      ? Effect.withClock(timedEviction, this.clock)
      : timedEviction;

    const fiber = Effect.runFork(eviction);
    FiberMap.unsafeSet(this.evictionSupervisor.fibers, conversationId, fiber);
  }

  /** Terminally stop admission, drain operations, and stop every actor. */
  public close(
    reason: unknown = new Error("Conversation actor registry closed"),
  ): Promise<void> {
    if (this.closePromise) return this.closePromise;

    this.closed = true;
    this.closeReason = reason;
    this.evictionGeneration++;
    this.lifecycleController.abort(reason);
    const operations = [...this.operations.values()];
    this.closePromise = this.closeRegistry(operations);
    return this.closePromise;
  }

  private async closeRegistry(operations: Promise<void>[]): Promise<void> {
    const settlements = await Promise.allSettled([
      Effect.runPromise(Scope.close(this.evictionSupervisor.scope, Exit.void)),
      ...operations,
    ]);

    const stopErrors: unknown[] = [];
    for (const actor of this.actors.values()) {
      try {
        actor.stop();
      } catch (error) {
        stopErrors.push(error);
      }
    }
    this.actors.clear();
    this.operations.clear();
    this.operationCounts.clear();
    this.evictionRevisions.clear();

    const settlementFailure = settlements.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (settlementFailure) throw settlementFailure.reason;
    if (stopErrors.length > 0) throw stopErrors[0];
  }

  private cancelEviction(conversationId: string): number {
    const revision = (this.evictionRevisions.get(conversationId) ?? 0) + 1;
    this.evictionRevisions.set(conversationId, revision);

    const fiber = FiberMap.unsafeGet(
      this.evictionSupervisor.fibers,
      conversationId,
    );
    if (Option.isSome(fiber)) {
      Effect.runSync(Fiber.interruptFork(fiber.value));
    }
    return revision;
  }

  private assertOpen(): void {
    if (this.closed) throw this.closeReason;
  }

  private createEvictionSupervisor(): EvictionSupervisor {
    const scope = Effect.runSync(Scope.make());
    const fibers = Effect.runSync(
      Scope.extend(FiberMap.make<string, void, never>(), scope),
    );
    return { scope, fibers };
  }
}
