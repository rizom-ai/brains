import type { Client } from "@libsql/client";
import {
  createSqliteDatabase,
  type SqliteConnection,
  type SqliteDatabase,
} from "@brains/db";
import { embeddings } from "../schema/embeddings";
import type { DbConfig as EntityDbConfig } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import type { EmbeddingIdentity } from "../embedding-types";

export type EmbeddingDB = SqliteDatabase;

/**
 * Create an embedding database connection.
 * This is a separate database from the entity database,
 * containing only the embeddings table.
 */
export function createEmbeddingDatabase(
  config: EntityDbConfig,
): SqliteConnection {
  return createSqliteDatabase({
    url: config.url,
    schema: { embeddings },
    authToken: config.authToken,
    authTokenEnv: "DATABASE_AUTH_TOKEN",
  });
}

/** Rows written before the index recorded its identity came from this model. */
const LEGACY_IDENTITY: EmbeddingIdentity = {
  model: "openai:text-embedding-3-small",
  dimensions: 1536,
  promptRevision: 0,
};

const metaRowSchema = z.object({
  model: z.string(),
  dimensions: z.number(),
  prompt_revision: z.number(),
});

export type EmbeddingMigration =
  { rebuilt: false } | { rebuilt: true; previous: EmbeddingIdentity };

async function storedIdentity(
  client: Pick<Client, "execute">,
): Promise<EmbeddingIdentity | undefined> {
  const meta = await client.execute(
    "SELECT model, dimensions, prompt_revision FROM embedding_meta WHERE id = 1",
  );
  const [row] = meta.rows;
  if (row) {
    const stored = metaRowSchema.parse(row);
    return {
      model: stored.model,
      dimensions: stored.dimensions,
      promptRevision: stored.prompt_revision,
    };
  }
  const table = await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'embeddings'",
  );
  return table.rows.length > 0 ? LEGACY_IDENTITY : undefined;
}

function sameIdentity(a: EmbeddingIdentity, b: EmbeddingIdentity): boolean {
  return (
    a.model === b.model &&
    a.dimensions === b.dimensions &&
    a.promptRevision === b.promptRevision
  );
}

/**
 * Create the embeddings table for the provider's identity. Vectors of another
 * model, size or prompt revision cannot be compared with its queries, so a
 * changed identity drops them; the boot backfill re-embeds every entity.
 */
export async function migrateEmbeddingDatabase(
  client: Client,
  identity: EmbeddingIdentity,
): Promise<EmbeddingMigration> {
  // One write transaction, so the brain's processes migrating at once agree:
  // the first rebuilds, the rest see its identity and keep what it embedded.
  const transaction = await client.transaction("write");
  try {
    await transaction.execute(`
      CREATE TABLE IF NOT EXISTS embedding_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        model TEXT NOT NULL,
        dimensions INTEGER NOT NULL,
        prompt_revision INTEGER NOT NULL
      )
    `);
    const previous = await storedIdentity(transaction);
    const changed =
      previous !== undefined && !sameIdentity(previous, identity)
        ? previous
        : undefined;

    await transaction.batch([
      ...(changed ? ["DROP TABLE embeddings"] : []),
      `CREATE TABLE IF NOT EXISTS embeddings (
        entity_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        embedding F32_BLOB(${identity.dimensions}) NOT NULL,
        content_hash TEXT NOT NULL,
        PRIMARY KEY(entity_id, entity_type)
      )`,
      {
        sql: `INSERT INTO embedding_meta (id, model, dimensions, prompt_revision)
          VALUES (1, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            model = excluded.model,
            dimensions = excluded.dimensions,
            prompt_revision = excluded.prompt_revision`,
        args: [identity.model, identity.dimensions, identity.promptRevision],
      },
      // Searches use vector_distance_cos, never vector_top_k. Retire the
      // unused ANN index on existing files before any rows are rewritten.
      "DROP INDEX IF EXISTS embeddings_embedding_idx",
      "UPDATE embeddings SET entity_type = 'note' WHERE entity_type = 'base'",
    ]);
    await transaction.commit();
    return changed ? { rebuilt: true, previous: changed } : { rebuilt: false };
  } finally {
    transaction.close();
  }
}

/**
 * Attach the embedding database to an entity database client.
 * This enables cross-database joins for search queries.
 *
 * @param entityClient - The libsql client connected to the entity database
 * @param embeddingDbPath - File path (without file: prefix) to the embedding database
 */
export async function attachEmbeddingDatabase(
  entityClient: Client,
  embeddingDbPath: string,
): Promise<void> {
  await entityClient.execute(`ATTACH DATABASE '${embeddingDbPath}' AS emb`);
}

/**
 * Extract the file path from a database URL.
 * Strips the "file:" prefix.
 */
export function dbUrlToPath(url: string): string {
  return url.startsWith("file:") ? url.slice(5) : url;
}
