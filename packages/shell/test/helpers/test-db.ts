import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

/**
 * Create a temporary test database
 * Each test gets its own isolated database
 */
import type { LibSQLDatabase } from "drizzle-orm/libsql";

export async function createTestDatabase(): Promise<{
  db: LibSQLDatabase<Record<string, never>>;
  client: ReturnType<typeof createClient>;
  cleanup: () => Promise<void>;
  dbPath: string;
}> {
  // Create a unique temporary directory
  const tempDir = await mkdtemp(join(tmpdir(), "brain-test-"));
  const dbPath = join(tempDir, "test.db");

  // Create libSQL client
  const client = createClient({
    url: `file:${dbPath}`,
  });

  // Create Drizzle instance
  const db = drizzle(client);

  // Run migrations from @brains/db package
  const { runMigrations } = await import("@brains/db");
  await runMigrations(db);

  // Cleanup function
  const cleanup = async (): Promise<void> => {
    client.close();
    await rm(tempDir, { recursive: true, force: true });
  };

  return { db, client, cleanup, dbPath };
}

/**
 * Create a test database with seed data
 */
export async function createSeededTestDatabase(): Promise<{
  db: LibSQLDatabase<Record<string, never>>;
  client: ReturnType<typeof createClient>;
  cleanup: () => Promise<void>;
  dbPath: string;
}> {
  const { db, client, cleanup, dbPath } = await createTestDatabase();

  // Add seed data here if needed
  // await db.insert(entities).values([...]);

  return { db, client, cleanup, dbPath };
}
