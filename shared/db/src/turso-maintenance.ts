const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Drop a Turso-specific index and checkpoint its schema change so another
 * SQLite engine can safely open the file afterward.
 */
export async function dropTursoIndexForFallback(
  url: string,
  indexName: string,
): Promise<void> {
  if (!url.startsWith("file:")) {
    throw new Error("Turso index cleanup only supports file: urls");
  }
  if (!SAFE_IDENTIFIER.test(indexName)) {
    throw new Error(`Unsafe SQLite index name: ${indexName}`);
  }

  const path = url.slice("file:".length);
  const experimental: ("index_method" | "multiprocess_wal")[] =
    path === ":memory:"
      ? ["index_method"]
      : ["index_method", "multiprocess_wal"];
  const { connect } = await import("@tursodatabase/database");
  const database = await connect(path, { experimental });

  try {
    await database.exec(`DROP INDEX IF EXISTS ${indexName}`);
    const checkpoint = await database.prepare(
      "PRAGMA wal_checkpoint(TRUNCATE)",
    );
    await checkpoint.all();
  } finally {
    await database.close();
  }
}
