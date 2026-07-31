import type {
  IRuntimeStateNamespace,
  IRuntimeStateStore,
  RuntimeStateValueSchema,
} from "@brains/runtime-state";
import { SerialQueue } from "./serial-queue";

const DEFAULT_KEY = "current";

export interface SerializedStatusStoreOptions<T> {
  runtimeState: IRuntimeStateNamespace;
  /** Stable consumer namespace, e.g. "directory-sync.operation-status". */
  namespace: string;
  /** Validates the state on every persist. */
  schema: RuntimeStateValueSchema<T>;
  /** Builds the starting state when nothing is stored yet. */
  createEmpty: () => T;
  /** Key within the namespace. Defaults to `current`. */
  key?: string;
}

/**
 * A single-record runtime-state document with serialized read-modify-write.
 *
 * Status services that keep one bounded document — an active run plus recent
 * history — all need the same three things: load it once and keep it in
 * memory, apply mutations one at a time so concurrent callers cannot lose each
 * other's updates, and validate before every write. This owns that engine so
 * each service is left with only its own domain rules.
 */
export class SerializedStatusStore<T> {
  private readonly store: IRuntimeStateStore<T>;
  private readonly schema: RuntimeStateValueSchema<T>;
  private readonly createEmpty: () => T;
  private readonly key: string;
  private readonly queue = new SerialQueue();
  private statePromise: Promise<T> | undefined;

  constructor(options: SerializedStatusStoreOptions<T>) {
    this.store = options.runtimeState.scoped<T>({
      namespace: options.namespace,
      schema: options.schema,
    });
    this.schema = options.schema;
    this.createEmpty = options.createEmpty;
    this.key = options.key ?? DEFAULT_KEY;
  }

  /**
   * Apply `mutation` to the current state and persist the result, returning
   * whatever the mutation returned. Mutations run one at a time in call order;
   * an async mutation holds the queue until it settles, so the persisted state
   * always reflects everything it wrote.
   */
  mutate<R>(mutation: (state: T) => R | Promise<R>): Promise<R> {
    return this.queue.run(async () => {
      const state = await this.load();
      const result = await mutation(state);
      await this.persist(state);
      return result;
    });
  }

  /** Settle pending writes, then return a deep copy of the state. */
  async snapshot(): Promise<T> {
    await this.settle();
    return structuredClone(await this.load());
  }

  /** Wait for queued mutations to finish. */
  settle(): Promise<void> {
    return this.queue.settle();
  }

  private load(): Promise<T> {
    this.statePromise ??= this.store
      .get(this.key)
      .then((stored) => stored ?? this.createEmpty());
    return this.statePromise;
  }

  private async persist(state: T): Promise<void> {
    await this.store.set(this.key, this.schema.parse(state));
  }
}
