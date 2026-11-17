import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { OfflineEntityConnection } from "@brains/entity-service";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import type { CommandResult } from "../lib/command-result";
import {
  defaultOfflineDatabaseDeps,
  migrateOfflineSchema,
  openOfflineRun,
  resolveLocalPath,
  resolveOfflineDatabase,
  type OfflineDatabaseDeps,
} from "../lib/offline-database";
import { BINARY_ASSET_KINDS } from "../lib/binary-asset-kinds";
import {
  planBinaryAssetMigration,
  type BinaryAssetMigrationPlan,
} from "../lib/binary-asset-migration-plan";
import {
  runBinaryAssetMigration,
  type MigrationManifestEntry,
} from "../lib/binary-asset-migration-run";

export interface AssetsMigrateOptions {
  /** Entity database path or `file:` URL; defaults to the app's data dir. */
  database?: string | undefined;
  /** Continue past leases a crash left; a fresh lease still refuses. */
  ignoreStaleHeartbeat?: boolean | undefined;
  dryRun?: boolean | undefined;
  /** Where each run is recorded; defaults beside the database. */
  manifest?: string | undefined;
}

/**
 * Move inline images and documents into durable assets, offline: the app
 * must be stopped and the entity database local. A dry-run decodes every
 * inline row without writing and fails while any would be blocked; a migration
 * refuses to start while any is, and records every run in a manifest.
 */
export async function runAssetsMigrate(
  cwd: string,
  options: AssetsMigrateOptions,
  deps: OfflineDatabaseDeps = defaultOfflineDatabaseDeps,
  migrate: (
    connection: OfflineEntityConnection,
    entries: MigrationManifestEntry[],
  ) => Promise<unknown> = (connection, entries) =>
    runBinaryAssetMigration(connection, BINARY_ASSET_KINDS, entries),
): Promise<CommandResult> {
  const database = await resolveOfflineDatabase(cwd, options.database, deps, {
    ignoreStaleHeartbeat: options.ignoreStaleHeartbeat,
  });
  if (!("path" in database)) return database;
  const { path } = database;
  const size = database.bytes;
  // A dry-run never writes, so it leaves the schema as it is.
  if (!options.dryRun) {
    const failed = await migrateOfflineSchema(path);
    if (failed) return failed;
  }
  const run = await openOfflineRun(path, {
    command: "assets:migrate",
    dryRun: options.dryRun,
  });
  if (!("connection" in run)) return run;
  const { connection } = run;
  try {
    const plans: BinaryAssetMigrationPlan[] = [];
    for (const kind of BINARY_ASSET_KINDS) {
      plans.push(
        await planBinaryAssetMigration(connection.client, kind, {
          databaseBytes: size,
        }),
      );
    }
    const blocked = plans.some((plan) => plan.blocked.length > 0);
    if (options.dryRun || blocked) {
      return {
        success: Boolean(options.dryRun) && !blocked,
        message: renderPlans(path, size, plans),
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
    const count = (
      outcome: MigrationManifestEntry["outcome"],
      entityType?: string,
    ): number =>
      entries.filter(
        (entry) =>
          entry.outcome === outcome &&
          (entityType === undefined || entry.entityType === entityType),
      ).length;
    const unfinished = count("changed") + count("blocked");
    return {
      success: unfinished === 0,
      message: [
        `Migrated ${BINARY_ASSET_KINDS.map((kind) => `${count("migrated", kind.entityType)} ${kind.noun}(s)`).join(", ")}; ${count("changed")} changed during the run; ${count("blocked")} blocked.`,
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
    await run.finish();
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

function renderPlans(
  path: string,
  databaseBytes: number,
  plans: readonly BinaryAssetMigrationPlan[],
): string {
  const mib = (bytes: number): string =>
    `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  // Every type's new chunks land in the one database, as their inline
  // content leaves it.
  const bytesToStore = plans.reduce((sum, plan) => sum + plan.bytesToStore, 0);
  const inlineBytesFreed = plans.reduce(
    (sum, plan) => sum + plan.inlineBytesFreed,
    0,
  );
  const afterMigrationBytes = databaseBytes + bytesToStore;
  const vacuumBytes = Math.max(0, afterMigrationBytes - inlineBytesFreed);
  const blocked = plans.some((plan) => plan.blocked.length > 0);
  return [
    `Binary asset migration dry-run for ${path}`,
    ...plans.flatMap((plan) => renderKind(plan, mib)),
    `New asset bytes: ${mib(bytesToStore)}; inline content removed: ${mib(inlineBytesFreed)}.`,
    `Full-text rows to remove: ${plans.reduce((sum, plan) => sum + plan.ftsRows, 0)}. Content hashes that change: ${plans.reduce((sum, plan) => sum + plan.contentHashChanges, 0)}.`,
    `Disk: database ${mib(databaseBytes)}, backup ${mib(databaseBytes)}, after migration ${mib(afterMigrationBytes)}, VACUUM copy ${mib(vacuumBytes)}; peak ${mib(databaseBytes + afterMigrationBytes + vacuumBytes)}.`,
    blocked ? "Resolve every blocked row before migrating." : "No blockers.",
  ].join("\n");
}

/** One type's part of a dry-run; a type with no rows is left out. */
function renderKind(
  plan: BinaryAssetMigrationPlan,
  mib: (bytes: number) => string,
): string[] {
  const { noun, hints } = plan.kind;
  if (
    plan.inlineRows === 0 &&
    plan.alreadyMigrated === 0 &&
    plan.awaitingRows === 0
  ) {
    return [];
  }
  return [
    `${plan.inlineRows} inline ${noun}(s): ${plan.ready} ready, ${plan.blocked.length} blocked; ${plan.alreadyMigrated} already migrated.`,
    ...plan.blocked.map(
      (row) =>
        `  blocked ${row.id}: ${row.reason}${row.sizeBytes === undefined ? "" : ` (${mib(row.sizeBytes)})`}`,
    ),
    ...(plan.awaitingRows > 0
      ? [
          `${plan.awaitingRows} ${noun}(s) awaiting their bytes; ${plan.placeholdersToClear} old placeholder${plan.placeholdersToClear === 1 ? "" : "s"} to clear.`,
        ]
      : []),
    `Ready ${noun}s: ${plan.uniqueDigests} distinct, ${plan.duplicateRows} duplicate row(s), ${plan.alreadyStoredDigests} already stored.`,
    ...[...new Set(plan.blocked.map((row) => row.reason))].map(
      (reason) => `  ${reason}: ${hints[reason] ?? "resolve this row by hand"}`,
    ),
  ];
}
