import { and, eq } from "drizzle-orm";
import type { z } from "@brains/utils";
import {
  runtimeStateRecords,
  type RuntimeStateRecord,
} from "./schema/runtime-state";
import type { RuntimeStateDB } from "./db";
import type { IRuntimeStateStore, RuntimeStateRecordValue } from "./types";

const namespacePattern = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/;
const maxKeyLength = 512;

export class RuntimeStateStore<T> implements IRuntimeStateStore<T> {
  constructor(
    private readonly db: RuntimeStateDB,
    private readonly namespace: string,
    private readonly schema: z.ZodType<T>,
    private readonly now: () => Date = () => new Date(),
  ) {
    assertValidNamespace(namespace);
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

  async set(key: string, value: T): Promise<void> {
    const normalizedKey = normalizeKey(key);
    const parsedValue = this.schema.parse(value);
    const timestamp = this.now().getTime();

    await this.db
      .insert(runtimeStateRecords)
      .values({
        namespace: this.namespace,
        key: normalizedKey,
        value: parsedValue,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        target: [runtimeStateRecords.namespace, runtimeStateRecords.key],
        set: {
          value: parsedValue,
          updatedAt: timestamp,
        },
      });
  }

  async setIfNotExists(key: string, value: T): Promise<boolean> {
    const normalizedKey = normalizeKey(key);
    const parsedValue = this.schema.parse(value);
    const timestamp = this.now().getTime();

    const result = await this.db
      .insert(runtimeStateRecords)
      .values({
        namespace: this.namespace,
        key: normalizedKey,
        value: parsedValue,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoNothing({
        target: [runtimeStateRecords.namespace, runtimeStateRecords.key],
      });

    return Number(result.rowsAffected) > 0;
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
    options: { keyPrefix?: string | undefined } = {},
  ): Promise<RuntimeStateRecordValue<T>[]> {
    const rows = await this.listRows();
    const keyPrefix = options.keyPrefix;
    if (keyPrefix !== undefined) normalizeKeyPrefix(keyPrefix);

    return rows
      .filter((row) => keyPrefix === undefined || row.key.startsWith(keyPrefix))
      .map((row) => ({
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

  private async listRows(): Promise<RuntimeStateRecord[]> {
    return this.db
      .select()
      .from(runtimeStateRecords)
      .where(eq(runtimeStateRecords.namespace, this.namespace));
  }
}

function assertValidNamespace(namespace: string): void {
  if (!namespacePattern.test(namespace)) {
    throw new Error(
      `Invalid runtime state namespace: ${namespace}. Use 1-128 alphanumeric, _, ., :, or - characters.`,
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
