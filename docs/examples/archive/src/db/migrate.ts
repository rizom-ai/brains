#!/usr/bin/env bun
import { join } from 'path';

import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';

// MCPNoteContext will be imported if needed later

import logger from '../utils/logger';

async function runMigration() {
  logger.info('Running Drizzle migrations...', { context: 'DBMigration' });
  
  try {
    const sqlite = new Database('brain.db');
    const db = drizzle(sqlite);
    
    // Run migrations from the drizzle directory
    await migrate(db, { migrationsFolder: join(import.meta.dir, '../../drizzle') });
    
    logger.info('Database migration completed successfully', { context: 'DBMigration' });
    
    // Note: Embeddings generation removed as embeddings are now required for all notes
    logger.info('Embeddings are now required for all notes in the schema', { context: 'DBMigration' });
  } catch (error) {
    logger.error('Error running database migration:', { error, context: 'DBMigration' });
    process.exit(1);
  }
}

runMigration();