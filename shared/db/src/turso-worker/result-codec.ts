import type { ResultSet, Row } from "@libsql/client";
import { isMainThread } from "node:worker_threads";
function assertEncodingWorker(): void {
  if (isMainThread)
    throw new Error("SQL result encoding requires an execution worker");
}
import { MAX_SQL_MESSAGE_BYTES } from "./client-protocol";
import { errorSummary } from "./error-protocol";
import {
  parseResult,
  type SqlResult,
  type SqlRowValue,
} from "./result-protocol";

// Worker-side encoding. This caps reply allocations, not native pre-reply results.
export function encodeResult(
  result: ResultSet,
  budget: number = MAX_SQL_MESSAGE_BYTES,
): { value: SqlResult; transfers: ArrayBuffer[]; bytes: number } {
  assertEncodingWorker();
  try {
    return encodeResultValue(result, budget);
  } catch (error) {
    const failure = new Error(
      `SQL completed but its result is unavailable; changes may have committed: ${errorSummary(error)}`,
      { cause: error },
    );
    Object.defineProperty(failure, "code", { value: "RESULT_UNAVAILABLE" });
    throw failure;
  }
}
function encodeResultValue(
  result: ResultSet,
  budget: number,
): {
  value: SqlResult;
  transfers: ArrayBuffer[];
  bytes: number;
} {
  const transfers: ArrayBuffer[] = [];
  let bytes = [...result.columns, ...result.columnTypes].reduce(
    (sum, column) => sum + Buffer.byteLength(column) + 16,
    256,
  );
  if (bytes > budget)
    throw new Error("Proof driver result byte limit exceeded");
  const rows = result.rows.map((row) =>
    Array.from({ length: row.length }, (_, index): SqlRowValue => {
      const value: unknown = row[index];
      const size =
        typeof value === "string"
          ? Buffer.byteLength(value)
          : value instanceof ArrayBuffer || value instanceof Uint8Array
            ? value.byteLength
            : 8;
      bytes += size + 16;
      if (bytes > budget)
        throw new Error("Proof driver result byte limit exceeded");
      if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
        // Allocate exact worker-owned backing; never transfer pooled/native storage.
        const owned = Uint8Array.from(
          value instanceof ArrayBuffer ? new Uint8Array(value) : value,
        ).buffer;
        transfers.push(owned);
        return owned;
      }
      if (
        value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "bigint"
      )
        return value;
      throw new Error("Unsupported native row value");
    }),
  );
  return {
    value: {
      columns: result.columns,
      columnTypes: result.columnTypes,
      rows,
      rowsAffected: result.rowsAffected,
      ...(result.lastInsertRowid !== undefined && {
        lastInsertRowid: result.lastInsertRowid,
      }),
    },
    transfers,
    bytes,
  };
}
export function encodeResults(results: ResultSet[]): {
  value: SqlResult[];
  transfers: ArrayBuffer[];
} {
  assertEncodingWorker();
  const value: SqlResult[] = [];
  const transfers: ArrayBuffer[] = [];
  let remaining = MAX_SQL_MESSAGE_BYTES;
  for (const result of results) {
    const encoded = encodeResult(result, remaining);
    remaining -= encoded.bytes;
    value.push(encoded.value);
    transfers.push(...encoded.transfers);
  }
  return { value, transfers };
}

// Caller-side reconstruction preserves the public ORM's hybrid row semantics.
export function resultSet(input: unknown): ResultSet {
  const result = parseResult(input);
  const rows = result.rows.map((values): Row => {
    const row: Row = { length: values.length };
    Object.defineProperty(row, "length", { enumerable: false });
    values.forEach((value, index) => {
      Object.defineProperty(row, index, { value });
      const column = result.columns[index];
      if (column !== undefined && !Object.hasOwn(row, column))
        Object.defineProperty(row, column, {
          value,
          enumerable: true,
          configurable: true,
          writable: true,
        });
    });
    return row;
  });
  return {
    ...result,
    rows,
    lastInsertRowid: result.lastInsertRowid,
    toJSON: (): unknown => ({
      ...result,
      rows,
      lastInsertRowid: result.lastInsertRowid?.toString(),
    }),
  };
}
export function resultSets(results: SqlResult[]): ResultSet[] {
  return results.map(resultSet);
}
