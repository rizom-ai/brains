// Real store coverage on the worker adapter, including atomic prefix clearing.
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import assert from "node:assert/strict";
import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { migrate } from "drizzle-orm/libsql/migrator";
import { z } from "@brains/utils/zod";
import { RuntimeStateStore } from "../shell/runtime-state/src/runtime-state-store";
import type { RuntimeStateDB } from "../shell/runtime-state/src/db";
import { runtimeStateRecords } from "../shell/runtime-state/src/schema/runtime-state";
import { SqlWorkerDriver } from "../shared/db/src/turso-worker/client";
import { MAX_IN_FLIGHT } from "../shared/db/src/turso-worker/protocol";
import { createWorkerDatabase } from "../shared/db/src/turso-worker/binary-transaction";

const workerUrl = new URL(
  "../shared/db/src/turso-worker/worker.ts",
  import.meta.url,
);
const valueSchema = z.strictObject({
  label: z.string(),
  count: z.number().int().min(0),
  enabled: z.boolean(),
  tags: z.array(z.string()),
});
type Value = z.output<typeof valueSchema>;
const value: Value = {
  label: "COMMIT; BEGIN; 你好",
  count: 1,
  enabled: true,
  tags: ["a", "b"],
};
const drivers: SqlWorkerDriver[] = [];
let folder: string;
async function open(
  path: string,
  initialize = true,
): Promise<{ driver: SqlWorkerDriver; db: RuntimeStateDB }> {
  const driver = new SqlWorkerDriver({
    url: pathToFileURL(path).href,
    workerUrl,
  });
  drivers.push(driver);
  const db = createWorkerDatabase<Record<string, unknown>>(driver, {
    runtimeStateRecords,
  });
  if (initialize)
    await migrate(db, {
      migrationsFolder: fileURLToPath(
        new URL("../shell/runtime-state/drizzle", import.meta.url),
      ),
    });
  return { driver, db };
}
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "brains-thread-runtime-state-"));
});
afterEach(async () => {
  const results = await Promise.allSettled(
    drivers.splice(0).map((driver) => driver.close()),
  );
  const errors = results.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : [],
  );
  // Keep original databases/WALs for failure and recovery inspection.
  console.info(`[runtime-state] retained ${folder}`);
  if (errors.length)
    throw new AggregateError(errors, "Runtime-state proof cleanup failed");
});

describe("real runtime-state store on the isolated Turso thread", () => {
  it("maps JSON/dates and conflict row counts with namespace isolation and exact restored records", async () => {
    const path = join(folder, "state.db");
    const { driver, db } = await open(path);
    let timestamp = 1000;
    const store = new RuntimeStateStore(
      db,
      "proof.one",
      valueSchema,
      () => new Date(timestamp),
    );
    const other = new RuntimeStateStore(
      db,
      "proof.two",
      valueSchema,
      () => new Date(timestamp),
    );
    const contenders = await Promise.all([
      store.setIfNotExists("key", value),
      store.setIfNotExists("key", { ...value, count: 2 }),
    ]);
    expect(contenders).toEqual([true, false]);
    expect(await store.get("key")).toEqual(value);
    expect(await other.has("key")).toBe(false);
    await other.set("key", { ...value, count: 7 });
    timestamp = 2000;
    await store.set("key", { ...value, count: 3, enabled: false });
    const expected = await store.list();
    expect(expected).toEqual([
      {
        key: "key",
        value: { ...value, count: 3, enabled: false },
        createdAt: new Date(1000),
        updatedAt: new Date(2000),
      },
    ]);
    await assert.rejects(store.set("invalid", { ...value, count: -1 }));
    expect(await store.has("invalid")).toBe(false);
    await driver.close();
    const restoredPath = join(folder, "restored.db");
    await cp(path, restoredPath, { errorOnExist: true, force: false });
    const restored = await open(restoredPath, false);
    expect(
      await new RuntimeStateStore(restored.db, "proof.one", valueSchema).list(),
    ).toEqual(expected);
    expect(
      await new RuntimeStateStore(restored.db, "proof.two", valueSchema).get(
        "key",
      ),
    ).toEqual({ ...value, count: 7 });
  });

  it("keeps literal prefixes and deletion counts scoped and validates persisted values on read", async () => {
    const { db } = await open(join(folder, "prefix.db"));
    const store = new RuntimeStateStore(db, "proof.one", valueSchema);
    const other = new RuntimeStateStore(db, "proof.two", valueSchema);
    for (const key of ["p_%:one", "p_%:two", "pABC", "other"])
      await store.set(key, value);
    await other.set("p_%:one", value);
    expect(
      (await store.list({ keyPrefix: "p_%:" }))
        .map((record) => record.key)
        .sort(),
    ).toEqual(["p_%:one", "p_%:two"]);
    expect(await store.clear({ keyPrefix: "p_%:" })).toBe(2);
    expect(await store.delete("pABC")).toBe(true);
    expect(await store.delete("pABC")).toBe(false);
    expect(await other.has("p_%:one")).toBe(true);
    await store.set("corrupt:valid", value);
    await db.insert(runtimeStateRecords).values({
      namespace: "proof.one",
      key: "corrupt",
      value: { count: "not a number" },
      createdAt: 1000,
      updatedAt: 1000,
    });
    expect(await store.has("corrupt")).toBe(true);
    await assert.rejects(store.get("corrupt"));
    await assert.rejects(store.clear({ keyPrefix: "corrupt" }));
    expect(await store.has("corrupt")).toBe(true);
    expect(await store.get("corrupt:valid")).toEqual(value);
    // The existing unfiltered clear is one DELETE and does not deserialize values.
    expect(await store.clear()).toBe(3);
    expect(await store.list()).toEqual([]);
    expect(await other.get("p_%:one")).toEqual(value);
    await store.set("valid-key", value);
    await db.insert(runtimeStateRecords).values({
      namespace: "proof.one",
      key: "",
      value,
      createdAt: 1000,
      updatedAt: 1000,
    });
    await assert.rejects(store.clear({ keyPrefix: "" }), /1-512 characters/);
    expect(await store.has("valid-key")).toBe(true);
    expect(await store.list()).toHaveLength(2);
    expect(await store.clear()).toBe(2);
  });

  it("rolls back acknowledged deletes when a later deletion fails", async () => {
    const path = join(folder, "rollback.db");
    const { driver, db } = await open(path);
    const store = new RuntimeStateStore(db, "proof.rollback", valueSchema);
    for (const key of ["bulk:one", "bulk:two", "bulk:three", "keep"])
      await store.set(key, value);
    const expected = (await store.list()).sort((a, b) =>
      a.key.localeCompare(b.key),
    );
    const failure = new Error("Injected second delete failure");
    const execute = driver.execute.bind(driver);
    let deletions = 0;
    let acknowledged = 0;
    driver.execute = async (statement, lease): ReturnType<typeof execute> => {
      if (
        lease !== undefined &&
        statement.sql.startsWith('delete from "runtime_state_records"')
      ) {
        if (++deletions === 2) throw failure;
        const result = await execute(statement, lease);
        acknowledged++;
        return result;
      }
      return execute(statement, lease);
    };
    await assert.rejects(
      store.clear({ keyPrefix: "bulk:" }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.cause, failure);
        return true;
      },
    );
    expect(acknowledged).toBe(1);
    expect(
      (await store.list()).sort((a, b) => a.key.localeCompare(b.key)),
    ).toEqual(expected);
    await driver.close();
    // Reopen the original database/WAL only after the actual owner exit.
    const reopened = await open(path, false);
    const live = new RuntimeStateStore(
      reopened.db,
      "proof.rollback",
      valueSchema,
    );
    expect(
      (await live.list()).sort((a, b) => a.key.localeCompare(b.key)),
    ).toEqual(expected);
    expect(await live.clear({ keyPrefix: "bulk:" })).toBe(3);
    expect(await live.has("keep")).toBe(true);
  });

  it("clears more rows than the admission limit atomically and preserves other namespaces after reopen", async () => {
    const path = join(folder, "fanout.db");
    const { driver, db } = await open(path);
    const store = new RuntimeStateStore(db, "proof.fanout", valueSchema);
    const other = new RuntimeStateStore(db, "proof.other", valueSchema);
    await other.set("bulk:keep", value);
    for (let i = 0; i <= MAX_IN_FLIGHT; i++)
      await store.set(`bulk:${String(i).padStart(3, "0")}`, value);
    expect(await store.list()).toHaveLength(MAX_IN_FLIGHT + 1);
    expect(await store.clear({ keyPrefix: "bulk:" })).toBe(MAX_IN_FLIGHT + 1);
    await driver.close(); // Actual exit before original database/WAL reopen.
    const restored = await open(path, false);
    expect(
      await new RuntimeStateStore(
        restored.db,
        "proof.fanout",
        valueSchema,
      ).list(),
    ).toHaveLength(0);
    expect(
      await new RuntimeStateStore(restored.db, "proof.other", valueSchema).get(
        "bulk:keep",
      ),
    ).toEqual(value);
  });
});
