#!/usr/bin/env bun

import { Database } from "bun:sqlite";
import { spawn } from "bun";
import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  copyFile,
  mkdir,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

export type StorageVariant =
  "current-base64-fts" | "base64-no-image-fts" | "sqlite-blob";

interface SourceEntityRow {
  id: string;
  entityType: string;
  content: string;
  contentHash: string;
  metadata: string;
  created: number;
  updated: number;
  visibility: string;
}

interface SourceSummary {
  databaseBytes: number;
  databaseSha256: string;
  imageRows: number;
  imageFtsRows: number;
  encodedContentBytes: number;
  decodedContentBytes: number;
  uniqueDecodedDigests: number;
  maxEncodedContentBytes: number;
  maxDecodedContentBytes: number;
  corpusFiles: number;
  corpusBytes: number;
  corpusUniqueDigests: number;
  databaseDigestsMissingFromCorpus: number;
  corpusDigestsMissingFromDatabase: number;
}

interface Timings {
  copyMs: number;
  mutationMs: number;
  checkpointMs: number;
  vacuumMs: number;
  entityListMs: number;
  explicitBinaryReadMs: number;
  backupMs: number;
  backupVerifyMs: number;
}

interface VariantResult {
  variant: StorageVariant;
  imageRows: number;
  assetRows: number;
  deduplicatedAssets: number;
  storedBinaryBytes: number;
  entityContentBytes: number;
  databaseBytesBeforeMutation: number;
  databaseBytesAfterCheckpoint: number;
  compactDatabaseBytes: number;
  walBytesAfterMutation: number;
  backupBytes: number;
  materializedEntityContentBytes: number;
  explicitBinaryReadBytes: number;
  quickCheck: string;
  digestVerificationPassed: boolean;
  missingAssetReferences: number;
  atomicRollbackPassed: boolean | null;
  maxRssBytes: number;
  timings: Timings;
}

interface BlobProbeResult {
  sizeBytes: number;
  insertMs: number;
  checkpointMs: number;
  verifyMs: number;
  databaseBytes: number;
  walBytesAfterInsert: number;
  maxRssBytes: number;
  digestVerified: boolean;
  atomicRollbackPassed: boolean;
}

interface BenchmarkReport {
  schemaVersion: 1;
  generatedAt: string;
  sourceLabel: string;
  bunVersion: string;
  platform: string;
  architecture: string;
  source: SourceSummary;
  variants: VariantResult[];
  blobProbes: BlobProbeResult[];
}

interface ParsedDataUrl {
  mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
  bytes: Buffer;
}

interface CliOptions {
  sourceDb: string;
  corpusDir: string;
  outputDir: string;
  sourceLabel: string;
  resultJson: string;
  resultMarkdown: string;
  keepArtifacts: boolean;
  probeSizesMb: number[];
}

interface WorkerOptions {
  mode: "variant" | "blob-probe";
  snapshotDb: string;
  outputDir: string;
  keepArtifacts: boolean;
  variant?: StorageVariant;
  probeSizeBytes?: number;
}

const IMAGE_ENTITY_TYPE = "image";
const ASSET_PREFIX = "asset://sha256/";
const IMAGE_FILE_PATTERN = /\.(?:png|jpe?g|gif|webp)$/i;
const DATA_URL_PATTERN =
  /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=\r\n]+)$/;

function usage(): string {
  return [
    "Usage:",
    "  bun scripts/benchmark-sqlite-assets.ts \\",
    "    --source-db /path/to/brain.db \\",
    "    --corpus-dir /path/to/brain-data/image \\",
    "    --output-dir /tmp/sqlite-asset-benchmark \\",
    "    --result-json docs/plans/evidence/sqlite-assets.json \\",
    "    --result-markdown docs/plans/evidence/sqlite-assets.md",
    "",
    "The source database must be stopped with an empty WAL. The script copies it",
    "before opening SQLite and never writes to the source instance.",
  ].join("\n");
}

function parseFlags(argv: string[]): Map<string, string | true> {
  const flags = new Map<string, string | true>();
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (!argument?.startsWith("--")) {
      throw new Error(`Unexpected argument: ${argument ?? ""}`);
    }
    const equals = argument.indexOf("=");
    if (equals !== -1) {
      flags.set(argument.slice(2, equals), argument.slice(equals + 1));
      continue;
    }
    const name = argument.slice(2);
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags.set(name, next);
      index++;
    } else {
      flags.set(name, true);
    }
  }
  return flags;
}

function requiredString(
  flags: Map<string, string | true>,
  name: string,
): string {
  const value = flags.get(name);
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing --${name}\n\n${usage()}`);
  }
  return value;
}

function optionalString(
  flags: Map<string, string | true>,
  name: string,
  fallback: string,
): string {
  const value = flags.get(name);
  if (value === undefined) return fallback;
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`--${name} must have a value`);
  }
  return value;
}

function parseProbeSizes(value: string): number[] {
  const sizes = value.split(",").map((part) => Number(part.trim()));
  if (
    sizes.length === 0 ||
    sizes.some((size) => !Number.isSafeInteger(size) || size <= 0 || size > 512)
  ) {
    throw new Error(
      "--probe-sizes-mb must be comma-separated integers from 1 to 512",
    );
  }
  return [...new Set(sizes)];
}

function parseCliOptions(argv: string[]): CliOptions {
  const flags = parseFlags(argv);
  return {
    sourceDb: resolve(requiredString(flags, "source-db")),
    corpusDir: resolve(requiredString(flags, "corpus-dir")),
    outputDir: resolve(requiredString(flags, "output-dir")),
    sourceLabel: optionalString(flags, "source-label", "local-brain"),
    resultJson: resolve(requiredString(flags, "result-json")),
    resultMarkdown: resolve(requiredString(flags, "result-markdown")),
    keepArtifacts: flags.get("keep-artifacts") === true,
    probeSizesMb: parseProbeSizes(
      optionalString(flags, "probe-sizes-mb", "5,25,50,100"),
    ),
  };
}

function parseWorkerOptions(argv: string[]): WorkerOptions {
  const flags = parseFlags(argv);
  const mode = requiredString(flags, "worker-mode");
  if (mode !== "variant" && mode !== "blob-probe") {
    throw new Error(`Unsupported worker mode: ${mode}`);
  }
  const common = {
    mode,
    snapshotDb: resolve(requiredString(flags, "snapshot-db")),
    outputDir: resolve(requiredString(flags, "output-dir")),
    keepArtifacts: flags.get("keep-artifacts") === true,
  } as const;
  if (mode === "variant") {
    const variant = requiredString(flags, "variant");
    if (
      variant !== "current-base64-fts" &&
      variant !== "base64-no-image-fts" &&
      variant !== "sqlite-blob"
    ) {
      throw new Error(`Unsupported variant: ${variant}`);
    }
    return { ...common, variant };
  }
  const size = Number(requiredString(flags, "probe-size-bytes"));
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new Error("--probe-size-bytes must be a positive safe integer");
  }
  return { ...common, probeSizeBytes: size };
}

export function parseImageDataUrl(content: string): ParsedDataUrl {
  const match = DATA_URL_PATTERN.exec(content);
  if (!match?.[1] || !match[2]) {
    throw new Error("Expected a supported base64 image data URL");
  }
  const bytes = Buffer.from(match[2].replace(/[\r\n]/g, ""), "base64");
  if (bytes.byteLength === 0) {
    throw new Error("Decoded image is empty");
  }
  return {
    mediaType: match[1] as ParsedDataUrl["mediaType"],
    bytes,
  };
}

function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function sha256File(path: string): Promise<string> {
  const hash = new Bun.CryptoHasher("sha256");
  const file = Bun.file(path);
  for await (const chunk of file.stream()) hash.update(chunk);
  return hash.digest("hex");
}

async function fileSize(path: string): Promise<number> {
  return stat(path).then(
    (entry) => entry.size,
    (error: unknown) => {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return 0;
      }
      throw error;
    },
  );
}

async function removeDatabaseFiles(path: string): Promise<void> {
  await Promise.all([
    rm(path, { force: true }),
    rm(`${path}-wal`, { force: true }),
    rm(`${path}-shm`, { force: true }),
  ]);
}

async function cloneFile(source: string, destination: string): Promise<void> {
  await rm(destination, { force: true });
  try {
    await copyFile(source, destination, fsConstants.COPYFILE_FICLONE);
  } catch {
    await copyFile(source, destination);
  }
}

function createAssetsTable(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS assets (
      digest TEXT PRIMARY KEY NOT NULL,
      bytes BLOB NOT NULL,
      size_bytes INTEGER NOT NULL,
      created INTEGER NOT NULL,
      CHECK (length(digest) = 64),
      CHECK (digest NOT GLOB '*[^0-9a-f]*'),
      CHECK (typeof(bytes) = 'blob'),
      CHECK (size_bytes >= 0),
      CHECK (length(bytes) = size_bytes)
    )
  `);
}

function configureWritableDatabase(db: Database): void {
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA synchronous = FULL");
  db.run("PRAGMA wal_autocheckpoint = 0");
  db.run("PRAGMA busy_timeout = 5000");
}

function sourceRows(db: Database): IterableIterator<SourceEntityRow> {
  return db
    .query<SourceEntityRow, [string]>(
      `SELECT id, entityType, content, contentHash, metadata, created, updated, visibility
       FROM entities
       WHERE entityType = ?
       ORDER BY id`,
    )
    .iterate(IMAGE_ENTITY_TYPE);
}

function updateMetadata(
  metadataText: string,
  mediaType: ParsedDataUrl["mediaType"],
  sizeBytes: number,
): string {
  const parsed: unknown = JSON.parse(metadataText);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Image metadata must be a JSON object");
  }
  return JSON.stringify({
    ...parsed,
    mediaType,
    sizeBytes,
  });
}

function verifyAtomicRollback(db: Database): boolean {
  const bytes = Buffer.from("transaction-rollback-probe", "utf8");
  const digest = sha256Bytes(bytes);
  const id = "__asset_transaction_rollback_probe__";
  db.run("BEGIN IMMEDIATE");
  try {
    db.run(
      "INSERT INTO assets (digest, bytes, size_bytes, created) VALUES (?, ?, ?, ?)",
      [digest, bytes, bytes.byteLength, Date.now()],
    );
    db.run(
      `INSERT INTO entities
       (id, entityType, content, contentHash, metadata, created, updated, visibility)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        IMAGE_ENTITY_TYPE,
        `${ASSET_PREFIX}${digest}`,
        sha256Text(`${ASSET_PREFIX}${digest}`),
        "{}",
        Date.now(),
        Date.now(),
        "restricted",
      ],
    );
  } finally {
    db.run("ROLLBACK");
  }
  const asset = db
    .query<{ count: number }, [string]>(
      "SELECT COUNT(*) AS count FROM assets WHERE digest = ?",
    )
    .get(digest);
  const entity = db
    .query<{ count: number }, [string, string]>(
      "SELECT COUNT(*) AS count FROM entities WHERE id = ? AND entityType = ?",
    )
    .get(id, IMAGE_ENTITY_TYPE);
  return asset?.count === 0 && entity?.count === 0;
}

function migrateImagesToBlobs(
  source: Database,
  target: Database,
): {
  imageRows: number;
  decodedBytes: number;
  atomicRollbackPassed: boolean;
} {
  createAssetsTable(target);
  const atomicRollbackPassed = verifyAtomicRollback(target);
  if (!atomicRollbackPassed) {
    throw new Error("Asset/entity rollback probe left durable rows");
  }

  const insertAsset = target.query<
    unknown,
    [string, Uint8Array, number, number]
  >(
    `INSERT INTO assets (digest, bytes, size_bytes, created)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(digest) DO NOTHING`,
  );
  const readAsset = target.query<
    { bytes: Uint8Array; sizeBytes: number },
    [string]
  >("SELECT bytes, size_bytes AS sizeBytes FROM assets WHERE digest = ?");
  const updateEntity = target.query<
    unknown,
    [string, string, string, string, string]
  >(
    `UPDATE entities
     SET content = ?, contentHash = ?, metadata = ?
     WHERE id = ? AND entityType = ?`,
  );
  const deleteFts = target.query<unknown, [string, string]>(
    "DELETE FROM entity_fts WHERE entity_id = ? AND entity_type = ?",
  );

  let imageRows = 0;
  let decodedBytes = 0;
  for (const row of sourceRows(source)) {
    const parsed = parseImageDataUrl(row.content);
    const digest = sha256Bytes(parsed.bytes);
    const reference = `${ASSET_PREFIX}${digest}`;
    target.run("BEGIN IMMEDIATE");
    try {
      insertAsset.run(
        digest,
        parsed.bytes,
        parsed.bytes.byteLength,
        Date.now(),
      );
      const stored = readAsset.get(digest);
      if (
        stored?.sizeBytes !== parsed.bytes.byteLength ||
        sha256Bytes(stored.bytes) !== digest
      ) {
        throw new Error(`Stored asset verification failed for ${row.id}`);
      }
      updateEntity.run(
        reference,
        sha256Text(reference),
        updateMetadata(row.metadata, parsed.mediaType, parsed.bytes.byteLength),
        row.id,
        row.entityType,
      );
      deleteFts.run(row.id, row.entityType);
      target.run("COMMIT");
    } catch (error) {
      target.run("ROLLBACK");
      throw error;
    }
    imageRows++;
    decodedBytes += parsed.bytes.byteLength;
  }
  // Merge away the deleted image term segments before measuring compaction.
  target.run("INSERT INTO entity_fts(entity_fts) VALUES ('optimize')");
  return { imageRows, decodedBytes, atomicRollbackPassed };
}

function removeImageFts(db: Database): void {
  db.run("DELETE FROM entity_fts WHERE entity_type = ?", [IMAGE_ENTITY_TYPE]);
  const remaining =
    db
      .query<{ count: number }, [string]>(
        "SELECT COUNT(*) AS count FROM entity_fts WHERE entity_type = ?",
      )
      .get(IMAGE_ENTITY_TYPE)?.count ?? 0;
  if (remaining !== 0) {
    throw new Error(
      `Expected no image FTS rows after deletion, found ${remaining}`,
    );
  }
  // FTS5 deletions append tombstones; without optimize, a later VACUUM keeps
  // the old term segments and can make the index larger than the baseline.
  db.run("INSERT INTO entity_fts(entity_fts) VALUES ('optimize')");
}

function checkpoint(db: Database): void {
  db.query("PRAGMA wal_checkpoint(TRUNCATE)").get();
}

function quickCheck(db: Database): string {
  const result = db
    .query<{ quick_check: string }, []>("PRAGMA quick_check")
    .get();
  return result?.quick_check ?? "missing-result";
}

function imageRowCount(db: Database): number {
  return (
    db
      .query<{ count: number }, [string]>(
        "SELECT COUNT(*) AS count FROM entities WHERE entityType = ?",
      )
      .get(IMAGE_ENTITY_TYPE)?.count ?? 0
  );
}

function assetRowCount(db: Database): number {
  const table = db
    .query<{ count: number }, []>(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'assets'",
    )
    .get();
  if (table?.count !== 1) return 0;
  return (
    db
      .query<{ count: number }, []>("SELECT COUNT(*) AS count FROM assets")
      .get()?.count ?? 0
  );
}

function sumEntityContentBytes(db: Database): number {
  return (
    db
      .query<{ bytes: number }, [string]>(
        "SELECT COALESCE(SUM(length(CAST(content AS BLOB))), 0) AS bytes FROM entities WHERE entityType = ?",
      )
      .get(IMAGE_ENTITY_TYPE)?.bytes ?? 0
  );
}

function sumAssetBytes(db: Database): number {
  if (assetRowCount(db) === 0) return 0;
  return (
    db
      .query<{ bytes: number }, []>(
        "SELECT COALESCE(SUM(size_bytes), 0) AS bytes FROM assets",
      )
      .get()?.bytes ?? 0
  );
}

function materializeEntityList(db: Database): number {
  const rows = db
    .query<SourceEntityRow, [string]>(
      `SELECT id, entityType, content, contentHash, metadata, created, updated, visibility
       FROM entities
       WHERE entityType = ?
       ORDER BY id`,
    )
    .all(IMAGE_ENTITY_TYPE);
  return rows.reduce(
    (total, row) => total + Buffer.byteLength(row.content, "utf8"),
    0,
  );
}

function readExplicitBinaryBytes(
  db: Database,
  variant: StorageVariant,
): number {
  let bytes = 0;
  if (variant === "sqlite-blob") {
    for (const row of db
      .query<{ bytes: Uint8Array }, []>(
        "SELECT bytes FROM assets ORDER BY digest",
      )
      .iterate()) {
      bytes += row.bytes.byteLength;
    }
    return bytes;
  }
  for (const row of db
    .query<{ content: string }, [string]>(
      "SELECT content FROM entities WHERE entityType = ? ORDER BY id",
    )
    .iterate(IMAGE_ENTITY_TYPE)) {
    bytes += parseImageDataUrl(row.content).bytes.byteLength;
  }
  return bytes;
}

function verifyVariantDigests(
  db: Database,
  variant: StorageVariant,
): { passed: boolean; missingAssetReferences: number } {
  if (variant !== "sqlite-blob") {
    for (const row of db
      .query<{ content: string }, [string]>(
        "SELECT content FROM entities WHERE entityType = ?",
      )
      .iterate(IMAGE_ENTITY_TYPE)) {
      const parsed = parseImageDataUrl(row.content);
      if (sha256Bytes(parsed.bytes).length !== 64) {
        return { passed: false, missingAssetReferences: 0 };
      }
    }
    return { passed: true, missingAssetReferences: 0 };
  }

  let passed = true;
  for (const row of db
    .query<{ digest: string; bytes: Uint8Array; sizeBytes: number }, []>(
      "SELECT digest, bytes, size_bytes AS sizeBytes FROM assets",
    )
    .iterate()) {
    if (
      row.bytes.byteLength !== row.sizeBytes ||
      sha256Bytes(row.bytes) !== row.digest
    ) {
      passed = false;
    }
  }
  const missing =
    db
      .query<{ count: number }, [number, string]>(
        `SELECT COUNT(*) AS count
         FROM entities AS e
         LEFT JOIN assets AS a
           ON a.digest = substr(e.content, ?)
         WHERE e.entityType = ?
           AND (e.content NOT LIKE 'asset://sha256/%' OR a.digest IS NULL)`,
      )
      .get(ASSET_PREFIX.length + 1, IMAGE_ENTITY_TYPE)?.count ?? 0;
  return { passed: passed && missing === 0, missingAssetReferences: missing };
}

function elapsed(start: number): number {
  return Math.round((performance.now() - start) * 100) / 100;
}

async function runVariantWorker(
  options: WorkerOptions,
): Promise<VariantResult> {
  const variant = options.variant;
  if (!variant) throw new Error("Variant worker requires a variant");
  await mkdir(options.outputDir, { recursive: true });
  const databasePath = join(options.outputDir, `${variant}.db`);
  const backupPath = join(options.outputDir, `${variant}.backup.db`);
  await removeDatabaseFiles(databasePath);
  await removeDatabaseFiles(backupPath);

  let started = performance.now();
  await cloneFile(options.snapshotDb, databasePath);
  const copyMs = elapsed(started);
  const databaseBytesBeforeMutation = await fileSize(databasePath);

  const source = new Database(options.snapshotDb, {
    readonly: true,
    strict: true,
  });
  const db = new Database(databasePath, {
    create: false,
    readwrite: true,
    strict: true,
  });
  configureWritableDatabase(db);

  let mutationRows = imageRowCount(db);
  let atomicRollbackPassed: boolean | null = null;
  started = performance.now();
  if (variant === "base64-no-image-fts") {
    removeImageFts(db);
  } else if (variant === "sqlite-blob") {
    const migrated = migrateImagesToBlobs(source, db);
    mutationRows = migrated.imageRows;
    atomicRollbackPassed = migrated.atomicRollbackPassed;
  }
  const mutationMs = elapsed(started);
  const walBytesAfterMutation = await fileSize(`${databasePath}-wal`);

  started = performance.now();
  checkpoint(db);
  const checkpointMs = elapsed(started);
  const databaseBytesAfterCheckpoint = await fileSize(databasePath);

  started = performance.now();
  db.run("VACUUM");
  checkpoint(db);
  const vacuumMs = elapsed(started);
  const compactDatabaseBytes = await fileSize(databasePath);

  started = performance.now();
  const materializedEntityContentBytes = materializeEntityList(db);
  const entityListMs = elapsed(started);

  started = performance.now();
  const explicitBinaryReadBytes = readExplicitBinaryBytes(db, variant);
  const explicitBinaryReadMs = elapsed(started);

  const imageRows = imageRowCount(db);
  if (imageRows !== mutationRows) {
    throw new Error(
      `Image row count changed from ${mutationRows} to ${imageRows}`,
    );
  }
  const assetRows = assetRowCount(db);
  const storedBinaryBytes =
    variant === "sqlite-blob" ? sumAssetBytes(db) : explicitBinaryReadBytes;
  const entityContentBytes = sumEntityContentBytes(db);
  const quickCheckResult = quickCheck(db);
  const digestResult = verifyVariantDigests(db, variant);

  started = performance.now();
  db.run("VACUUM INTO ?", [backupPath]);
  const backupMs = elapsed(started);
  const backupBytes = await fileSize(backupPath);

  source.close();
  db.close();

  started = performance.now();
  const backup = new Database(backupPath, { readonly: true, strict: true });
  const backupQuickCheck = quickCheck(backup);
  const backupDigestResult = verifyVariantDigests(backup, variant);
  backup.close();
  const backupVerifyMs = elapsed(started);

  const usage = process.resourceUsage();
  const result: VariantResult = {
    variant,
    imageRows,
    assetRows,
    deduplicatedAssets:
      variant === "sqlite-blob" ? Math.max(0, imageRows - assetRows) : 0,
    storedBinaryBytes,
    entityContentBytes,
    databaseBytesBeforeMutation,
    databaseBytesAfterCheckpoint,
    compactDatabaseBytes,
    walBytesAfterMutation,
    backupBytes,
    materializedEntityContentBytes,
    explicitBinaryReadBytes,
    quickCheck:
      quickCheckResult === "ok" && backupQuickCheck === "ok"
        ? "ok"
        : `${quickCheckResult}; backup=${backupQuickCheck}`,
    digestVerificationPassed: digestResult.passed && backupDigestResult.passed,
    missingAssetReferences: Math.max(
      digestResult.missingAssetReferences,
      backupDigestResult.missingAssetReferences,
    ),
    atomicRollbackPassed,
    maxRssBytes: usage.maxRSS * 1024,
    timings: {
      copyMs,
      mutationMs,
      checkpointMs,
      vacuumMs,
      entityListMs,
      explicitBinaryReadMs,
      backupMs,
      backupVerifyMs,
    },
  };

  if (!options.keepArtifacts) {
    await removeDatabaseFiles(databasePath);
    await removeDatabaseFiles(backupPath);
  }
  return result;
}

function deterministicProbeBytes(sizeBytes: number): Buffer {
  const bytes = Buffer.allocUnsafe(sizeBytes);
  const pattern = Buffer.from("yeehaa.io-sqlite-asset-probe\n", "utf8");
  for (
    let offset = 0;
    offset < bytes.byteLength;
    offset += pattern.byteLength
  ) {
    pattern.copy(
      bytes,
      offset,
      0,
      Math.min(pattern.byteLength, bytes.byteLength - offset),
    );
  }
  return bytes;
}

async function runBlobProbeWorker(
  options: WorkerOptions,
): Promise<BlobProbeResult> {
  const sizeBytes = options.probeSizeBytes;
  if (!sizeBytes) throw new Error("BLOB probe requires a byte size");
  await mkdir(options.outputDir, { recursive: true });
  const databasePath = join(options.outputDir, `blob-probe-${sizeBytes}.db`);
  await removeDatabaseFiles(databasePath);

  const db = new Database(databasePath, { create: true, strict: true });
  db.run(`
    CREATE TABLE entities (
      id TEXT NOT NULL,
      entityType TEXT NOT NULL,
      content TEXT NOT NULL,
      contentHash TEXT NOT NULL,
      metadata TEXT NOT NULL,
      created INTEGER NOT NULL,
      updated INTEGER NOT NULL,
      visibility TEXT NOT NULL,
      PRIMARY KEY (id, entityType)
    )
  `);
  createAssetsTable(db);
  configureWritableDatabase(db);
  const atomicRollbackPassed = verifyAtomicRollback(db);
  if (!atomicRollbackPassed) throw new Error("BLOB probe rollback failed");

  const bytes = deterministicProbeBytes(sizeBytes);
  const digest = sha256Bytes(bytes);
  const reference = `${ASSET_PREFIX}${digest}`;
  let started = performance.now();
  db.run("BEGIN IMMEDIATE");
  try {
    db.run(
      "INSERT INTO assets (digest, bytes, size_bytes, created) VALUES (?, ?, ?, ?)",
      [digest, bytes, bytes.byteLength, Date.now()],
    );
    db.run(
      `INSERT INTO entities
       (id, entityType, content, contentHash, metadata, created, updated, visibility)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `probe-${sizeBytes}`,
        IMAGE_ENTITY_TYPE,
        reference,
        sha256Text(reference),
        JSON.stringify({ sizeBytes }),
        Date.now(),
        Date.now(),
        "restricted",
      ],
    );
    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  }
  const insertMs = elapsed(started);
  const walBytesAfterInsert = await fileSize(`${databasePath}-wal`);

  started = performance.now();
  checkpoint(db);
  const checkpointMs = elapsed(started);

  started = performance.now();
  const stored = db
    .query<{ digest: string; bytes: Uint8Array; sizeBytes: number }, [string]>(
      "SELECT digest, bytes, size_bytes AS sizeBytes FROM assets WHERE digest = ?",
    )
    .get(digest);
  const digestVerified =
    stored?.sizeBytes === sizeBytes &&
    stored.bytes.byteLength === sizeBytes &&
    sha256Bytes(stored.bytes) === stored.digest;
  const verifyMs = elapsed(started);
  const databaseBytes = await fileSize(databasePath);
  db.close();

  const result: BlobProbeResult = {
    sizeBytes,
    insertMs,
    checkpointMs,
    verifyMs,
    databaseBytes,
    walBytesAfterInsert,
    maxRssBytes: process.resourceUsage().maxRSS * 1024,
    digestVerified,
    atomicRollbackPassed,
  };
  if (!options.keepArtifacts) await removeDatabaseFiles(databasePath);
  return result;
}

async function directoryDigestSummary(corpusDir: string): Promise<{
  files: number;
  bytes: number;
  digests: Set<string>;
  maxBytes: number;
}> {
  const entries = await readdir(corpusDir, { withFileTypes: true });
  let files = 0;
  let bytes = 0;
  let maxBytes = 0;
  const digests = new Set<string>();
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    if (!entry.isFile() || !IMAGE_FILE_PATTERN.test(entry.name)) continue;
    const path = join(corpusDir, entry.name);
    const size = await fileSize(path);
    files++;
    bytes += size;
    maxBytes = Math.max(maxBytes, size);
    digests.add(await sha256File(path));
  }
  return { files, bytes, digests, maxBytes };
}

async function summarizeSource(
  snapshotDb: string,
  corpusDir: string,
): Promise<SourceSummary> {
  const db = new Database(snapshotDb, { readonly: true, strict: true });
  let imageRows = 0;
  let encodedContentBytes = 0;
  let decodedContentBytes = 0;
  let maxEncodedContentBytes = 0;
  let maxDecodedContentBytes = 0;
  const databaseDigests = new Set<string>();
  for (const row of sourceRows(db)) {
    const encodedBytes = Buffer.byteLength(row.content, "utf8");
    const parsed = parseImageDataUrl(row.content);
    imageRows++;
    encodedContentBytes += encodedBytes;
    decodedContentBytes += parsed.bytes.byteLength;
    maxEncodedContentBytes = Math.max(maxEncodedContentBytes, encodedBytes);
    maxDecodedContentBytes = Math.max(
      maxDecodedContentBytes,
      parsed.bytes.byteLength,
    );
    databaseDigests.add(sha256Bytes(parsed.bytes));
  }
  const imageFtsRows =
    db
      .query<{ count: number }, [string]>(
        "SELECT COUNT(*) AS count FROM entity_fts WHERE entity_type = ?",
      )
      .get(IMAGE_ENTITY_TYPE)?.count ?? 0;
  db.close();

  const corpus = await directoryDigestSummary(corpusDir);
  const databaseDigestsMissingFromCorpus = [...databaseDigests].filter(
    (digest) => !corpus.digests.has(digest),
  ).length;
  const corpusDigestsMissingFromDatabase = [...corpus.digests].filter(
    (digest) => !databaseDigests.has(digest),
  ).length;

  return {
    databaseBytes: await fileSize(snapshotDb),
    databaseSha256: await sha256File(snapshotDb),
    imageRows,
    imageFtsRows,
    encodedContentBytes,
    decodedContentBytes,
    uniqueDecodedDigests: databaseDigests.size,
    maxEncodedContentBytes,
    maxDecodedContentBytes,
    corpusFiles: corpus.files,
    corpusBytes: corpus.bytes,
    corpusUniqueDigests: corpus.digests.size,
    databaseDigestsMissingFromCorpus,
    corpusDigestsMissingFromDatabase,
  };
}

async function spawnWorker<T>(arguments_: string[]): Promise<T> {
  const child = spawn([process.execPath, import.meta.path, ...arguments_], {
    stdout: "pipe",
    stderr: "pipe",
    env: { PATH: process.env.PATH ?? "" },
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(
      `Benchmark worker failed (${exitCode}): ${stderr.trim() || stdout.trim()}`,
    );
  }
  return JSON.parse(stdout) as T;
}

export function formatBytes(bytes: number): string {
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
}

function formatMs(milliseconds: number): string {
  if (milliseconds < 1000) return `${milliseconds.toFixed(2)} ms`;
  return `${(milliseconds / 1000).toFixed(2)} s`;
}

function percentChange(before: number, after: number): string {
  if (before === 0) return "n/a";
  return `${(((after - before) / before) * 100).toFixed(1)}%`;
}

function markdownReport(report: BenchmarkReport): string {
  const current = report.variants.find(
    (variant) => variant.variant === "current-base64-fts",
  );
  const noFts = report.variants.find(
    (variant) => variant.variant === "base64-no-image-fts",
  );
  const blob = report.variants.find(
    (variant) => variant.variant === "sqlite-blob",
  );
  if (!current || !noFts || !blob) throw new Error("Missing benchmark variant");
  const probesPassed = report.blobProbes.every(
    (probe) => probe.digestVerified && probe.atomicRollbackPassed,
  );
  const variantsPassed = report.variants.every(
    (variant) =>
      variant.quickCheck === "ok" &&
      variant.digestVerificationPassed &&
      variant.missingAssetReferences === 0,
  );
  const corpusMatchesDatabase =
    report.source.databaseDigestsMissingFromCorpus === 0 &&
    report.source.corpusDigestsMissingFromDatabase === 0;
  const storageComparison = `Removing image FTS changes the compact database by ${percentChange(current.compactDatabaseBytes, noFts.compactDatabaseBytes)}. Replacing base64 entity content with same-database BLOB assets changes it by ${percentChange(current.compactDatabaseBytes, blob.compactDatabaseBytes)} while reducing the ordinary image-list content payload from ${formatBytes(current.materializedEntityContentBytes)} to ${formatBytes(blob.materializedEntityContentBytes)}.`;

  return `# SQLite Durable Asset Benchmark — ${report.sourceLabel}

Generated: ${report.generatedAt}

## Scope

Read-only source: a stopped local ${report.sourceLabel} database and image corpus. The
benchmark copied the database before opening SQLite and mutated only temporary copies.
Absolute timings are machine-specific; storage, integrity, transaction, and memory results
are the decision evidence.

Runtime: Bun ${report.bunVersion}, ${report.platform}/${report.architecture}.

## Reproduce

    bun scripts/benchmark-sqlite-assets.ts \\
      --source-db <stopped-instance>/data/brain.db \\
      --corpus-dir <stopped-instance>/brain-data/image \\
      --output-dir <temporary-output> \\
      --result-json <evidence.json> \\
      --result-markdown <evidence.md> \\
      --source-label <non-sensitive-label> \\
      --probe-sizes-mb 5,25,50,100

The command refuses a non-empty source WAL, copies the database before opening SQLite,
and removes temporary database/backup artifacts unless \`--keep-artifacts\` is supplied.

## Source corpus

- Database snapshot: ${formatBytes(report.source.databaseBytes)}
- Image entities: ${report.source.imageRows}
- Image FTS rows: ${report.source.imageFtsRows}
- Encoded entity content: ${formatBytes(report.source.encodedContentBytes)}
- Decoded entity bytes: ${formatBytes(report.source.decodedContentBytes)}
- Unique database payloads: ${report.source.uniqueDecodedDigests}
- Synced image files: ${report.source.corpusFiles} (${formatBytes(report.source.corpusBytes)})
- Unique synced payloads: ${report.source.corpusUniqueDigests}
- Database payloads absent from synced corpus: ${report.source.databaseDigestsMissingFromCorpus}
- Synced payloads absent from database: ${report.source.corpusDigestsMissingFromDatabase}
- Largest decoded database image: ${formatBytes(report.source.maxDecodedContentBytes)}

The committed evidence records only aggregate sizes and SHA-256 inventory comparisons,
never image bytes, data URLs, filenames, or the local source path.

## Full-database variants

Each variant starts from the same database snapshot, uses WAL with \`synchronous=FULL\`,
checkpoints, vacuums, creates a SQLite-safe \`VACUUM INTO\` backup, reopens it read-only,
runs \`PRAGMA quick_check\`, and verifies binary digests.

| Variant | Compact DB | Change vs current | Backup | Migration WAL | Entity list payload | Peak RSS | Mutation | Backup + verify |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${report.variants
  .map(
    (variant) =>
      `| ${variant.variant} | ${formatBytes(variant.compactDatabaseBytes)} | ${percentChange(current.compactDatabaseBytes, variant.compactDatabaseBytes)} | ${formatBytes(variant.backupBytes)} | ${formatBytes(variant.walBytesAfterMutation)} | ${formatBytes(variant.materializedEntityContentBytes)} | ${formatBytes(variant.maxRssBytes)} | ${formatMs(variant.timings.mutationMs)} | ${formatMs(variant.timings.backupMs + variant.timings.backupVerifyMs)} |`,
  )
  .join("\n")}

### Integrity

| Variant | quick_check | Digests | Missing refs | Asset rows | Deduplicated references | Atomic rollback |
| --- | --- | --- | ---: | ---: | ---: | --- |
${report.variants
  .map(
    (variant) =>
      `| ${variant.variant} | ${variant.quickCheck} | ${variant.digestVerificationPassed ? "pass" : "FAIL"} | ${variant.missingAssetReferences} | ${variant.assetRows} | ${variant.deduplicatedAssets} | ${variant.atomicRollbackPassed === null ? "n/a" : variant.atomicRollbackPassed ? "pass" : "FAIL"} |`,
  )
  .join("\n")}

${storageComparison}

FTS5 deletion appends tombstone segments. The benchmark therefore runs the FTS5
\`optimize\` command before \`VACUUM\`; without it, deleting image rows retained the old
term segments and temporarily enlarged the index.

The benchmark disables automatic WAL checkpoints to expose worst-case migration disk
pressure. The SQLite BLOB migration reached
${formatBytes(blob.walBytesAfterMutation)} of WAL, so production tooling must checkpoint
between bounded groups of already-committed entity migrations rather than allowing the
whole corpus to accumulate in WAL.

## BLOB size probes

Each probe binds deterministic bytes, inserts the asset and entity reference in one
transaction, checkpoints, rereads and hashes the BLOB, and separately proves rollback
removes both rows.

| BLOB | Insert | Checkpoint | Verify | WAL | DB | Peak RSS | Result |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
${report.blobProbes
  .map(
    (probe) =>
      `| ${formatBytes(probe.sizeBytes)} | ${formatMs(probe.insertMs)} | ${formatMs(probe.checkpointMs)} | ${formatMs(probe.verifyMs)} | ${formatBytes(probe.walBytesAfterInsert)} | ${formatBytes(probe.databaseBytes)} | ${formatBytes(probe.maxRssBytes)} | ${probe.digestVerified && probe.atomicRollbackPassed ? "pass" : "FAIL"} |`,
  )
  .join("\n")}

## Decision gate

- Full database variants pass integrity and backup verification: **${variantsPassed ? "yes" : "NO"}**
- Asset/entity rollback is atomic: **${blob.atomicRollbackPassed ? "yes" : "NO"}**
- All configured BLOB size probes pass: **${probesPassed ? "yes" : "NO"}**
- Largest tested BLOB: **${formatBytes(Math.max(...report.blobProbes.map((probe) => probe.sizeBytes)))}**
- Database and synced-corpus digest inventories match: **${corpusMatchesDatabase ? "yes" : "NO"}**

${variantsPassed && blob.atomicRollbackPassed && probesPassed ? `The benchmark supports proceeding to the same-database SQLite asset foundation. It does not authorize a yeehaa.io migration: preflight must first reconcile ${report.source.databaseDigestsMissingFromCorpus} database payloads absent from the synced corpus and ${report.source.corpusDigestsMissingFromDatabase} synced payloads absent from the database. The implementation must retain the measured byte limit, transaction boundary, FTS optimization, bounded WAL checkpoints, and verified single-database backup/restore checks.` : "The benchmark does not pass the revised plan's storage decision gate. Do not begin the foundation implementation until the failed integrity, transaction, or BLOB-size result is resolved."}
`;
}

async function ensureStoppedSnapshot(
  sourceDb: string,
  snapshotDb: string,
): Promise<void> {
  const before = await stat(sourceDb);
  const walPath = `${sourceDb}-wal`;
  const walBefore = await fileSize(walPath);
  if (walBefore !== 0) {
    throw new Error(
      `Source WAL is not empty (${walBefore} bytes). Stop/checkpoint the application before benchmarking.`,
    );
  }
  await cloneFile(sourceDb, snapshotDb);
  const after = await stat(sourceDb);
  const walAfter = await fileSize(walPath);
  if (
    before.size !== after.size ||
    before.mtimeMs !== after.mtimeMs ||
    walAfter !== 0
  ) {
    await rm(snapshotDb, { force: true });
    throw new Error(
      "Source database changed while the benchmark snapshot was copied",
    );
  }
}

async function runBenchmark(options: CliOptions): Promise<BenchmarkReport> {
  await mkdir(options.outputDir, { recursive: true });
  await mkdir(dirname(options.resultJson), { recursive: true });
  await mkdir(dirname(options.resultMarkdown), { recursive: true });
  const snapshotDb = join(options.outputDir, "source-snapshot.db");
  await ensureStoppedSnapshot(options.sourceDb, snapshotDb);

  try {
    const source = await summarizeSource(snapshotDb, options.corpusDir);
    const variants: VariantResult[] = [];
    for (const variant of [
      "current-base64-fts",
      "base64-no-image-fts",
      "sqlite-blob",
    ] as const) {
      console.error(`Running ${variant}...`);
      variants.push(
        await spawnWorker<VariantResult>([
          "--worker-mode",
          "variant",
          "--variant",
          variant,
          "--snapshot-db",
          snapshotDb,
          "--output-dir",
          options.outputDir,
          ...(options.keepArtifacts ? ["--keep-artifacts"] : []),
        ]),
      );
    }

    const blobProbes: BlobProbeResult[] = [];
    for (const sizeMb of options.probeSizesMb) {
      console.error(`Running ${sizeMb} MiB BLOB probe...`);
      blobProbes.push(
        await spawnWorker<BlobProbeResult>([
          "--worker-mode",
          "blob-probe",
          "--probe-size-bytes",
          String(sizeMb * 1024 * 1024),
          "--snapshot-db",
          snapshotDb,
          "--output-dir",
          options.outputDir,
          ...(options.keepArtifacts ? ["--keep-artifacts"] : []),
        ]),
      );
    }

    const report: BenchmarkReport = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      sourceLabel: options.sourceLabel,
      bunVersion: Bun.version,
      platform: process.platform,
      architecture: process.arch,
      source,
      variants,
      blobProbes,
    };
    await writeFile(
      options.resultJson,
      `${JSON.stringify(report, null, 2)}\n`,
      {
        mode: 0o600,
      },
    );
    await writeFile(options.resultMarkdown, markdownReport(report), {
      mode: 0o600,
    });
    return report;
  } finally {
    if (!options.keepArtifacts) await removeDatabaseFiles(snapshotDb);
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help")) {
    console.log(usage());
    return;
  }
  const flags = parseFlags(argv);
  if (flags.has("worker-mode")) {
    const worker = parseWorkerOptions(argv);
    const result =
      worker.mode === "variant"
        ? await runVariantWorker(worker)
        : await runBlobProbeWorker(worker);
    console.log(JSON.stringify(result));
    return;
  }

  const options = parseCliOptions(argv);
  const report = await runBenchmark(options);
  console.log(
    `Benchmark complete: ${basename(options.resultMarkdown)} (${report.source.imageRows} image rows)`,
  );
}

if (import.meta.main) {
  await main();
}
