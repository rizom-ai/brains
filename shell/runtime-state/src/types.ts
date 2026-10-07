import type { ZodType } from "@brains/utils/zod";

export interface RuntimeStateDbConfig {
  url: string;
  authToken?: string | undefined;
}

export type RuntimeStateServiceConfig = RuntimeStateDbConfig;

export type RuntimeStateValueSchema<T, TInput = unknown> = ZodType<T, TInput>;

export interface RuntimeStateScopeOptions<T, TInput = T> {
  /** Stable consumer namespace, e.g. "chat.discord.subscriptions". */
  namespace: string;
  /** Schema used to validate values crossing the persistence boundary. */
  schema: RuntimeStateValueSchema<T, TInput>;
}

export interface RuntimeStateRecordValue<T> {
  key: string;
  value: T;
  createdAt: Date;
  updatedAt: Date;
}

export interface RuntimeStateListOptions {
  keyPrefix?: string | undefined;
  /** Exclusive key cursor, ordered using SQLite's binary key order. */
  afterKey?: string | undefined;
  /** Optional bounded page size (1–1000); applied before value parsing. */
  limit?: number | undefined;
}

export interface IRuntimeStateStore<T, TInput = T> {
  get(key: string): Promise<T | null>;
  has(key: string): Promise<boolean>;
  /** Persist JSON wire input; reads return the schema's parsed output. */
  set(key: string, value: TInput): Promise<void>;
  setIfNotExists(key: string, value: TInput): Promise<boolean>;
  /** Atomically replace an existing value whose parsed snapshot equals expected.
   * Persist JSON wire input, just like set. Use a revision field to distinguish
   * ABA changes. Independent processes must share a backing database.
   */
  compareAndSet(key: string, expected: T, value: TInput): Promise<boolean>;
  delete(key: string): Promise<boolean>;
  list(
    options?: RuntimeStateListOptions,
  ): Promise<RuntimeStateRecordValue<T>[]>;
  clear(options?: { keyPrefix?: string | undefined }): Promise<number>;
}

export interface IRuntimeStateNamespace {
  scoped<T, TInput = T>(
    options: RuntimeStateScopeOptions<T, TInput>,
  ): IRuntimeStateStore<T, TInput>;
}

export interface IRuntimeStateService extends IRuntimeStateNamespace {
  /** Settle non-fatal database readiness work before the shell becomes ready. */
  initialize(): Promise<void>;
  close(): void;
}
