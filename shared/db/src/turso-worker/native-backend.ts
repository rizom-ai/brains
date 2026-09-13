// Internal worker-native backend. The execution owner is its sole caller and owns
// serialization. No nested native queue, implicit rollback or hidden handle access.
import { isMainThread } from "node:worker_threads";
import type { Database } from "@tursodatabase/database";
import type {
  InArgs,
  InStatement,
  InValue,
  ResultSet,
  Row,
  TransactionMode,
} from "@libsql/client";
import { localDatabasePath } from "../local-file-url";
import type { OwnerBackend, NativeTransaction } from "./backend-contract";
import { withNativeStatement } from "./native-statement";

function argumentsForNative(args: InArgs | undefined): InArgs | undefined {
  const value = (input: InValue): InValue => {
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (input instanceof Date) return input.valueOf();
    if (typeof input === "boolean") return Number(input);
    return input;
  };
  if (args === undefined) return undefined;
  return Array.isArray(args)
    ? args.map(value)
    : Object.fromEntries(
        Object.entries(args).map(([key, input]) => [key, value(input)]),
      );
}
function row(values: unknown[], columns: string[]): Row {
  const result: Row = { length: values.length };
  Object.defineProperty(result, "length", { enumerable: false });
  values.forEach((value, index) => {
    Object.defineProperty(result, index, { value });
    const column = columns[index];
    if (column !== undefined && !Object.hasOwn(result, column))
      Object.defineProperty(result, column, {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
  });
  return result;
}
function resultSet(value: Omit<ResultSet, "toJSON">): ResultSet {
  return {
    ...value,
    toJSON: (): unknown => ({
      ...value,
      lastInsertRowid: value.lastInsertRowid?.toString(),
    }),
  };
}

// Preserve the existing adapter's scalar/result conventions. This backend stays
// internal: callers must go through an owner, never bypass its serialization.
async function execute(db: Database, input: InStatement): Promise<ResultSet> {
  const sql = typeof input === "string" ? input : input.sql;
  const args = argumentsForNative(
    typeof input === "string" ? undefined : input.args,
  );
  return withNativeStatement(
    () => db.inTransaction,
    async () => db.prepare(sql),
    async (prepared) => {
      const columns = prepared.columns().map((column) => column.name);
      if (columns.length === 0) {
        const info =
          args === undefined ? await prepared.run() : await prepared.run(args);
        return resultSet({
          columns: [],
          columnTypes: [],
          rows: [],
          rowsAffected: info.changes,
          lastInsertRowid: BigInt(info.lastInsertRowid),
        });
      }
      const statement = prepared.raw(true);
      const raw: unknown =
        args === undefined ? await statement.all() : await statement.all(args);
      if (!Array.isArray(raw))
        throw new Error("Turso returned a non-array raw result set");
      return resultSet({
        columns,
        columnTypes: columns.map(() => ""),
        rows: raw.map((values: unknown) => {
          if (!Array.isArray(values))
            throw new Error("Turso returned a non-array raw row");
          return row(values, columns);
        }),
        rowsAffected: 0,
        lastInsertRowid: undefined,
      });
    },
  );
}
const beginSql: Record<TransactionMode, string> = {
  write: "BEGIN IMMEDIATE",
  read: "BEGIN",
  deferred: "BEGIN DEFERRED",
};

export async function openNativeBackend(url: string): Promise<OwnerBackend> {
  if (isMainThread)
    throw new Error("Native Turso backend requires an execution worker");
  if (process.env["BRAINS_FORBID_LOCAL_DATABASE_OPEN"] === "1")
    throw new Error("Local SQLite opens are forbidden in this process");
  const path = localDatabasePath(url);
  const { connect } = await import("@tursodatabase/database");
  const db = await connect(path);
  const backend: OwnerBackend = {
    inTransaction: () => db.inTransaction,
    execute: (input) => execute(db, input),
    executeMultiple: (sql) => db.exec(sql),
    transaction: async (mode): Promise<NativeTransaction> => {
      await db.exec(beginSql[mode]);
      return {
        execute: (input) => execute(db, input),
        executeMultiple: (sql) => db.exec(sql),
        batch: async (statements): Promise<ResultSet[]> => {
          const results: ResultSet[] = [];
          for (const input of statements)
            results.push(await execute(db, input));
          return results;
        },
        savepoint: (action, id): Promise<void> => {
          const name = `"proof_sp_${id}"`;
          return db.exec(
            action === "begin"
              ? `SAVEPOINT ${name}`
              : action === "rollback"
                ? `ROLLBACK TO SAVEPOINT ${name}`
                : `RELEASE SAVEPOINT ${name}`,
          );
        },
        commit: () => db.exec("COMMIT"),
        rollback: () => db.exec("ROLLBACK"),
      };
    },
    setForeignKeys: (enabled) =>
      db.exec(
        enabled ? "PRAGMA foreign_keys = ON" : "PRAGMA foreign_keys = OFF",
      ),
    foreignKeysEnabled: async () => {
      const value = (await execute(db, "PRAGMA foreign_keys")).rows[0]?.[0];
      if (value !== 0 && value !== 1)
        throw new Error("Invalid native foreign-key state");
      return value === 1;
    },
    close: async () => {
      let checkpointFailure: { error: unknown } | undefined;
      try {
        if (path !== ":memory:")
          await db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      } catch (error) {
        checkpointFailure = { error };
      }
      try {
        await db.close();
      } catch (error) {
        if (checkpointFailure)
          throw new AggregateError(
            [checkpointFailure.error, error],
            "Checkpoint and native close failed",
            { cause: error },
          );
        throw error;
      }
      if (checkpointFailure) throw checkpointFailure.error;
    },
  };
  return backend;
}
