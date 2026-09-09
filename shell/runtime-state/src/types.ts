import type { ZodType } from "@brains/utils/zod";

export interface RuntimeStateDbConfig {
  url: string;
  authToken?: string | undefined;
}

export type RuntimeStateServiceConfig = RuntimeStateDbConfig;

export type RuntimeStateValueSchema<T> = ZodType<T, unknown>;

export interface RuntimeStateScopeOptions<T> {
  /** Stable consumer namespace, e.g. "chat.discord.subscriptions". */
  namespace: string;
  /** Schema used to validate values crossing the persistence boundary. */
  schema: RuntimeStateValueSchema<T>;
}

export interface RuntimeStateRecordValue<T> {
  key: string;
  value: T;
  createdAt: Date;
  updatedAt: Date;
}

export interface IRuntimeStateStore<T> {
  get(key: string): Promise<T | null>;
  has(key: string): Promise<boolean>;
  set(key: string, value: T): Promise<void>;
  setIfNotExists(key: string, value: T): Promise<boolean>;
  /** Atomically replace an existing value only if its schema-serialized value matches.
   * Use a revision field when the consumer must distinguish an ABA change.
   * Independent processes must use the same backing database to coordinate.
   */
  compareAndSet(key: string, expected: T, value: T): Promise<boolean>;
  delete(key: string): Promise<boolean>;
  list(options?: {
    keyPrefix?: string | undefined;
  }): Promise<RuntimeStateRecordValue<T>[]>;
  clear(options?: { keyPrefix?: string | undefined }): Promise<number>;
}

export interface IRuntimeStateNamespace {
  scoped<T>(options: RuntimeStateScopeOptions<T>): IRuntimeStateStore<T>;
}

export interface IRuntimeStateService extends IRuntimeStateNamespace {
  /** Settle non-fatal database readiness work before the shell becomes ready. */
  initialize(): Promise<void>;
  close(): void;
}
