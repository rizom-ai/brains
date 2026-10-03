import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  openOfflineEntityDatabase,
  type OfflineEntityConnection,
} from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import type { InlineImageBlocker } from "@brains/image";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import type { CommandResult } from "../lib/command-result";
import {
  defaultOfflineDatabaseDeps,
  resolveLocalPath,
  resolveOfflineDatabase,
  type OfflineDatabaseDeps,
} from "../lib/offline-database";
import {
  planImageAssetMigration,
  type ImageAssetMigrationPlan,
} from "../lib/binary-asset-migration-plan";
import {
  runImageAssetMigration,
  type MigrationManifestEntry,
} from "../lib/binary-asset-migration-run";

export interface AssetsMigrateOptions {
  /** Entity database path or `file:` URL; defaults to the app's data dir. */
  database?: string | undefined;
  dryRun?: boolean | undefined;
  /** Where each run is recorded; defaults beside the database. */
  manifest?: string | undefined;
}

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
 * without writing and fails while any row would be blocked; a migration
 * refuses to start while any is, and records every run in a manifest.
 */
export async function runAssetsMigrate(
  cwd: string,
  options: AssetsMigrateOptions,
  deps: OfflineDatabaseDeps = defaultOfflineDatabaseDeps,
  migrate: (
    connection: OfflineEntityConnection,
    entries: MigrationManifestEntry[],
  ) => Promise<unknown> = runImageAssetMigration,
): Promise<CommandResult> {
  const database = await resolveOfflineDatabase(cwd, options.database, deps);
  if (!("path" in database)) return database;
  const { path } = database;
  const size = database.bytes;
  if (!options.dryRun) {
    // What starting the transitional release would do first: bring the
    // schema forward, so the staged asset tables exist. A dry-run never writes.
    try {
      await migrateEntities({ url: `file:${path}` });
    } catch (error) {
      return {
        success: false,
        message: `Schema migration failed: ${getErrorMessage(error)}`,
      };
    }
  }
  const connection = openOfflineEntityDatabase(path);
  try {
    const plan = await planImageAssetMigration(connection.client, {
      databaseBytes: size,
    });
    if (options.dryRun || plan.blocked.length > 0) {
      return {
        success: Boolean(options.dryRun) && plan.blocked.length === 0,
        message: renderPlan(path, plan),
      };
    }
    const startedAt = new Date().toISOString();
    const manifestPath = options.manifest
      ? resolveLocalPath(cwd, options.manifest)
      : join(dirname(path), "binary-asset-migration.json");
    // Rows commit one at a time, so a run that throws has still changed some:
    // the manifest records them, and the error, either way.
    const entries: MigrationManifestEntry[] = [];
    const failure = await migrate(connection, entries).then(
      () => undefined,
      (error: unknown) => getErrorMessage(error),
    );
    await appendManifestRun(manifestPath, {
      database: path,
      startedAt,
      finishedAt: new Date().toISOString(),
      entries,
      ...(failure !== undefined && { error: failure }),
    });
    if (failure !== undefined) {
      return {
        success: false,
        message: [
          `Migration failed after ${entries.length} row(s) were recorded: ${failure}`,
          `Manifest: ${manifestPath}`,
          "Rerun the dry-run before migrating again.",
        ].join("\n"),
      };
    }
    const count = (outcome: MigrationManifestEntry["outcome"]): number =>
      entries.filter((entry) => entry.outcome === outcome).length;
    const unfinished = count("changed") + count("blocked");
    return {
      success: unfinished === 0,
      message: [
        `Migrated ${count("migrated")} image(s); ${count("changed")} changed during the run; ${count("blocked")} blocked.`,
        `Manifest: ${manifestPath}`,
        unfinished === 0
          ? "Next: verify, then VACUUM once acceptance passes."
          : "Rerun the dry-run before migrating again.",
      ].join("\n"),
    };
  } catch (error) {
    return {
      success: false,
      message: `${options.dryRun ? "Dry-run" : "Migration"} failed: ${getErrorMessage(error)}`,
    };
  } finally {
    connection.client.close();
  }
}

const manifestFileSchema = z.object({ runs: z.array(z.unknown()) });

/** Append one run, replacing the file whole so a crash never truncates it. */
async function appendManifestRun(
  path: string,
  run: {
    database: string;
    startedAt: string;
    finishedAt: string;
    entries: MigrationManifestEntry[];
    error?: string;
  },
): Promise<void> {
  const existing = await readFile(path, "utf8").then(
    (text) => manifestFileSchema.parse(JSON.parse(text)).runs,
    () => [],
  );
  const next = `${path}.tmp`;
  await writeFile(
    next,
    `${JSON.stringify({ runs: [...existing, run] }, null, 2)}\n`,
  );
  await rename(next, path);
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
    ...(plan.awaitingRows > 0
      ? [
          `${plan.awaitingRows} image(s) awaiting their bytes; ${plan.placeholdersToClear} old placeholder${plan.placeholdersToClear === 1 ? "" : "s"} to clear.`,
        ]
      : []),
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
