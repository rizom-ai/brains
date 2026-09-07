import { afterEach, describe, expect, it } from "bun:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { TursoThreadProof } from "./fixtures/turso-thread/client";
import { closeSqliteClient } from "../src/turso-client";
import { ProofLibsqlClient } from "./fixtures/turso-thread/libsql-client";
import { withBinaryTransaction } from "./fixtures/turso-thread/binary-transaction";

const workerUrl = new URL("./fixtures/turso-thread/worker.ts", import.meta.url);
const drivers: TursoThreadProof[] = [];
const items = sqliteTable("items", {
  id: integer("id").primaryKey(),
  label: text("label").notNull(),
});
async function setup(): Promise<{
  driver: TursoThreadProof;
  client: ProofLibsqlClient;
}> {
  const driver = new TursoThreadProof({ url: "file::memory:", workerUrl });
  drivers.push(driver);
  const client = new ProofLibsqlClient(driver);
  await client.executeMultiple(
    "CREATE TABLE items (id INTEGER PRIMARY KEY, label TEXT NOT NULL);",
  );
  return { driver, client };
}
afterEach(async () => {
  await Promise.all(drivers.splice(0).map((driver) => driver.close()));
});

describe("actual LibSQLSession worker proof", () => {
  it("preserves script parsing, partial failures and transaction-local batch semantics", async () => {
    const { client } = await setup();
    await assert.rejects(
      client.executeMultiple(
        "INSERT INTO items VALUES (1, 'semi;colon'); INSERT INTO absent VALUES (1); INSERT INTO items VALUES (2, 'unreached');",
      ),
    );
    expect((await client.execute("SELECT label FROM items")).rows[0]?.[0]).toBe(
      "semi;colon",
    );
    const transaction = await client.transaction();
    try {
      await assert.rejects(
        transaction.batch([
          "INSERT INTO items VALUES (3, 'partial')",
          "INSERT INTO absent VALUES (1)",
        ]),
      );
      expect(
        (await transaction.execute("SELECT count(*) AS count FROM items"))
          .rows[0]?.[0],
      ).toBe(2);
      await transaction.executeMultiple(
        "INSERT INTO items VALUES (4, 'four'); INSERT INTO items VALUES (5, 'five');",
      );
    } finally {
      await transaction.closeAsync();
    }
    expect(
      (await client.execute("SELECT count(*) FROM items")).rows[0]?.[0],
    ).toBe(1);
    await assert.rejects(transaction.executeMultiple("SELECT 1"), /closed/);
  });

  it("restores foreign-key enforcement after successful and failed migrations", async () => {
    const { client } = await setup();
    await client.executeMultiple(
      "PRAGMA foreign_keys = ON; CREATE TABLE parents (id INTEGER PRIMARY KEY); CREATE TABLE children (id INTEGER PRIMARY KEY, parent INTEGER REFERENCES parents(id));",
    );
    await client.migrate(["INSERT INTO children VALUES (1, 99)"]);
    expect((await client.execute("PRAGMA foreign_keys")).rows[0]?.[0]).toBe(1);
    await assert.rejects(client.execute("INSERT INTO children VALUES (2, 99)"));
    await assert.rejects(
      client.migrate([
        "INSERT INTO parents VALUES (99)",
        "INSERT INTO absent VALUES (1)",
      ]),
    );
    expect(
      (await client.execute("SELECT count(*) FROM parents")).rows[0]?.[0],
    ).toBe(0);
    expect((await client.execute("PRAGMA foreign_keys")).rows[0]?.[0]).toBe(1);
    await client.execute("DELETE FROM children");
  });

  it("bounds batch admission and labels unavailable post-execution results as uncertain", async () => {
    const { client } = await setup();
    await assert.rejects(
      client.batch(
        Array.from(
          { length: 17 },
          () => "INSERT INTO items VALUES (1, 'not admitted')",
        ),
      ),
      /statement limit/,
    );
    expect(
      (await client.execute("SELECT count(*) FROM items")).rows[0]?.[0],
    ).toBe(0);
    await assert.rejects(
      client.batch([
        "INSERT INTO items VALUES (9, 'committed before encoding')",
        "SELECT hex(zeroblob(17000)) AS value",
        "SELECT hex(zeroblob(17000)) AS value",
      ]),
      (error: unknown) => {
        assert.ok(error instanceof Error && "code" in error);
        assert.equal(error.code, "RESULT_UNAVAILABLE");
        assert.match(error.message, /may have committed/);
        return true;
      },
    );
    expect((await client.execute("SELECT id FROM items")).rows[0]?.[0]).toBe(9);
  });

  it("joins void close with durable async close and rejects replica/reconnect operations", async () => {
    const { client } = await setup();
    const transaction = await client.transaction();
    await transaction.execute(
      "INSERT INTO items VALUES (1, 'rolled back by close')",
    );
    transaction.close();
    await transaction.closeAsync();
    expect(transaction.closed).toBe(true);
    expect(
      (await client.execute("SELECT count(*) FROM items")).rows[0]?.[0],
    ).toBe(0);
    await assert.rejects(client.sync(), /not supported/);
    expect(() => client.reconnect()).toThrow("not supported");
    client.close();
    expect(client.closed).toBe(true);
    await closeSqliteClient(client);
    await assert.rejects(client.execute("SELECT 1"), /closed|closing/);
  });

  it("invalidates escaped nested facades while allowing the outer transaction to continue", async () => {
    const { driver, client } = await setup();
    await withBinaryTransaction(driver, [], async (outer) => {
      const escaped = await outer.transaction(async (child) => {
        await child.db.insert(items).values({ id: 1, label: "child" });
        return child;
      });
      await assert.rejects(
        async () => escaped.db.select().from(items),
        /Failed query|closed/i,
      );
      await assert.rejects(
        escaped.executeBound(escaped.db.select().from(items), new Map()),
        /closed/,
      );
      const ordinaryEscaped = await outer.db.transaction(async (child) => {
        await child.insert(items).values({ id: 2, label: "ordinary child" });
        return child;
      });
      await assert.rejects(
        async () => ordinaryEscaped.select().from(items),
        /Failed query|closed/i,
      );
      await outer.db.insert(items).values({ id: 3, label: "parent resumed" });
    });
    expect(
      (await client.execute("SELECT count(*) FROM items")).rows[0]?.[0],
    ).toBe(3);
  });

  it("suspends parent work and rejects overlapping sibling savepoints deterministically", async () => {
    const { driver } = await setup();
    await withBinaryTransaction(driver, [], async (outer) => {
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const child = outer.transaction(async (inner) => {
        entered.resolve();
        await release.promise;
        await inner.db.insert(items).values({ id: 1, label: "child" });
      });
      try {
        await entered.promise;
        await assert.rejects(
          async () => outer.db.select().from(items),
          /Failed query|suspended/i,
        );
        await assert.rejects(
          outer.executeBound(outer.db.select().from(items), new Map()),
          /suspended/,
        );
        await assert.rejects(
          outer.transaction(async () => undefined),
          /suspended/,
        );
        await assert.rejects(
          outer.db.transaction(async () => undefined),
          /suspended/,
        );
      } finally {
        release.resolve();
        await child;
      }
      expect((await outer.db.select().from(items)).length).toBe(1);
    });
  });

  it("drains an admitted child callback before outer rollback", async () => {
    const { driver, client } = await setup();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let child: Promise<void> | undefined;
    const operation = withBinaryTransaction(driver, [], async (outer) => {
      child = outer.transaction(async (inner) => {
        entered.resolve();
        await release.promise;
        await inner.db.insert(items).values({ id: 1, label: "must roll back" });
      });
      throw new Error("outer body failed");
    });
    const rejected = assert.rejects(operation, /outer body failed/);
    try {
      await entered.promise;
    } finally {
      release.resolve();
    }
    await child;
    await rejected;
    expect(
      (await client.execute("SELECT count(*) FROM items")).rows[0]?.[0],
    ).toBe(0);
  });

  it("rolls back nested ordinary writes without closing the outer native lease", async () => {
    const { driver, client } = await setup();
    await withBinaryTransaction(driver, [], async (outer) => {
      await outer.db.insert(items).values({ id: 1, label: "outer" });
      await assert.rejects(
        outer.transaction(async (inner) => {
          await inner.db.insert(items).values({ id: 2, label: "inner" });
          await inner.transaction(async (deep) => {
            await deep.db.run(sql`INSERT INTO items VALUES (3, 'deep')`);
          });
          throw new Error("nested rollback");
        }),
        /nested rollback/,
      );
      await outer.db.insert(items).values({ id: 4, label: "outer continued" });
    });
    expect(
      (await client.execute("SELECT id FROM items ORDER BY id")).rows.map(
        (row) => row[0],
      ),
    ).toEqual([1, 4]);
  });
});
