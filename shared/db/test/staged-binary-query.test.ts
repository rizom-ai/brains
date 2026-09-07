import { describe, expect, it } from "bun:test";
import { is, Placeholder, sql } from "drizzle-orm";
import { blob, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { drizzle } from "drizzle-orm/sqlite-proxy";

// Compilation-only feasibility check for the proposed explicit binding path.
// No native client, staged store or transaction bridge is implemented here.
const binaryRows = sqliteTable("binary_binding_proof", {
  id: text("id").primaryKey(),
  bytes: blob("bytes", { mode: "buffer" }).notNull(),
  sizeBytes: integer("size_bytes").notNull(),
});

function compilationDatabase(): ReturnType<typeof drizzle> {
  return drizzle(async () => {
    throw new Error("Compilation proof must not execute SQL");
  });
}

describe("staged binary public query compilation", () => {
  it("preserves an explicit placeholder without encoding a capability as a Buffer", () => {
    const db = compilationDatabase();
    const query = db
      .insert(binaryRows)
      .values({
        // A scalar that happens to equal the placeholder name stays a scalar.
        id: "payload",
        bytes: sql`${sql.placeholder("payload")}`,
        sizeBytes: 3,
      })
      .onConflictDoNothing({ target: binaryRows.id })
      .returning({ id: binaryRows.id })
      .toSQL();

    expect(query.sql).toContain("values (?, ?, ?)");
    expect(query.sql).not.toContain("payload");
    expect(query.params).toHaveLength(3);
    expect(query.params[0]).toBe("payload");
    const parameter: unknown = query.params[1];
    expect(is(parameter, Placeholder)).toBe(true);
    if (!is(parameter, Placeholder))
      throw new Error("Expected a public Drizzle placeholder");
    expect(parameter.name).toBe("payload");
    expect(query.params[2]).toBe(3);
    expect(
      query.params.some(
        (value: unknown) =>
          value instanceof Uint8Array || value instanceof ArrayBuffer,
      ),
    ).toBe(false);
  });

  it("leaves ordinary BLOB values on the existing compilation path", () => {
    const bytes = Buffer.from([0, 128, 255]);
    const query = compilationDatabase()
      .insert(binaryRows)
      .values({
        id: "ordinary",
        bytes,
        sizeBytes: bytes.byteLength,
      })
      .toSQL();
    expect(query.params[1]).toBe(bytes);
    expect(query.params.some((value: unknown) => is(value, Placeholder))).toBe(
      false,
    );
  });
});
