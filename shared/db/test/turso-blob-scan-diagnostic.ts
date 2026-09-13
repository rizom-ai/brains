// Opt-in component diagnostic, NOT a driver/RPC replacement. Native SDK, hashing
// and all bounded row borrows stay on one worker. No whole BLOB reaches JS.
import assert from "node:assert/strict";
import {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} from "node:worker_threads";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { z } from "@brains/utils/zod";
import { withNativeStatement } from "../src/turso-worker/native-statement";
import {
  errorSchema,
  serializeError,
  deserializeError,
} from "../src/turso-worker/error-protocol";

const SIZE = 8 * 1024 * 1024;
const CHUNK = 32 * 1024;
const CURSOR_SQL =
  "SELECT n, substr(bytes, n + 1, ?) FROM diagnostic_blobs CROSS JOIN diagnostic_offsets WHERE id = ? ORDER BY n";
const OFFSETS_FIRST_SQL =
  "SELECT n, substr(bytes, n + 1, ?) FROM diagnostic_offsets CROSS JOIN diagnostic_blobs WHERE id = ? ORDER BY n";
const bootSchema = z.strictObject({ url: z.string().url() });
const resultSchema = z.strictObject({
  mode: z.enum([
    "queries",
    "queries-yield",
    "reused",
    "cursor",
    "cursor-offsets-first",
  ]),
  sizeBytes: z.literal(SIZE),
  rows: z.literal(SIZE / CHUNK),
  prepares: z.number().int().positive(),
  maxBackingBytes: z.literal(CHUNK),
  sha256: z.literal(
    "2daeb1f36095b44b318410b3f4e8b5d989dcc7bb023d1426c492dab0a3053e74",
  ),
  observedMilliseconds: z.number().nonnegative(),
});
const messageSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("progress"),
    mode: z.string().max(32),
    copiedBytes: z.number().int().min(0).max(SIZE),
  }),
  z.strictObject({
    kind: z.literal("done"),
    planOpcodes: z.array(z.string().min(1).max(64)).min(1).max(512),
    offsetsFirstPlanOpcodes: z.array(z.string().min(1).max(64)).min(1).max(512),
    results: z.array(resultSchema).length(5),
    nativeClosed: z.literal(true),
  }),
  z.strictObject({ kind: z.literal("failed"), error: errorSchema }),
]);

async function scanWorker(): Promise<void> {
  assert(!isMainThread);
  assert(parentPort);
  const options = bootSchema.parse(workerData);
  try {
    const { connect } = await import("@tursodatabase/database");
    const db = await connect(fileURLToPath(options.url));
    const run = (
      sql: string,
      args: (string | number)[] = [],
    ): Promise<unknown> =>
      withNativeStatement(
        () => db.inTransaction,
        () => db.prepare(sql),
        (statement) => statement.run(args),
      );
    await run(
      "CREATE TABLE diagnostic_blobs (id TEXT PRIMARY KEY, bytes BLOB NOT NULL)",
    );
    await run("INSERT INTO diagnostic_blobs VALUES (?, zeroblob(?))", [
      "fixture",
      SIZE,
    ]);
    // Pinned Turso rejects recursive CTEs. Use an explicit small fixture table,
    // not a runtime SQL fallback or an assumption about recursive support.
    await run("CREATE TABLE diagnostic_offsets (n INTEGER PRIMARY KEY)");
    const offsets = Array.from(
      { length: SIZE / CHUNK },
      (_, index) => index * CHUNK,
    );
    await run(
      `INSERT INTO diagnostic_offsets VALUES ${offsets.map(() => "(?)").join(",")}`,
      offsets,
    );
    const transition = async (sql: "BEGIN" | "ROLLBACK"): Promise<void> => {
      const before = sql === "ROLLBACK";
      assert.equal(db.inTransaction, before);
      const statement = await db.prepare(sql);
      assert.equal(db.inTransaction, before);
      await statement.run();
      assert.equal(db.inTransaction, !before);
      // SDK types declare void; still await a runtime asynchronous close.
      await Promise.resolve(statement.close());
      assert.equal(db.inTransaction, !before);
    };
    const explain = (query: string): Promise<string[]> =>
      withNativeStatement(
        () => db.inTransaction,
        () => db.prepare(`EXPLAIN ${query}`),
        async (statement) => {
          const plan = z
            .array(z.object({ opcode: z.string().min(1).max(64) }))
            .min(1)
            .max(512)
            .parse(await statement.all([CHUNK, "fixture"]));
          return [...new Set(plan.map((row) => row.opcode))];
        },
      );
    const planOpcodes = await explain(CURSOR_SQL);
    const offsetsFirstPlanOpcodes = await explain(OFFSETS_FIRST_SQL);
    const results: z.output<typeof resultSchema>[] = [];
    for (const mode of [
      "queries",
      "queries-yield",
      "reused",
      "cursor",
      "cursor-offsets-first",
    ] as const) {
      parentPort.postMessage({ kind: "progress", mode, copiedBytes: 0 });
      await transition("BEGIN");
      const hash = createHash("sha256");
      let rows = 0;
      let maxBackingBytes = 0;
      let prepares = 0;
      const consume = (input: unknown): void => {
        assert(Array.isArray(input));
        assert.equal(input.length, 2);
        assert.equal(input[0], rows * CHUNK);
        const value: unknown = input[1];
        assert(value instanceof ArrayBuffer || value instanceof Uint8Array);
        const bytes =
          value instanceof ArrayBuffer ? new Uint8Array(value) : value;
        assert.equal(bytes.byteLength, CHUNK);
        assert(bytes.buffer.byteLength <= CHUNK);
        maxBackingBytes = Math.max(maxBackingBytes, bytes.buffer.byteLength);
        hash.update(bytes);
        rows++;
        if (rows % 64 === 0)
          parentPort?.postMessage({
            kind: "progress",
            mode,
            copiedBytes: rows * CHUNK,
          });
      };
      const started = performance.now();
      const sql =
        "SELECT ?, substr(bytes, ?, ?) FROM diagnostic_blobs WHERE id = ?";
      if (mode === "queries" || mode === "queries-yield") {
        for (let offset = 0; offset < SIZE; offset += CHUNK) {
          prepares++;
          await withNativeStatement(
            () => db.inTransaction,
            () => db.prepare(sql),
            async (statement) => {
              const result: unknown = await statement
                .raw(true)
                .all([offset, offset + 1, CHUNK, "fixture"]);
              assert(Array.isArray(result));
              assert.equal(result.length, 1);
              consume(result[0]);
            },
          );
          if (mode === "queries-yield")
            await new Promise<void>((resolve) => setImmediate(resolve));
        }
      } else if (mode === "reused") {
        prepares++;
        await withNativeStatement(
          () => db.inTransaction,
          () => db.prepare(sql),
          async (statement) => {
            statement.raw(true);
            for (let offset = 0; offset < SIZE; offset += CHUNK) {
              const result: unknown = await statement.all([
                offset,
                offset + 1,
                CHUNK,
                "fixture",
              ]);
              assert(Array.isArray(result));
              assert.equal(result.length, 1);
              consume(result[0]);
            }
          },
        );
      } else {
        // This query may allocate/sort in the native engine. Bounded JS rows do
        // NOT establish native memory bounds, nor suitability for runtime use.
        prepares++;
        await withNativeStatement(
          () => db.inTransaction,
          () => db.prepare(mode === "cursor" ? CURSOR_SQL : OFFSETS_FIRST_SQL),
          async (statement) => {
            for await (const row of statement
              .raw(true)
              .iterate([CHUNK, "fixture"]))
              consume(row);
          },
        );
      }
      const observedMilliseconds = performance.now() - started;
      assert.equal(db.inTransaction, true);
      await transition("ROLLBACK");
      assert.equal(db.inTransaction, false);
      results.push(
        resultSchema.parse({
          mode,
          sizeBytes: SIZE,
          rows,
          prepares,
          maxBackingBytes,
          sha256: hash.digest("hex"),
          observedMilliseconds,
        }),
      );
    }
    assert.equal(new Set(results.map((result) => result.sha256)).size, 1);
    await db.close();
    parentPort.postMessage({
      kind: "done",
      results,
      planOpcodes,
      offsetsFirstPlanOpcodes,
      nativeClosed: true,
    });
  } catch (error) {
    // Do not improvise rollback/close after an unknown native failure. The parent
    // joins worker exit and retains the private DB, including WAL, for diagnosis.
    parentPort.postMessage({ kind: "failed", error: serializeError(error) });
  } finally {
    parentPort.close();
  }
}

async function main(): Promise<void> {
  if (process.env["BRAINS_FORBID_LOCAL_DATABASE_OPEN"] === "1")
    throw new Error("Local SQLite opens are forbidden in this process");
  const directory = await mkdtemp(join(tmpdir(), "turso-scan-shapes-"));
  const done =
    Promise.withResolvers<
      Extract<z.output<typeof messageSchema>, { kind: "done" }>
    >();
  const worker = new Worker(new URL(import.meta.url), {
    workerData: { url: pathToFileURL(join(directory, "scan.db")).href },
  });
  let closed = false;
  const exit = new Promise<number>((resolve) =>
    worker.once("exit", (code) => {
      resolve(code);
      done.reject(
        new Error(`Scan diagnostic worker exited before result (${code})`),
      );
    }),
  );
  worker.on("error", (error) => done.reject(error));
  worker.on("message", (input: unknown) => {
    try {
      const message = messageSchema.parse(input);
      if (message.kind === "failed")
        done.reject(deserializeError(message.error));
      else if (message.kind === "progress")
        console.error(
          `[scan-shape:${message.mode}] ${message.copiedBytes}/${SIZE} bytes`,
        );
      else {
        done.resolve(message);
      }
    } catch (error) {
      done.reject(error);
    }
  });
  const errors: unknown[] = [];
  let report: Record<string, unknown> | undefined;
  try {
    const result = await done.promise;
    closed = result.nativeClosed;
    assert.equal(await exit, 0);
    assert.deepEqual(
      result.results.map((entry) => entry.prepares),
      [SIZE / CHUNK, SIZE / CHUNK, 1, 1, 1],
    );
    report = {
      scope: "native-scan-shape-diagnostic",
      ...result,
      fixedOrderWarmCacheConfound: true,
      offsetsFirstPlanHasSortOperations: result.offsetsFirstPlanOpcodes.some(
        (opcode) => opcode.startsWith("Sorter") || opcode === "Sort",
      ),
      nativePlanHasSortOperations: result.planOpcodes.some(
        (opcode) => opcode.startsWith("Sorter") || opcode === "Sort",
      ),
      elapsedValuesAreObservationsNotBounds: true,
      nativeMemoryBoundEstablished: false,
      runtimeReplaced: false,
    };
  } catch (error) {
    errors.push(error);
  }
  try {
    await worker.terminate();
    await exit;
  } catch (error) {
    errors.push(error);
  }
  if (closed && errors.length === 0)
    await rm(directory, { recursive: true, force: true });
  else
    console.error(
      `Retained scan fixture after failed/unconfirmed lifecycle: ${directory}`,
    );
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1)
    throw new AggregateError(errors, "Scan diagnostic and cleanup failed", {
      cause: errors.at(-1),
    });
  assert(report);
  console.log(JSON.stringify(report));
}
if (isMainThread) await main();
else await scanWorker();
