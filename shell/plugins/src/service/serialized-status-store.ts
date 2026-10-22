import type {
  IRuntimeStateNamespace,
  IRuntimeStateStore,
  RuntimeStateValueSchema,
} from "@brains/runtime-state";
import { SerialQueue } from "./serial-queue";

const DEFAULT_KEY = "current";
/** Rewrites lost to another process before a mutation gives up. */
const MAX_WRITE_ATTEMPTS = 20;

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
 * history — all need the same three things: apply mutations one at a time so
 * concurrent callers cannot lose each other's updates, validate before every
 * write, and read what other processes wrote. A brain's web and worker
 * processes each hold a store over the same record, so every mutation reads
 * the stored document and writes it back only if it is still what was read;
 * a document another process changed in between is read again and the
 * mutation reapplied. This owns that engine so each service is left with only
 * its own domain rules.
 */
export class SerializedStatusStore<T> {
  private readonly store: IRuntimeStateStore<T>;
  private readonly schema: RuntimeStateValueSchema<T>;
  private readonly createEmpty: () => T;
  private readonly key: string;
  private readonly queue = new SerialQueue();

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
   * always reflects everything it wrote. A mutation can run again when another
   * process wrote the record meanwhile, so it must only change the state.
   */
  mutate<R>(mutation: (state: T) => R | Promise<R>): Promise<R> {
    return this.queue.run(() => this.apply(mutation, 1));
  }

  /** Settle pending writes, then return a deep copy of the stored state. */
  async snapshot(): Promise<T> {
    await this.settle();
    const stored = await this.store.get(this.key);
    return stored === null ? this.createEmpty() : structuredClone(stored);
  }

  /** Wait for queued mutations to finish. */
  settle(): Promise<void> {
    return this.queue.settle();
  }

  private async apply<R>(
    mutation: (state: T) => R | Promise<R>,
    attempt: number,
  ): Promise<R> {
    const stored = await this.store.get(this.key);
    const state =
      stored === null ? this.createEmpty() : structuredClone(stored);
    const result = await mutation(state);
    const next = this.schema.parse(state);
    const written =
      stored === null
        ? await this.store.setIfNotExists(this.key, next)
        : await this.store.compareAndSet(this.key, stored, next);
    if (written) return result;
    if (attempt >= MAX_WRITE_ATTEMPTS) {
      throw new Error(
        `Status record "${this.key}" kept changing under ${attempt} writes`,
      );
    }
    return this.apply(mutation, attempt + 1);
  }
}
