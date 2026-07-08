#!/usr/bin/env bun
import { migrate } from "drizzle-orm/libsql/migrator";
import { Logger } from "@brains/utils/logger";
import { createRuntimeStateDatabase, enableRuntimeStateWALMode } from "./db";
import type { RuntimeStateDbConfig } from "./types";

export async function migrateRuntimeState(
  config: RuntimeStateDbConfig,
  logger?: Logger,
): Promise<void> {
  const log =
    logger?.child("runtime-state-migrate") ??
    Logger.getInstance().child("runtime-state-migrate");
  const { db, client, url } = createRuntimeStateDatabase(config);

  log.debug("Running runtime state migrations...");

  try {
    await enableRuntimeStateWALMode(client, url);
    const isBundled = import.meta.url.includes("/dist/");
    const migrationsFolder = isBundled
      ? new URL("./migrations/runtime-state", import.meta.url).pathname
      : new URL("../drizzle", import.meta.url).pathname;
    await migrate(db, { migrationsFolder });
    log.debug("Runtime state migrations completed successfully");
  } catch (error) {
    log.error("Runtime state migration failed:", error);
    throw error;
  } finally {
    client.close();
  }
}

if (import.meta.main) {
  console.error("Migration scripts should not be run directly.");
  console.error(
    "Please use your app's migration script instead (e.g. bun run scripts/migrate.ts)",
  );
  process.exit(1);
}
