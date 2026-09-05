import { migrate } from "drizzle-orm/libsql/migrator";
import { ConsoleLogger, type Logger } from "@brains/utils/logger";
import { applySqlitePragmas, createSqliteDatabase } from "./sqlite";
import { closeSqliteClient } from "./turso-client";

export interface PackageMigrationOptions {
  /** Human label used for log context, e.g. "job-queue". */
  label: string;
  /** Database connection config. */
  config: {
    url: string;
  };
  /** Drizzle schema tables for this database. */
  schema: Record<string, unknown>;
  /** Absolute path to the drizzle migrations folder. */
  migrationsFolder: string;
  logger?: Logger | undefined;
}

/**
 * Run a package's drizzle migrations: connect, apply concurrency pragmas,
 * migrate, and always close the client.
 */
export async function runPackageMigrations(
  options: PackageMigrationOptions,
): Promise<void> {
  const { label, config, schema, migrationsFolder } = options;
  const context = `${label}-migrate`;
  const log =
    options.logger?.child(context) ??
    ConsoleLogger.getInstance().child(context);

  const { db, client, url } = createSqliteDatabase({
    url: config.url,
    schema,
  });

  log.debug(`Running ${label} migrations...`);

  try {
    // Establish the runtime journal mode before applying migrations.
    await applySqlitePragmas(client, url);
    await migrate(db, { migrationsFolder });

    log.debug(`${label} migrations completed successfully`);
  } catch (error) {
    log.error(`${label} migration failed:`, error);
    throw error;
  } finally {
    await closeSqliteClient(client);
  }
}

/**
 * Resolve a package's migrations folder, accounting for bundled dist builds
 * where migrations are copied next to the bundle.
 */
export function resolveMigrationsFolder(
  moduleUrl: string,
  bundledSubpath: string,
): string {
  const isBundled = moduleUrl.includes("/dist/");
  return isBundled
    ? new URL(`./migrations/${bundledSubpath}`, moduleUrl).pathname
    : new URL("../drizzle", moduleUrl).pathname;
}

/**
 * Guard for the migrate entrypoints: migrations run from app contexts, never
 * by executing a package's migrate module directly.
 */
export function refuseDirectMigrationRun(): never {
  console.error("Migration scripts should not be run directly.");
  console.error(
    "Please use your app's migration script instead (e.g., bun run scripts/migrate.ts)",
  );
  process.exit(1);
}
