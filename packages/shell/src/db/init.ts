import type { Database } from "bun:sqlite";

/**
 * Initialize database schema
 */
export function initDatabase(db: Database): void {
  // Create entities table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT,
      metadata TEXT NOT NULL,
      created INTEGER NOT NULL,
      updated INTEGER NOT NULL
    )
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);
    CREATE INDEX IF NOT EXISTS idx_entities_updated ON entities(updated);
    CREATE INDEX IF NOT EXISTS idx_entities_category ON entities(category);
  `);
}