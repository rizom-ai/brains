import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

/**
 * Create a temporary test database
 * Each test gets its own isolated database
 */
export async function createTestDatabase() {
  // Create a unique temporary directory
  const tempDir = await mkdtemp(join(tmpdir(), "brain-test-"));
  const dbPath = join(tempDir, "test.db");

  // Create libSQL client
  const client = createClient({
    url: `file:${dbPath}`,
  });

  // Create Drizzle instance
  const db = drizzle(client);

  // Run migrations
  await migrate(db, {
    migrationsFolder: join(process.cwd(), "packages/shell/drizzle"),
  });

  // Cleanup function
  const cleanup = async () => {
    client.close();
    await rm(tempDir, { recursive: true, force: true });
  };

  return { db, client, cleanup, dbPath };
}

/**
 * Create a test database with seed data
 */
export async function createSeededTestDatabase() {
  const { db, client, cleanup, dbPath } = await createTestDatabase();

  // Add seed data here if needed
  // await db.insert(entities).values([...]);

  return { db, client, cleanup, dbPath };
}
