import { afterEach, describe, expect, it } from "bun:test";
import assert from "node:assert/strict";
import type { InStatement, ResultSet, Row } from "@libsql/client";
import {
  VERIFY_CHUNK_BYTES,
  type BlobPlan,
} from "../src/turso-worker/blob-protocol";
import {
  verifyBlob,
  VerificationBudget,
} from "../src/turso-worker/blob-verification";
import { ExecutionOwner } from "../src/turso-worker/ownership";
import type { OwnerBackend } from "../src/turso-worker/backend-contract";
import { TursoThreadProof } from "./fixtures/turso-thread/client";
import { withBinaryTransaction } from "./fixtures/turso-thread/binary-transaction";

const digest =
  "d4f9bcbd9be765d114b85ab79d16c218fb5c1e03315f689603d48eed00bff97f";
const smallDigest =
  "709e80c88487a2411e1ee4dfb9f22a861492d20c4765150c0c794abd70f8147c";
const emptyDigest =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const plan: BlobPlan = {
  table: "blobs",
  column: "bytes",
  key: [{ column: "id", value: "one" }],
  maxBytes: 65539,
  expectedSize: 65539,
};
function result(values: unknown[][]): ResultSet {
  const rows = values.map((values) => {
    const row: Row = { length: values.length };
    for (const [index, value] of values.entries())
      Object.defineProperty(row, index, { value, enumerable: true });
    return row;
  });
  return {
    rows,
    columns: [],
    columnTypes: [],
    rowsAffected: 0,
    lastInsertRowid: undefined,
    toJSON: () => ({}),
  };
}
const drivers: TursoThreadProof[] = [];
async function create(): Promise<TursoThreadProof> {
  const driver = new TursoThreadProof({
    url: "file::memory:",
    workerUrl: new URL("./fixtures/turso-thread/worker.ts", import.meta.url),
  });
  drivers.push(driver);
  await driver.execute({
    sql: "CREATE TABLE blobs (id TEXT PRIMARY KEY, bytes BLOB)",
  });
  await driver.execute({
    sql: "INSERT INTO blobs VALUES ('one', zeroblob(65539))",
  });
  return driver;
}
afterEach(async () => {
  for (const driver of drivers.splice(0)) await driver.close();
});

describe("bounded digest-only BLOB verification", () => {
  it("hashes bounded native slices and never accumulates payloads in its query plan", async () => {
    const queries: InStatement[] = [];
    const facts = await verifyBlob(plan, async (statement) => {
      queries.push(statement);
      if (queries.length === 1) return result([["blob", 65539]]);
      assert.equal(typeof statement, "object");
      assert(typeof statement !== "string" && Array.isArray(statement.args));
      const length = statement.args[1];
      assert(typeof length === "number" && length <= VERIFY_CHUNK_BYTES);
      return result([[new ArrayBuffer(length)]]);
    });
    assert.deepEqual(facts, { sizeBytes: 65539, sha256: digest });
    assert.deepEqual(
      queries
        .slice(1)
        .map((statement) =>
          typeof statement === "string" ? undefined : statement.args,
        ),
      [
        [1, 32768, "one"],
        [32769, 32768, "one"],
        [65537, 3, "one"],
      ],
    );
  });
  it("rejects absent/ambiguous/non-BLOB/changed/oversized headers before fetching bytes", async () => {
    for (const rows of [
      [],
      [
        ["blob", 65539],
        ["blob", 65539],
      ],
      [["text", 65539]],
      [["blob", 65538]],
      [["blob", 65540]],
    ]) {
      let queries = 0;
      await assert.rejects(
        verifyBlob(plan, async () => {
          queries++;
          return result(rows);
        }),
      );
      assert.equal(queries, 1);
    }
  });
  it("rejects malformed chunks and tiny views retaining oversized backing allocations", async () => {
    for (const value of [
      "not a blob",
      new ArrayBuffer(0),
      new Uint8Array(new ArrayBuffer(65536), 0, 1),
    ]) {
      let queries = 0;
      await assert.rejects(
        verifyBlob({ ...plan, expectedSize: 1 }, async () =>
          ++queries === 1 ? result([["blob", 1]]) : result([[value]]),
        ),
        /Invalid BLOB chunk/,
      );
      assert.equal(queries, 2);
    }
  });
  it("returns the empty digest without fetching any BLOB bytes", async () => {
    let queries = 0;
    const execute = async (): Promise<ResultSet> => {
      queries++;
      return result([["blob", 0]]);
    };
    const facts = await verifyBlob(
      { ...plan, maxBytes: 0, expectedSize: 0 },
      execute,
    );
    expect(facts).toEqual({ sizeBytes: 0, sha256: emptyDigest });
    expect(queries).toBe(1);
  });
  it("reserves scratch synchronously, rejects excess work and releases on every outcome", async () => {
    const budget = new VerificationBudget();
    const release = Promise.withResolvers<void>();
    const failure = new Error("verification failed");
    const first = budget.run(async () => {
      await release.promise;
      return 1;
    });
    const second = assert.rejects(
      budget.run(async () => {
        await release.promise;
        throw failure;
      }),
      (error) => error === failure,
    );
    assert.deepEqual(budget.stats(), { slots: 2, reservedBytes: 131072 });
    await assert.rejects(
      budget.run(async () => 3),
      /scratch capacity/,
    );
    release.resolve();
    assert.equal(await first, 1);
    await second;
    await assert.rejects(
      budget.run(() => {
        throw failure;
      }),
      (error) => error === failure,
    );
    assert.deepEqual(budget.stats(), { slots: 0, reservedBytes: 0 });
  });
  it("fences native transaction loss after each chunk, before queued native work or cleanup", async () => {
    let active = false;
    const events: string[] = [];
    const backend: OwnerBackend = {
      inTransaction: () => active,
      execute: async () => {
        events.push("outside");
        return result([]);
      },
      executeMultiple: async () => {
        events.push("script");
      },
      transaction: async () => {
        events.push("begin");
        active = true;
        let queries = 0;
        return {
          execute: async (): Promise<ResultSet> => {
            events.push(`query:${queries++}`);
            if (queries === 1) return result([["blob", 65539]]);
            active = false;
            return result([[new ArrayBuffer(VERIFY_CHUNK_BYTES)]]);
          },
          executeMultiple: async (): Promise<void> => {
            events.push("lease-script");
          },
          batch: async (): Promise<ResultSet[]> => {
            events.push("batch");
            return [];
          },
          savepoint: async (): Promise<void> => {
            events.push("savepoint");
          },
          commit: async (): Promise<void> => {
            events.push("commit");
            active = false;
          },
          rollback: async (): Promise<void> => {
            events.push("rollback");
            active = false;
          },
        };
      },
      setForeignKeys: async () => {
        events.push("fk");
      },
      foreignKeysEnabled: async () => true,
      close: async () => {
        events.push("close");
      },
    };
    const owner = new ExecutionOwner(backend);
    const lease = await owner.transaction("write");
    const verifying = lease.verifyBlob(plan);
    const queued = assert.rejects(
      owner.execute("SELECT 1"),
      /cannot be reused/,
    );
    await assert.rejects(verifying, /cannot be reused/);
    assert.equal(owner.failed, true);
    await assert.rejects(lease.rollback(), /cannot be reused/);
    await queued;
    await assert.rejects(owner.close(), /cannot be reused/);
    assert.deepEqual(events, ["begin", "query:0", "query:1"]);
  });
  it("quotes hostile identifiers, binds literal keys, handles NULL keys and rejects non-BLOBs", async () => {
    const driver = await create();
    await driver.execute({
      sql: 'CREATE TABLE "读""; COMMIT" ("key""; ROLLBACK" TEXT, "body""; BEGIN" BLOB)',
    });
    const key = "literal_%'); ROLLBACK; --";
    await driver.execute({
      sql: 'INSERT INTO "读""; COMMIT" VALUES (?, zeroblob(0)), (NULL, zeroblob(3)), (\'bad\', NULL)',
      args: [key],
    });
    const quoted: BlobPlan = {
      table: '读"; COMMIT',
      column: 'body"; BEGIN',
      key: [{ column: 'key"; ROLLBACK', value: key }],
      maxBytes: 3,
    };
    assert.deepEqual(await driver.verifyBlob(quoted), {
      sizeBytes: 0,
      sha256: emptyDigest,
    });
    assert.deepEqual(
      await driver.verifyBlob({
        ...quoted,
        key: [{ column: 'key"; ROLLBACK', value: null }],
      }),
      { sizeBytes: 3, sha256: smallDigest },
    );
    await assert.rejects(
      driver.verifyBlob({
        ...quoted,
        key: [{ column: 'key"; ROLLBACK', value: "bad" }],
      }),
      /type or size/,
    );
    await assert.rejects(driver.verifyBlob({ ...quoted, key: [] }));
    await assert.rejects(
      driver.verifyBlob({
        ...plan,
        key: [{ column: "missing", value: "missing" }],
      }),
    );
    await assert.rejects(driver.verifyBlob({ ...plan, column: "missing" }));
    assert.deepEqual(await driver.verifyBlob(plan), {
      sizeBytes: 65539,
      sha256: digest,
    });
  });
  it("never waits for scratch inside a needed lease and drains admitted snapshots on close", async () => {
    const driver = await create();
    const lease = await driver.transaction();
    const first = driver.verifyBlob(plan);
    const second = driver.verifyBlob(plan);
    try {
      await assert.rejects(lease.verifyBlob(plan), /scratch capacity/);
      const closing = driver.close();
      await assert.rejects(driver.verifyBlob(plan), /closing/);
      await lease.rollback();
      for (const facts of await Promise.all([first, second]))
        assert.deepEqual(facts, { sizeBytes: 65539, sha256: digest });
      await closing;
    } finally {
      await lease.rollback();
    }
  });
  it("revalidates size after acquiring a queued snapshot and releases failed-read resources", async () => {
    const driver = await create();
    const lease = await driver.transaction();
    const verifying = assert.rejects(driver.verifyBlob(plan), /type or size/);
    await lease.execute({ sql: "UPDATE blobs SET bytes = zeroblob(3)" });
    await lease.commit();
    await verifying;
    assert.deepEqual(
      await driver.verifyBlob({ ...plan, expectedSize: 3, maxBytes: 3 }),
      { sizeBytes: 3, sha256: smallDigest },
    );
  });
  it("snapshots caller-owned descriptors before waiting for a database lease", async () => {
    const driver = await create();
    const lease = await driver.transaction();
    const descriptor = structuredClone(plan);
    const verifying = driver.verifyBlob(descriptor);
    descriptor.column = "missing";
    const key = descriptor.key[0];
    assert(key);
    key.value = "missing";
    await lease.rollback();
    assert.deepEqual(await verifying, { sizeBytes: 65539, sha256: digest });
  });
  it("guards nested parent and escaped verification facades", async () => {
    const driver = await create();
    let escaped: (() => Promise<unknown>) | undefined;
    await withBinaryTransaction(driver, [], async (context) => {
      escaped = (): Promise<unknown> => context.verifyBlob(plan);
      await context.transaction(async (child) => {
        await assert.rejects(context.verifyBlob(plan), /suspended/);
        assert.equal((await child.verifyBlob(plan)).sha256, digest);
      });
      assert.equal((await context.verifyBlob(plan)).sha256, digest);
    });
    assert(escaped);
    await assert.rejects(escaped(), /closed/);
  });
});
