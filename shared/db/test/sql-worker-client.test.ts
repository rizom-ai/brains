import { it, expect } from "bun:test";
import assert from "node:assert/strict";
import type { ResultSet } from "@libsql/client";
import { SqlWorkerClient } from "../src/turso-worker/sql-client";
import {
  encodeResult,
  encodeResults,
  resultSet,
} from "../src/turso-worker/result-codec";

it("reconstructs reply rows without copying bytes and forbids caller-thread encoding", () => {
  const bytes = new ArrayBuffer(3);
  const result = resultSet({
    columns: ["bytes"],
    columnTypes: [""],
    rows: [[bytes]],
    rowsAffected: 0,
    lastInsertRowid: 7n,
  });
  const row = result.rows[0];
  assert(row);
  expect(row["bytes"]).toBe(bytes);
  assert.equal(row[0], bytes);
  assert.deepEqual(Object.keys(row), ["bytes"]);
  assert.throws(() => encodeResult(result), /requires an execution worker/);
  assert.throws(() => encodeResults([]), /requires an execution worker/);
});
import type { SqlWorkerTransport } from "../src/turso-worker/client-transport";

it("adapts a transport without a proof controller and preserves its close acknowledgement", async () => {
  const result: ResultSet = {
    columns: [],
    columnTypes: [],
    rows: [],
    rowsAffected: 0,
    lastInsertRowid: undefined,
    toJSON: () => ({}),
  };
  const close = Promise.withResolvers<void>();
  let closed = false;
  let executions = 0;
  function unexpected(): never {
    throw new Error("Unexpected transport operation");
  }
  const transport: SqlWorkerTransport = {
    get closed() {
      return closed;
    },
    execute: async (statement) => {
      executions++;
      assert.deepEqual(statement, { sql: "SELECT ?", args: [7] });
      return result;
    },
    batch: unexpected,
    migrateProgram: unexpected,
    executeMultiple: unexpected,
    transaction: unexpected,
    close: () => {
      closed = true;
      return close.promise;
    },
  };
  const client = new SqlWorkerClient(transport);
  assert.equal(await client.execute("SELECT ?", [7]), result);
  await assert.rejects(client.execute(""));
  expect(executions).toBe(1);
  const pending = client.closeAsync();
  assert.equal(pending, close.promise);
  assert.equal(client.closed, true);
  const failure = new Error("Transport close acknowledgement lost");
  const rejected = assert.rejects(pending, (error) => error === failure);
  close.reject(failure);
  await rejected;
});
