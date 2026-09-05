import type { Client, InValue } from "@libsql/client";

const PAGE_SIZE = 200;

export function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export interface TableEvidence {
  name: string;
  columns: string[];
  keys: string[];
  count: number;
  sha256: string;
}

/** Stream file hashing; backups can be much larger than memory. */
export async function fileSha256(path: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  for await (const chunk of Bun.file(path).stream()) hasher.update(chunk);
  return hasher.digest("hex");
}

function encodeValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "bigint")
    return `number:${String(value)}`;
  if (typeof value === "string") return `text:${JSON.stringify(value)}`;
  if (value instanceof ArrayBuffer)
    return `blob:${Buffer.from(value).toString("hex")}`;
  if (ArrayBuffer.isView(value))
    return `blob:${Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("hex")}`;
  throw new Error("Unsupported database value during verification");
}

function cursorValue(value: unknown): InValue {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint"
  )
    return value;
  throw new Error(
    "Migration verification requires non-null scalar primary keys",
  );
}

/** Digest the original columns in primary-key order, with bounded keyset pages. */
export async function digestTable(
  client: Client,
  table: Pick<TableEvidence, "name" | "columns" | "keys">,
): Promise<TableEvidence> {
  const names = table.columns.map(quoteIdentifier).join(", ");
  const keys = table.keys.map(quoteIdentifier);
  const firstKey = keys[0];
  if (!firstKey) throw new Error(`Cannot verify unkeyed table ${table.name}`);
  let after: InValue[] | undefined;
  let count = 0;
  const hasher = new Bun.CryptoHasher("sha256");
  for (;;) {
    // The leading scalar bound makes Turso seek; a tuple-only predicate scans.
    const predicate =
      keys.length === 1
        ? `${firstKey} > ?`
        : `${firstKey} >= ? AND (${keys.join(", ")}) > (${keys.map(() => "?").join(", ")})`;
    const args: InValue[] = after
      ? keys.length === 1
        ? after
        : [cursorValue(after[0]), ...after]
      : [];
    const result = await client.execute({
      sql: `SELECT ${names} FROM ${quoteIdentifier(table.name)} ${after ? `WHERE ${predicate}` : ""} ORDER BY ${keys.join(", ")} LIMIT ${PAGE_SIZE}`,
      args,
    });
    for (const row of result.rows) {
      hasher.update(
        JSON.stringify(table.columns.map((column) => encodeValue(row[column]))),
      );
      hasher.update("\n");
      count++;
    }
    const last = result.rows.at(-1);
    if (!last || result.rows.length < PAGE_SIZE) break;
    after = table.keys.map((key) => cursorValue(last[key]));
  }
  return { ...table, count, sha256: hasher.digest("hex") };
}

export async function durableTableEvidence(
  client: Client,
  entityDatabase: boolean,
): Promise<TableEvidence[]> {
  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  );
  const evidence: TableEvidence[] = [];
  for (const row of tables.rows) {
    const name = String(row["name"]);
    // These are migration bookkeeping or derived entity indexes, not user state.
    if (name.startsWith("sqlite_") || name === "__drizzle_migrations") continue;
    if (
      entityDatabase &&
      (name === "embeddings" ||
        name === "entity_fts" ||
        name.startsWith("entity_fts_"))
    )
      continue;
    const info = await client.execute(
      `PRAGMA table_info(${quoteIdentifier(name)})`,
    );
    const columns = info.rows.map((column) => String(column["name"]));
    const keys = info.rows
      .filter((column) => Number(column["pk"]) > 0)
      .sort((a, b) => Number(a["pk"]) - Number(b["pk"]))
      .map((column) => String(column["name"]));
    evidence.push(await digestTable(client, { name, columns, keys }));
  }
  return evidence;
}

export async function checkIntegrity(client: Client): Promise<void> {
  const result = await client.execute("PRAGMA integrity_check");
  if (
    result.rows.length !== 1 ||
    Object.values(result.rows[0] ?? {})[0] !== "ok"
  ) {
    throw new Error("Database integrity check failed");
  }
  const foreignKeys = await client.execute("PRAGMA foreign_key_check");
  if (foreignKeys.rows.length !== 0)
    throw new Error("Database foreign-key check failed");
}
