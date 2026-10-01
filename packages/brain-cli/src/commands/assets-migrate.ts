import { stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { resolveStandardPaths } from "@brains/app";
import { openOfflineEntityDatabase } from "@brains/entity-service";
import type { InlineImageBlocker } from "@brains/image";
import { getErrorMessage } from "@brains/utils/error";
import type { CommandResult } from "../lib/command-result";
import { findDatabaseHolders } from "../lib/database-holders";
import {
  planImageAssetMigration,
  type ImageAssetMigrationPlan,
} from "../lib/binary-asset-migration-plan";

export interface AssetsMigrateOptions {
  /** Entity database path or `file:` URL; defaults to the app's data dir. */
  database?: string | undefined;
  dryRun?: boolean | undefined;
}

export interface AssetsMigrateDeps {
  findHolders(databasePath: string): Promise<number[] | undefined>;
}

const REMOTE_URL = /^(?:libsql|wss?|https?):/i;

/** How an operator resolves each kind of blocked image. */
const BLOCKER_HINTS: Record<InlineImageBlocker, string> = {
  svg: "SVG cannot become an image asset; replace it with a PNG, JPEG, GIF or WebP, or delete it",
  malformed:
    "the row is not a valid base64 image data URL; restore the image from its source file",
  "double-encoded":
    "an earlier export decoded the whole data URL and the row lost bytes; restore the image from its source file",
  unsupported:
    "the bytes are not a PNG, JPEG, GIF or WebP; convert or delete the image",
  oversized: "the image is above the asset write cap; shrink it or delete it",
};

/**
 * Move inline images into durable assets, offline: the app must be stopped
 * and the entity database local. A dry-run decodes every inline image
 * without writing and fails while any row would be blocked.
 */
export async function runAssetsMigrate(
  cwd: string,
  options: AssetsMigrateOptions,
  deps: AssetsMigrateDeps = { findHolders: findDatabaseHolders },
): Promise<CommandResult> {
  const database =
    options.database ?? `${resolveStandardPaths().dataDir}/brain.db`;
  if (REMOTE_URL.test(database)) {
    return {
      success: false,
      message: `Refusing ${database}: binary asset migration runs only against a local database file.`,
    };
  }
  const path = resolveDatabasePath(cwd, database);
  const size = await databaseBytes(path);
  if (size === undefined) {
    return { success: false, message: `No entity database at ${path}.` };
  }
  const holders = await deps.findHolders(path);
  if (holders === undefined) {
    return {
      success: false,
      message: `Refusing to migrate: cannot confirm that no process holds ${path} open on this platform. Stop the app and run this where /proc or lsof is available.`,
    };
  }
  if (holders.length > 0) {
    return {
      success: false,
      message: `Refusing to migrate: process(es) ${holders.join(", ")} hold ${path} open. Stop the app first.`,
    };
  }
  if (!options.dryRun) {
    return {
      success: false,
      message:
        "Only a preview is available in this release: run with --dry-run.",
    };
  }

  const client = openOfflineEntityDatabase(path);
  try {
    const plan = await planImageAssetMigration(client, {
      databaseBytes: size,
    });
    return {
      success: plan.blocked.length === 0,
      message: renderPlan(path, plan),
    };
  } catch (error) {
    return {
      success: false,
      message: `Dry-run failed: ${getErrorMessage(error)}`,
    };
  } finally {
    client.close();
  }
}

function resolveDatabasePath(cwd: string, database: string): string {
  const path = database.startsWith("file:")
    ? database.slice("file:".length)
    : database;
  return isAbsolute(path) ? path : resolve(cwd, path);
}

/** The database file plus its WAL, or undefined when there is no database. */
async function databaseBytes(path: string): Promise<number | undefined> {
  const [file, wal] = await Promise.all([
    stat(path).catch(() => undefined),
    stat(`${path}-wal`).catch(() => undefined),
  ]);
  return file?.isFile() ? file.size + (wal?.size ?? 0) : undefined;
}

function renderPlan(path: string, plan: ImageAssetMigrationPlan): string {
  const mib = (bytes: number): string =>
    `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  return [
    `Binary asset migration dry-run for ${path}`,
    `${plan.inlineRows} inline image(s): ${plan.ready} ready, ${plan.blocked.length} blocked; ${plan.alreadyMigrated} already migrated.`,
    ...plan.blocked.map(
      (image) =>
        `  blocked ${image.id}: ${image.reason}${image.sizeBytes === undefined ? "" : ` (${mib(image.sizeBytes)})`}`,
    ),
    `Ready images: ${plan.uniqueDigests} distinct, ${plan.duplicateRows} duplicate row(s), ${plan.alreadyStoredDigests} already stored.`,
    `New asset bytes: ${mib(plan.bytesToStore)}; inline content removed: ${mib(plan.inlineBytesFreed)}.`,
    `Full-text rows to remove: ${plan.ftsRows}. Content hashes that change: ${plan.contentHashChanges}.`,
    `Disk: database ${mib(plan.disk.databaseBytes)}, backup ${mib(plan.disk.backupBytes)}, after migration ${mib(plan.disk.afterMigrationBytes)}, VACUUM copy ${mib(plan.disk.vacuumBytes)}; peak ${mib(plan.disk.peakBytes)}.`,
    ...[...new Set(plan.blocked.map((image) => image.reason))].map(
      (reason) => `  ${reason}: ${BLOCKER_HINTS[reason]}`,
    ),
    plan.blocked.length === 0
      ? "No blockers."
      : "Resolve every blocked image before migrating.",
  ].join("\n");
}
