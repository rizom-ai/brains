import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { InValue } from "@libsql/client";
import type { SQL } from "drizzle-orm";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { createEntityDatabase, ensureFtsTable, type EntityDB } from "../src/db";
import { deleteEntityFts, insertEntityFts } from "../src/entity-fts";
import {
  createTestEntityDatabase,
  type TestEntityDatabase,
} from "./helpers/test-entity-db";

/** A compiled statement's parameter, as SQLite takes it. */
function toSqlArg(value: unknown): InValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  throw new Error(`Unexpected statement parameter: ${String(value)}`);
}

describe("entity full-text rows", () => {
  let database: TestEntityDatabase;
  let connection: ReturnType<typeof createEntityDatabase>;
  let db: EntityDB;

  beforeEach(async () => {
    database = await createTestEntityDatabase();
    connection = createEntityDatabase(database.config);
    db = connection.db;
  });

  afterEach(async () => {
    connection.client.close();
    await database.cleanup();
  });

  const ids = async (): Promise<string[]> =>
    (
      await connection.client.execute(
        "SELECT entity_id FROM entity_fts ORDER BY entity_id",
      )
    ).rows.map((row) => String(row["entity_id"]));

  it("deletes one entity's row and keeps the others", async () => {
    await insertEntityFts(db, "book-section", "one", "erste Seite");
    await insertEntityFts(db, "book-section", "two", "zweite Seite");
    await insertEntityFts(db, "book", "one", "ein Buch");

    await deleteEntityFts(db, "book-section", "one");

    expect(await ids()).toEqual(["one", "two"]);
    const search = await connection.client.execute(
      "SELECT entity_id, entity_type FROM entity_fts WHERE entity_fts MATCH 'Seite'",
    );
    expect(search.rows.map((row) => String(row["entity_id"]))).toEqual(["two"]);
  });

  it("finds an entity's row by its rowid, never by reading the whole index", async () => {
    const statements: SQL[] = [];
    const recording = {
      run: (statement: SQL): ReturnType<EntityDB["run"]> => {
        statements.push(statement);
        return db.run(statement);
      },
    };
    await insertEntityFts(db, "book-section", "one", "erste Seite");

    await deleteEntityFts(recording, "book-section", "one");

    const dialect = new SQLiteSyncDialect();
    const deletes = statements
      .map((statement) => dialect.sqlToQuery(statement))
      .filter((query) => /DELETE FROM entity_fts\b/u.test(query.sql));
    expect(deletes.length).toBeGreaterThan(0);
    const plans = await Promise.all(
      deletes.map(async (query) =>
        (
          await connection.client.execute({
            sql: `EXPLAIN QUERY PLAN ${query.sql}`,
            args: query.params.map(toSqlArg),
          })
        ).rows.map((row) => String(row["detail"])),
      ),
    );
    for (const plan of plans) {
      expect(plan[0]).toBe("SCAN entity_fts VIRTUAL TABLE INDEX 0:=");
    }
  });

  it("maps rows written without a mapping on start, dropping an entity's duplicates", async () => {
    await connection.client.execute(
      "INSERT INTO entity_fts (entity_id, entity_type, content) VALUES ('old', 'note', 'first'), ('old', 'note', 'second'), ('kept', 'note', 'third')",
    );

    await ensureFtsTable(connection.client);
    await deleteEntityFts(db, "note", "old");

    expect(await ids()).toEqual(["kept"]);
  });
});
