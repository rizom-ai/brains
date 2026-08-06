import { Database } from "bun:sqlite";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { z } from "@brains/utils/zod";
import type {
  BinaryAssetMigrationRepository,
  BinaryEntityIdentifier,
  BinaryEntityRow,
  BinaryEntityUpdate,
} from "./binary-asset-migration";

export interface SqliteBinaryAssetMigrationRepositoryOptions {
  databaseUrl: string;
  workingDirectory?: string | undefined;
}

interface StoredFtsEntity {
  id: string;
  entityType: string;
}

interface StoredBinaryEntityRow {
  id: string;
  entityType: string;
  content: string;
  contentHash: string;
  visibility: string;
  metadata: string;
  created: number;
  updated: number;
}

const metadataSchema = z.record(z.string(), z.unknown());

export class SqliteBinaryAssetMigrationRepository implements BinaryAssetMigrationRepository {
  private readonly databasePath: string;

  constructor(options: SqliteBinaryAssetMigrationRepositoryOptions) {
    this.databasePath = resolveLocalSqlitePath(
      options.databaseUrl,
      options.workingDirectory ?? process.cwd(),
    );
  }

  async probeExclusiveLock(): Promise<void> {
    const database = this.openDatabase();
    try {
      database.exec("PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE; ROLLBACK;");
    } catch (error) {
      throw new Error(
        "Could not acquire an exclusive SQLite lock. Stop the brain application and every worker before continuing.",
        { cause: error },
      );
    } finally {
      database.close(false);
    }
  }

  async listRows(entityType: string): Promise<BinaryEntityRow[]> {
    const database = this.openDatabase();
    try {
      const rows = database
        .query<StoredBinaryEntityRow, [string]>(
          `SELECT id, entityType, content, contentHash, visibility,
                  metadata, created, updated
             FROM entities
            WHERE entityType = ?
            ORDER BY id`,
        )
        .all(entityType);
      return rows.map(normalizeStoredRow);
    } finally {
      database.close(false);
    }
  }

  async listFtsEntities(entityType: string): Promise<BinaryEntityIdentifier[]> {
    const database = this.openDatabase();
    try {
      return database
        .query<StoredFtsEntity, [string]>(
          `SELECT entity_id AS id, entity_type AS entityType
             FROM entity_fts
            WHERE entity_type = ?
            ORDER BY entity_id`,
        )
        .all(entityType);
    } finally {
      database.close(false);
    }
  }

  async applyUpdates(
    updates: BinaryEntityUpdate[],
    ftsEntities: BinaryEntityIdentifier[],
  ): Promise<void> {
    const database = this.openDatabase();
    let transactionOpen = false;
    try {
      database.exec("PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE;");
      transactionOpen = true;
      const updateStatement = database.query<
        never,
        [string, string, string, string, string, string]
      >(
        `UPDATE entities
            SET content = ?, contentHash = ?, metadata = ?
          WHERE id = ? AND entityType = ? AND contentHash = ?`,
      );
      const deleteFtsStatement = database.query<never, [string, string]>(
        "DELETE FROM entity_fts WHERE entity_id = ? AND entity_type = ?",
      );

      for (const update of updates) {
        const result = updateStatement.run(
          update.content,
          update.contentHash,
          JSON.stringify(update.metadata),
          update.id,
          update.entityType,
          update.expectedContentHash,
        );
        if (result.changes !== 1) {
          throw new Error(
            `Image ${update.id} changed after migration analysis; no entity rows were migrated`,
          );
        }
      }

      for (const entity of ftsEntities) {
        deleteFtsStatement.run(entity.id, entity.entityType);
      }

      database.exec("COMMIT");
      transactionOpen = false;
      database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    } catch (error) {
      if (transactionOpen) database.exec("ROLLBACK");
      throw error;
    } finally {
      database.close(false);
    }
  }

  private openDatabase(): Database {
    return new Database(this.databasePath, { create: false, strict: true });
  }
}

export function resolveLocalSqlitePath(
  databaseUrl: string,
  workingDirectory: string,
): string {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error(
      "Binary asset migration currently supports only a local file: SQLite database URL",
    );
  }

  if (databaseUrl.startsWith("file://")) {
    return fileURLToPath(databaseUrl);
  }

  const path = decodeURIComponent(
    databaseUrl.slice("file:".length).split(/[?#]/, 1)[0] ?? "",
  );
  if (path.trim() === "") {
    throw new Error("The local file: SQLite database path must not be empty");
  }
  return resolve(workingDirectory, path);
}

function normalizeStoredRow(row: StoredBinaryEntityRow): BinaryEntityRow {
  let metadataValue: unknown;
  try {
    metadataValue = JSON.parse(row.metadata);
  } catch (error) {
    throw new Error(`Image ${row.id} has invalid JSON metadata`, {
      cause: error,
    });
  }

  return {
    id: row.id,
    entityType: row.entityType,
    content: row.content,
    contentHash: row.contentHash,
    visibility: row.visibility,
    metadata: metadataSchema.parse(metadataValue),
    created: row.created,
    updated: row.updated,
  };
}
