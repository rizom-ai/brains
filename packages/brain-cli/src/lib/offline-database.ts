import { stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { resolveStandardPaths } from "@brains/app";
import {
  acquireDatabaseLease,
  DatabaseLeaseConflictError,
  describeDatabaseLease,
  isDatabaseLeaseFresh,
  openOfflineEntityDatabase,
  readDatabaseLeases,
  type HeldDatabaseLease,
  type OfflineEntityConnection,
} from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { getErrorMessage } from "@brains/utils/error";
import type { CommandResult } from "./command-result";
import { findDatabaseHolders } from "./database-holders";

/** How offline maintenance tells that no process holds the database. */
export interface OfflineDatabaseDeps {
  findHolders(databasePath: string): Promise<number[] | undefined>;
}

export const defaultOfflineDatabaseDeps: OfflineDatabaseDeps = {
  findHolders: findDatabaseHolders,
};

/** A local entity database no other process holds open. */
export interface OfflineDatabase {
  path: string;
  /** The database file plus its WAL. */
  bytes: number;
}

const REMOTE_URL = /^(?:libsql|wss?|https?):/i;

export interface OfflineDatabaseOptions {
  /** Continue past leases a crash left; a fresh lease still refuses. */
  ignoreStaleHeartbeat?: boolean | undefined;
}

/**
 * Resolve the entity database for offline maintenance, or the reason it
 * cannot be used: it must be a local file no brain holds a lease on, from
 * this container or any other sharing the file, and no process of this
 * container holds open, so the app is known to be stopped.
 */
export async function resolveOfflineDatabase(
  cwd: string,
  database: string | undefined,
  deps: OfflineDatabaseDeps,
  options: OfflineDatabaseOptions = {},
): Promise<OfflineDatabase | CommandResult> {
  const target = database ?? `${resolveStandardPaths().dataDir}/brain.db`;
  if (REMOTE_URL.test(target)) {
    return {
      success: false,
      message: `Refusing ${target}: binary asset maintenance runs only against a local database file.`,
    };
  }
  const path = resolveLocalPath(cwd, target);
  const bytes = await databaseBytes(path);
  if (bytes === undefined) {
    return { success: false, message: `No entity database at ${path}.` };
  }
  const leased = await refuseLeased(path, options);
  if (leased) return leased;
  const holders = await deps.findHolders(path);
  if (holders === undefined) {
    return {
      success: false,
      message: `Refusing to continue: cannot confirm that no process holds ${path} open on this platform. Stop the app and run this where /proc or lsof is available.`,
    };
  }
  if (holders.length > 0) {
    return {
      success: false,
      message: `Refusing to continue: process(es) ${holders.join(", ")} hold ${path} open. Stop the app first.`,
    };
  }
  return { path, bytes };
}

/** A path or `file:` URL, relative to the invocation directory. */
export function resolveLocalPath(cwd: string, target: string): string {
  const path = target.startsWith("file:")
    ? target.slice("file:".length)
    : target;
  return isAbsolute(path) ? path : resolve(cwd, path);
}

async function databaseBytes(path: string): Promise<number | undefined> {
  const [file, wal] = await Promise.all([
    stat(path).catch(() => undefined),
    stat(`${path}-wal`).catch(() => undefined),
  ]);
  return file?.isFile() ? file.size + (wal?.size ?? 0) : undefined;
}

/**
 * Bring a stopped app's entity schema forward, as the transitional
 * release's first start would, so the staged asset tables exist. Undefined
 * once done; otherwise the failed command result.
 */
export async function migrateOfflineSchema(
  path: string,
): Promise<CommandResult | undefined> {
  try {
    await migrateEntities({ url: `file:${path}` });
    return undefined;
  } catch (error) {
    return {
      success: false,
      message: `Schema migration failed: ${getErrorMessage(error)}`,
    };
  }
}

/**
 * Close a connection the command owns alone, after folding its write-ahead
 * log into the database and truncating it: the file then holds every write,
 * and no log is left for the next process to replay or for a copy to miss.
 */
export async function closeCheckpointed(connection: {
  client: {
    execute(sql: string): Promise<unknown>;
    close(): void;
  };
}): Promise<void> {
  try {
    await connection.client.execute("PRAGMA wal_checkpoint(TRUNCATE)");
  } finally {
    connection.client.close();
  }
}

/**
 * Refuse while any lease on the database is fresh: a brain, or another
 * command, renews it from whichever container it runs in. Leases a crash
 * left also refuse unless the operator says no brain runs.
 */
async function refuseLeased(
  path: string,
  options: OfflineDatabaseOptions,
): Promise<CommandResult | undefined> {
  const client = openOfflineEntityDatabase(path).client;
  const leases = await readDatabaseLeases(client)
    .catch((error: unknown) => new Error(getErrorMessage(error)))
    .finally(() => client.close());
  if (leases instanceof Error) {
    return {
      success: false,
      message: `Refusing to continue: cannot read the leases on ${path}: ${leases.message}`,
    };
  }
  const now = Date.now();
  const fresh = leases.filter((lease) => isDatabaseLeaseFresh(lease, now));
  if (fresh.length > 0) {
    return {
      success: false,
      message: [
        `Refusing to continue: ${path} is in use.`,
        ...fresh.map((lease) => `  ${describeDatabaseLease(lease, now)}`),
        "Stop the brain first, or wait for the command to finish.",
      ].join("\n"),
    };
  }
  if (leases.length > 0 && !options.ignoreStaleHeartbeat) {
    return {
      success: false,
      message: [
        `Refusing to continue: ${path} holds lease(s) that stopped renewing without being released, which a crash leaves:`,
        ...leases.map((lease) => `  ${describeDatabaseLease(lease, now)}`),
        "If no brain runs on this database, rerun with --ignore-stale-heartbeat.",
      ].join("\n"),
    };
  }
  return undefined;
}

/** One command run's connection to the database. */
export interface OfflineRun {
  connection: OfflineEntityConnection;
  /**
   * End the run: a writing run releases its lease and folds its log in
   * before closing; a dry-run wrote nothing and just closes.
   */
  finish(): Promise<void>;
}

/**
 * Open the database for one run. A run that writes holds a maintenance lease
 * throughout, so a brain starting meanwhile, from any container, refuses
 * instead of serving a database mid-conversion; a dry-run writes nothing,
 * not even a lease.
 */
export async function openOfflineRun(
  path: string,
  options: { command: string; dryRun?: boolean | undefined },
): Promise<OfflineRun | CommandResult> {
  const connection = openOfflineEntityDatabase(path);
  if (options.dryRun) {
    return {
      connection,
      finish: async (): Promise<void> => connection.client.close(),
    };
  }
  const lease = await holdMaintenanceLease(connection.client, options.command);
  if (!("release" in lease)) {
    connection.client.close();
    return lease;
  }
  return {
    connection,
    finish: async (): Promise<void> => {
      try {
        await lease.release();
      } finally {
        await closeCheckpointed(connection);
      }
    },
  };
}

async function holdMaintenanceLease(
  client: Parameters<typeof acquireDatabaseLease>[0],
  command: string,
): Promise<HeldDatabaseLease | CommandResult> {
  try {
    return await acquireDatabaseLease(client, {
      role: "maintenance",
      command,
    });
  } catch (error) {
    if (!(error instanceof DatabaseLeaseConflictError)) {
      return {
        success: false,
        message: `Could not take the maintenance lease: ${getErrorMessage(error)}`,
      };
    }
    return {
      success: false,
      message: [
        "Refusing to continue: the database came into use.",
        ...error.holders.map((lease) => `  ${describeDatabaseLease(lease)}`),
        "Stop the brain first, or wait for the command to finish.",
      ].join("\n"),
    };
  }
}
