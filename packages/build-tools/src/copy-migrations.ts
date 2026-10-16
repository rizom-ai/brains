import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

export interface MigrationSource {
  /** Directory name under the migrations output, e.g. `entity-service`. */
  name: string;
  /** The package's drizzle folder. */
  path: string;
}

/**
 * Replace `migrationsDir` with the current migrations of each source that
 * exists, returning the names copied. The directory is cleared first: a
 * migration renamed or removed since the last build must not ship in a pack.
 */
export function copyMigrations(
  sources: readonly MigrationSource[],
  migrationsDir: string,
): string[] {
  rmSync(migrationsDir, { recursive: true, force: true });
  mkdirSync(migrationsDir, { recursive: true });
  return sources
    .filter(({ path }) => existsSync(path))
    .map(({ name, path }) => {
      cpSync(path, join(migrationsDir, name), { recursive: true });
      return name;
    });
}
