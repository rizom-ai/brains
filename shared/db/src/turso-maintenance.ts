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
  const inMemory = path === ":memory:";
  const { connect } = await import("@tursodatabase/database");

  // Drop with the same WAL coordination used by the runtime, then close that
  // connection before vacuuming. Turso 0.7 can leak a page when removing a
  // native FTS index; stock SQLite reports that page as corruption. VACUUM
  // repairs it, but Turso rejects VACUUM while multiprocess WAL is enabled.
  const cleanup = await connect(path, {
    experimental: inMemory
      ? ["index_method", "vacuum"]
      : ["index_method", "multiprocess_wal"],
  });
  try {
    await cleanup.exec(`DROP INDEX IF EXISTS ${indexName}`);
    if (inMemory) await cleanup.exec("VACUUM");
    const checkpoint = await cleanup.prepare("PRAGMA wal_checkpoint(TRUNCATE)");
    await checkpoint.all();
  } finally {
    await cleanup.close();
  }

  if (inMemory) return;

  const vacuum = await connect(path, {
    experimental: ["index_method", "vacuum"],
  });
  try {
    await vacuum.exec("VACUUM");
    const checkpoint = await vacuum.prepare("PRAGMA wal_checkpoint(TRUNCATE)");
    await checkpoint.all();
  } finally {
    await vacuum.close();
  }
}
