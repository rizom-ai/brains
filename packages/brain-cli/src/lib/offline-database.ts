import { stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { resolveStandardPaths } from "@brains/app";
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

/**
 * Resolve the entity database for offline maintenance, or the reason it
 * cannot be used: it must be a local file that no other process holds open,
 * so the app is known to be stopped.
 */
export async function resolveOfflineDatabase(
  cwd: string,
  database: string | undefined,
  deps: OfflineDatabaseDeps,
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
