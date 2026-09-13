// Worker algorithm. SQL construction is generic; no asset-table/ref policy lives here.
import { createHash } from "node:crypto";
import type { InStatement, ResultSet } from "@libsql/client";
import {
  blobPlanSchema,
  VERIFY_CHUNK_BYTES,
  VERIFY_SCRATCH_BYTES,
  VERIFY_SLOTS,
  type BlobFacts,
  type BlobPlan,
} from "./blob-protocol";

/** Synchronous worker-local borrow: copy visible bytes now; never retain the view. */
export type BlobSink = (bytes: Uint8Array, offset: number) => void;
export type BlobQuery = (statement: InStatement) => Promise<ResultSet>;
function identifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

interface BlobTarget {
  column: string;
  table: string;
  predicate: string;
  keys: BlobPlan["key"][number]["value"][];
  size: number;
}
// Header and body queries must share the caller's one native snapshot/lease.
async function target(
  input: BlobPlan,
  execute: BlobQuery,
): Promise<BlobTarget> {
  const plan = blobPlanSchema.parse(input);
  // Qualify columns so SQLite cannot reinterpret an unknown double-quoted
  // column as a string literal (DQS compatibility behavior).
  const column = `"proof_blob".${identifier(plan.column)}`;
  const table = `"main".${identifier(plan.table)} AS "proof_blob"`;
  const predicate = plan.key
    .map((key) => `"proof_blob".${identifier(key.column)} IS ?`)
    .join(" AND ");
  const keys = plan.key.map((key) => key.value);
  const header = await execute({
    sql: `SELECT typeof(${column}), length(${column}) FROM ${table} WHERE ${predicate} LIMIT 2`,
    args: keys,
  });
  if (header.rows.length !== 1)
    throw new Error("BLOB target must identify exactly one row");
  const row = header.rows[0];
  const size = row?.[1];
  if (
    row?.[0] !== "blob" ||
    typeof size !== "number" ||
    !Number.isSafeInteger(size) ||
    size < 0 ||
    size > plan.maxBytes ||
    (plan.expectedSize !== undefined && size !== plan.expectedSize)
  )
    throw new Error("Invalid BLOB type or size");
  return { column, table, predicate, keys, size };
}

// Incremental verification remains available under a full resident stage.
export async function verifyBlob(
  input: BlobPlan,
  execute: BlobQuery,
  sink?: BlobSink,
): Promise<BlobFacts> {
  const { column, table, predicate, keys, size } = await target(input, execute);
  const hash = createHash("sha256");
  for (let offset = 0; offset < size; offset += VERIFY_CHUNK_BYTES) {
    const length = Math.min(VERIFY_CHUNK_BYTES, size - offset);
    const result = await execute({
      sql: `SELECT substr(${column}, ?, ?) FROM ${table} WHERE ${predicate} LIMIT 2`,
      args: [offset + 1, length, ...keys],
    });
    const value: unknown = result.rows[0]?.[0];
    if (
      result.rows.length !== 1 ||
      !(value instanceof ArrayBuffer || value instanceof Uint8Array)
    )
      throw new Error("Invalid BLOB chunk result");
    const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : value;
    if (
      bytes.byteLength !== length ||
      bytes.buffer.byteLength > VERIFY_CHUNK_BYTES
    )
      throw new Error("Invalid BLOB chunk size or backing allocation");
    hash.update(bytes);
    if (sink) {
      sink(bytes, offset);
      // Materialization stays off-thread; yield so scope revocation can run.
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }
  return { sizeBytes: size, sha256: hash.digest("hex") };
}

/** Worker-only adoption. The caller reserves a whole backing before this call;
 * this result must never pass through an ordinary query/RPC reply. */
export async function adoptBlob(
  input: BlobPlan,
  execute: BlobQuery,
  accept: (bytes: Uint8Array) => void,
  assertLive: () => void,
): Promise<BlobFacts> {
  const { column, table, predicate, keys, size } = await target(input, execute);
  assertLive();
  const result = await execute({
    sql: `SELECT ${column} FROM ${table} WHERE ${predicate} LIMIT 2`,
    args: keys,
  });
  const value: unknown = result.rows[0]?.[0];
  if (
    result.rows.length !== 1 ||
    !(value instanceof ArrayBuffer || value instanceof Uint8Array)
  )
    throw new Error("Invalid adopted BLOB result");
  const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : value;
  if (
    bytes.byteLength !== size ||
    bytes.byteOffset !== 0 ||
    bytes.buffer.byteLength !== size
  )
    throw new Error("Invalid adopted BLOB size or backing allocation");
  accept(bytes); // Transfer logical ownership, never copy a second full backing.
  await new Promise<void>((resolve) => setImmediate(resolve));
  assertLive();
  const hash = createHash("sha256");
  for (let offset = 0; offset < size; offset += VERIFY_CHUNK_BYTES) {
    assertLive();
    hash.update(
      bytes.subarray(offset, Math.min(size, offset + VERIFY_CHUNK_BYTES)),
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  assertLive();
  return { sizeBytes: size, sha256: hash.digest("hex") };
}

// Independent logical scratch reservations, never an awaited capacity queue.
// Reserve BEFORE waiting for a root/lease slot. Native-engine RSS is not bounded
// by this allowance: substr limits JS-visible bytes, not engine internals.
export class VerificationBudget {
  private pending = 0;
  public stats(): { slots: number; reservedBytes: number } {
    return {
      slots: this.pending,
      reservedBytes: this.pending * VERIFY_SCRATCH_BYTES,
    };
  }
  public async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.pending >= VERIFY_SLOTS)
      throw new Error("BLOB verification scratch capacity exceeded");
    this.pending++;
    try {
      return await operation();
    } finally {
      this.pending--;
    }
  }
}
