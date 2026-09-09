import { and, eq, gt, asc, sql, getTableColumns } from "drizzle-orm";
import { z } from "@brains/utils/zod";
import { prepareRuntimeStateValue } from "./wire-value";
import { isDeepStrictEqual } from "node:util";
import {
  runtimeStateRecords,
  type RuntimeStateRecord,
} from "./schema/runtime-state";
import type { RuntimeStateDB } from "./db";
import type {
  IRuntimeStateStore,
  RuntimeStateRecordValue,
  RuntimeStateValueSchema,
  RuntimeStateListOptions,
} from "./types";

// Qualified SDK owners include encoded package and declaration identifiers.
const namespacePattern = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,511}$/;
const maxKeyLength = 512;

export class RuntimeStateStore<T, TInput = T> implements IRuntimeStateStore<
  T,
  TInput
> {
  private readonly db: RuntimeStateDB;
  private readonly namespace: string;
  private readonly schema: RuntimeStateValueSchema<T, TInput>;
  private readonly now: () => Date;

  constructor(
    db: RuntimeStateDB,
    namespace: string,
    schema: RuntimeStateValueSchema<T, TInput>,
    now: () => Date = () => new Date(),
  ) {
    assertValidNamespace(namespace);
    this.db = db;
    this.namespace = namespace;
    this.schema = schema;
    this.now = now;
  }

  async get(key: string): Promise<T | null> {
    const normalizedKey = normalizeKey(key);
    const rows = await this.db
      .select()
      .from(runtimeStateRecords)
      .where(
        and(
          eq(runtimeStateRecords.namespace, this.namespace),
          eq(runtimeStateRecords.key, normalizedKey),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return this.schema.parse(row.value);
  }

  async has(key: string): Promise<boolean> {
    const normalizedKey = normalizeKey(key);
    const rows = await this.db
      .select({ key: runtimeStateRecords.key })
      .from(runtimeStateRecords)
      .where(
        and(
          eq(runtimeStateRecords.namespace, this.namespace),
          eq(runtimeStateRecords.key, normalizedKey),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async set(key: string, value: TInput): Promise<void> {
    const normalizedKey = normalizeKey(key);
    const wireValue = prepareRuntimeStateValue(this.schema, value);
    // Drizzle binds a JS null as SQL NULL before its JSON encoder runs.
    const storedValue = wireValue === null ? sql`'null'` : wireValue;
    const timestamp = this.now().getTime();

    await this.db
      .insert(runtimeStateRecords)
      .values({
        namespace: this.namespace,
        key: normalizedKey,
        value: storedValue,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        target: [runtimeStateRecords.namespace, runtimeStateRecords.key],
        set: {
          value: storedValue,
          updatedAt: timestamp,
        },
      });
  }

  async setIfNotExists(key: string, value: TInput): Promise<boolean> {
    const normalizedKey = normalizeKey(key);
    const wireValue = prepareRuntimeStateValue(this.schema, value);
    const storedValue = wireValue === null ? sql`'null'` : wireValue;
    const timestamp = this.now().getTime();

    const result = await this.db
      .insert(runtimeStateRecords)
      .values({
        namespace: this.namespace,
        key: normalizedKey,
        value: storedValue,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoNothing({
        target: [runtimeStateRecords.namespace, runtimeStateRecords.key],
      });

    return Number(result.rowsAffected) > 0;
  }

  async compareAndSet(key: string, expected: T, value: TInput): Promise<boolean> {
    const normalizedKey = normalizeKey(key);
    const wireValue = prepareRuntimeStateValue(this.schema, value);
    const [snapshot] = await this.db
      .select({ value: runtimeStateRecords.value })
      .from(runtimeStateRecords)
      .where(and(eq(runtimeStateRecords.namespace, this.namespace), eq(runtimeStateRecords.key, normalizedKey)))
      .limit(1);
    if (!snapshot || !isDeepStrictEqual(this.schema.parse(snapshot.value), expected)) return false;
    // Compare the exact wire snapshot in SQL, not its parsed output. Another
    // connection changing it after this read makes the atomic update fail.
    const expectedWire = snapshot.value === null ? sql`'null'` : snapshot.value;
    const storedValue = wireValue === null ? sql`'null'` : wireValue;
    const result = await this.db
      .update(runtimeStateRecords)
      .set({ value: storedValue, updatedAt: this.now().getTime() })
      .where(
        and(
          eq(runtimeStateRecords.namespace, this.namespace),
          eq(runtimeStateRecords.key, normalizedKey),
          eq(runtimeStateRecords.value, expectedWire),
        ),
      );
    return Number(result.rowsAffected) === 1;
  }

  async delete(key: string): Promise<boolean> {
    const normalizedKey = normalizeKey(key);
    const result = await this.db
      .delete(runtimeStateRecords)
      .where(
        and(
          eq(runtimeStateRecords.namespace, this.namespace),
          eq(runtimeStateRecords.key, normalizedKey),
        ),
      );
    return Number(result.rowsAffected) > 0;
  }

  async list(
    options: RuntimeStateListOptions = {},
  ): Promise<RuntimeStateRecordValue<T>[]> {
    const rows = await this.listRows(options);
    return rows.map((row) => ({
      key: row.key,
      value: this.schema.parse(row.value),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }));
  }

  async clear(
    options: { keyPrefix?: string | undefined } = {},
  ): Promise<number> {
    const keyPrefix = options.keyPrefix;
    if (keyPrefix === undefined) {
      const result = await this.db
        .delete(runtimeStateRecords)
        .where(eq(runtimeStateRecords.namespace, this.namespace));
      return Number(result.rowsAffected);
    }

    normalizeKeyPrefix(keyPrefix);
    const records = await this.list({ keyPrefix });
    await Promise.all(records.map((record) => this.delete(record.key)));
    return records.length;
  }

  private async listRows(
    options: RuntimeStateListOptions,
  ): Promise<RuntimeStateRecord[]> {
    const { keyPrefix, afterKey, limit } = options;
    if (keyPrefix !== undefined) normalizeKeyPrefix(keyPrefix);
    if (afterKey !== undefined) normalizeKey(afterKey);
    if (limit !== undefined) z.number().int().min(1).max(1000).parse(limit);
    const query = this.db
      .select({
        ...getTableColumns(runtimeStateRecords),
        // libsql's text decoder can truncate embedded NULs. Preserve the full
        // key so a page cursor cannot repeat or delete a different record.
        key: sql`CAST(${runtimeStateRecords.key} AS BLOB)`.mapWith(
          (bytes: Uint8Array | ArrayBuffer): string =>
            new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        ),
      })
      .from(runtimeStateRecords)
      .where(
        and(
          eq(runtimeStateRecords.namespace, this.namespace),
          keyPrefix !== undefined
            ? sql`substr(CAST(${runtimeStateRecords.key} AS BLOB), 1, length(CAST(${keyPrefix} AS BLOB))) = CAST(${keyPrefix} AS BLOB)`
            : undefined,
          afterKey !== undefined
            ? gt(runtimeStateRecords.key, afterKey)
            : undefined,
        ),
      )
      .orderBy(asc(runtimeStateRecords.key))
      .$dynamic();
    return limit === undefined ? query : query.limit(limit);
  }
}

function assertValidNamespace(namespace: string): void {
  if (!namespacePattern.test(namespace)) {
    throw new Error(
      `Invalid runtime state namespace: ${namespace}. Use 1-512 alphanumeric, _, ., :, or - characters.`,
    );
  }
}

function normalizeKey(key: string): string {
  if (key.length === 0 || key.length > maxKeyLength) {
    throw new Error("Runtime state keys must be 1-512 characters long");
  }
  return key;
}

function normalizeKeyPrefix(keyPrefix: string): string {
  if (keyPrefix.length > maxKeyLength) {
    throw new Error(
      "Runtime state key prefixes must be 512 characters or shorter",
    );
  }
  return keyPrefix;
}
