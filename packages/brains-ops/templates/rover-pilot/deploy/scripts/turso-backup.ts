// brains-turso-backup-v1: self-contained offline database snapshot support.
// Native Turso is loaded only during capture/restore, inside the source image.
import type { Database } from "@tursodatabase/database";
import { constants } from "node:fs";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  realpath,
  rm,
} from "node:fs/promises";
import { join } from "node:path";

export const TURSO_BACKUP_DATABASE_NAMES = [
  "brain.db",
  "brain-jobs.db",
  "conversations.db",
  "runtime-state.db",
  "auth.db",
] as const;

export interface TursoDatabaseSource {
  source: string;
  name: string;
}
export interface TursoDatabaseCapture extends TursoDatabaseSource {
  status: "captured";
  required: true;
  method: "stopped-turso-copy";
  quickCheckDriver: "turso";
  quickCheck: "ok";
  bytes: number;
  sha256: string;
  restoreVerified: true;
  sourceFiles: Array<{ suffix: string; hash: string }>;
}

export async function fileSha256(path: string): Promise<string> {
  const hash = new Bun.CryptoHasher("sha256");
  for await (const chunk of Bun.file(path).stream()) hash.update(chunk);
  return hash.digest("hex");
}

export async function regularFile(path: string): Promise<void> {
  if (!(await lstat(path)).isFile())
    throw new Error(`Expected a regular, non-symlink file: ${path}`);
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return false;
    throw error;
  }
}

export async function copyPrivateFile(
  source: string,
  destination: string,
): Promise<void> {
  await regularFile(source);
  await copyFile(source, destination, constants.COPYFILE_EXCL);
  await chmod(destination, 0o600);
}

async function query(database: Database, sql: string): Promise<unknown[]> {
  const statement = await database.prepare(sql);
  try {
    const rows: unknown[] = await statement.all();
    return rows;
  } finally {
    statement.close();
  }
}

function firstValue(row: unknown): unknown {
  return typeof row === "object" && row !== null
    ? Object.values(row)[0]
    : undefined;
}

/** Open ONLY a private copy. Recover its Turso WAL, verify, checkpoint and close. */
async function verifyAndCheckpoint(path: string, jobs: boolean): Promise<void> {
  const { connect } = await import("@tursodatabase/database");
  const database = await connect(path);
  try {
    const integrity = await query(database, "PRAGMA integrity_check");
    if (integrity.length !== 1 || firstValue(integrity[0]) !== "ok")
      throw new Error("Turso snapshot integrity check failed");
    if ((await query(database, "PRAGMA foreign_key_check")).length !== 0)
      throw new Error("Turso snapshot foreign-key check failed");
    if (
      jobs &&
      Number(
        firstValue(
          (
            await query(
              database,
              "SELECT count(*) FROM job_queue WHERE status = 'processing'",
            )
          )[0],
        ),
      ) !== 0
    ) {
      throw new Error(
        "Processing jobs remain after shutdown; reconcile on the original runtime before taking a backup",
      );
    }
    const checkpoint = await query(database, "PRAGMA wal_checkpoint(TRUNCATE)");
    if (checkpoint.length !== 1 || Number(firstValue(checkpoint[0])) !== 0)
      throw new Error("Turso snapshot checkpoint did not complete");
  } finally {
    await database.close();
  }
  const wal = `${path}-wal`;
  if (await exists(wal)) {
    await regularFile(wal);
    if ((await lstat(wal)).size !== 0)
      throw new Error("Turso snapshot still has an uncheckpointed WAL");
    await rm(wal);
  }
}

async function sourceFiles(
  path: string,
): Promise<Array<{ suffix: string; hash: string }>> {
  // These are not part of the single-owner Turso persistence contract.
  for (const suffix of ["-journal", "-shm", "-tshm"]) {
    if (await exists(`${path}${suffix}`))
      throw new Error(`Unexpected database sidecar: ${path}${suffix}`);
  }
  const files = [];
  for (const suffix of ["", "-wal"]) {
    if (suffix && !(await exists(`${path}${suffix}`))) continue;
    await regularFile(`${path}${suffix}`);
    files.push({ suffix, hash: await fileSha256(`${path}${suffix}`) });
  }
  return files;
}

/** Cold file capture. The caller must fence and stop EVERY writer first. */
export async function captureTursoDatabases(options: {
  backupDir: string;
  databases: TursoDatabaseSource[];
  sourceStopped: boolean;
}): Promise<TursoDatabaseCapture[]> {
  if (!options.sourceStopped)
    throw new Error("All source writers must be stopped before capture");
  const names = options.databases.map((database) => database.name).sort();
  if (
    JSON.stringify(names) !==
    JSON.stringify([...TURSO_BACKUP_DATABASE_NAMES].sort())
  )
    throw new Error(
      "A Turso backup requires all five runtime databases, including auth",
    );
  const backup = await realpath(options.backupDir);
  const originals = [];
  const captures: TursoDatabaseCapture[] = [];
  for (const source of options.databases) {
    if (!(await exists(source.source)))
      throw new Error(`Required database missing: ${source.source}`);
    const original = await sourceFiles(source.source);
    originals.push({ source: source.source, files: original });
    const destination = join(backup, source.name);
    for (const file of original) {
      const copied = `${destination}${file.suffix}`;
      await copyPrivateFile(`${source.source}${file.suffix}`, copied);
      if ((await fileSha256(copied)) !== file.hash)
        throw new Error("Source changed during cold database copy");
    }
    await verifyAndCheckpoint(destination, source.name === "brain-jobs.db");
    const hash = await fileSha256(destination);
    const rehearsal = await mkdtemp(join(backup, ".database-restore-"));
    await chmod(rehearsal, 0o700);
    try {
      const restored = join(rehearsal, source.name);
      await copyPrivateFile(destination, restored);
      await verifyAndCheckpoint(restored, source.name === "brain-jobs.db");
      if ((await fileSha256(restored)) !== hash)
        throw new Error("Restored database differs from its snapshot");
    } finally {
      await rm(rehearsal, { recursive: true, force: true });
    }
    captures.push({
      ...source,
      status: "captured",
      required: true,
      method: "stopped-turso-copy",
      quickCheckDriver: "turso",
      quickCheck: "ok",
      bytes: (await lstat(destination)).size,
      sha256: hash,
      restoreVerified: true,
      sourceFiles: original,
    });
  }
  for (const original of originals) {
    if (
      JSON.stringify(await sourceFiles(original.source)) !==
      JSON.stringify(original.files)
    )
      throw new Error(
        "Source database changed while writers were supposed to be stopped",
      );
  }
  return captures;
}

export async function verifyStoppedDatabaseSources(
  captures: TursoDatabaseCapture[],
): Promise<void> {
  for (const capture of captures) {
    if (
      JSON.stringify(await sourceFiles(capture.source)) !==
      JSON.stringify(capture.sourceFiles)
    )
      throw new Error("Source database changed during backup verification");
  }
}

/** Restore verified, checkpointed snapshots into a NEW, private data directory. */
export async function restoreTursoDatabases(options: {
  backupDir: string;
  destination: string;
  databases: Array<{ name: string; sha256: string }>;
}): Promise<void> {
  const names = options.databases.map((database) => database.name).sort();
  if (
    JSON.stringify(names) !==
    JSON.stringify([...TURSO_BACKUP_DATABASE_NAMES].sort())
  )
    throw new Error("Restore requires all five runtime databases");
  // Exclusive creation is deliberate: never merge a restore into live state.
  await mkdir(options.destination, { mode: 0o700 });
  for (const database of options.databases) {
    const source = join(options.backupDir, database.name);
    const files = await sourceFiles(source);
    if (files.length !== 1 || files[0]?.hash !== database.sha256)
      throw new Error("Snapshot database checksum mismatch or unexpected WAL");
    const output = database.name === "auth.db" ? "auth/auth.db" : database.name;
    if (database.name === "auth.db")
      await mkdir(join(options.destination, "auth"), { mode: 0o700 });
    const destination = join(options.destination, output);
    await copyPrivateFile(source, destination);
    await verifyAndCheckpoint(destination, database.name === "brain-jobs.db");
    if ((await fileSha256(destination)) !== database.sha256)
      throw new Error("Restored database checksum mismatch");
  }
}
