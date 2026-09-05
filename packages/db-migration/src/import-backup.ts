import { createClient } from "@libsql/client";
import {
  closeSqliteClient,
  createSqliteDatabase,
  runPackageMigrations,
} from "@brains/db";
import { z } from "@brains/utils/zod";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  rmdir,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  checkIntegrity,
  digestTable,
  durableTableEvidence,
  fileSha256,
} from "./verify";

const databases = [
  {
    name: "brain.db",
    output: "brain.db",
    service: "entity-service",
    requiredTables: ["entities"],
  },
  {
    name: "brain-jobs.db",
    output: "brain-jobs.db",
    service: "job-queue",
    requiredTables: ["job_queue"],
  },
  {
    name: "conversations.db",
    output: "conversations.db",
    service: "conversation-service",
    requiredTables: ["conversations", "messages"],
  },
  {
    name: "runtime-state.db",
    output: "runtime-state.db",
    service: "runtime-state",
    requiredTables: ["runtime_state_records"],
  },
  {
    name: "auth.db",
    output: "auth/auth.db",
    service: "auth-service",
    requiredTables: [
      "auth_users",
      "auth_people",
      "passkey_credentials",
      "oauth_signing_keys",
    ],
  },
] as const;

const backupManifestSchema = z.object({
  schemaVersion: z.literal(1),
  outcome: z.literal("verified"),
  sourceVersion: z.string().regex(/^0\.2\./),
  snapshotId: z.string().min(1),
  databases: z.array(
    z.object({
      name: z.enum([
        "brain.db",
        "brain-jobs.db",
        "conversations.db",
        "runtime-state.db",
        "auth.db",
        "embeddings.db",
      ]),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      bytes: z.number().int().positive(),
      status: z.literal("captured"),
      quickCheck: z.literal("ok"),
    }),
  ),
});

export interface ImportBackupOptions {
  backupDirectory: string;
  destination: string;
  /** Operator confirmation: this is a quiesced 0.2 backup, not live database files. */
  sourceStopped: boolean;
  signal?: AbortSignal;
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

async function requireRegularFile(path: string): Promise<void> {
  if (!(await lstat(path)).isFile())
    throw new Error(`Expected a regular, non-symlink file: ${path}`);
}

async function requireNoSidecars(path: string): Promise<void> {
  for (const suffix of ["-wal", "-shm", "-journal", "-tshm"]) {
    if (await exists(`${path}${suffix}`))
      throw new Error(`Snapshot contains a database sidecar: ${path}${suffix}`);
  }
}

function migrationsFolder(service: string): string {
  return fileURLToPath(
    new URL(
      import.meta.url.includes("/dist/")
        ? `./migrations/${service}/`
        : `../../../shell/${service}/drizzle/`,
      import.meta.url,
    ),
  );
}

/** Database-only import. Does not deploy, restore Git, or choose an auth encryption key. */
export async function importBackup(
  options: ImportBackupOptions,
): Promise<string> {
  if (options.sourceStopped !== true)
    throw new Error("A stopped-source backup is required");
  options.signal?.throwIfAborted();
  const source = await realpath(options.backupDirectory);
  const requested = resolve(options.destination);
  const destination = join(
    await realpath(dirname(requested)),
    basename(requested),
  );
  const withinSource = relative(source, destination);
  if (
    !withinSource ||
    (!withinSource.startsWith(
      `..${process.platform === "win32" ? "\\" : "/"}`,
    ) &&
      withinSource !== ".." &&
      !isAbsolute(withinSource))
  ) {
    throw new Error("Destination must be outside the source backup");
  }
  if (await exists(destination))
    throw new Error("Destination already exists; imports never overwrite it");

  const manifestPath = join(source, "manifest.json");
  const checksumPath = join(source, "manifest.sha256");
  await requireRegularFile(manifestPath);
  await requireRegularFile(checksumPath);
  // The 0.2 checksum file lists every snapshot artifact, not just the manifest.
  const manifestEntries = (await readFile(checksumPath, "utf8"))
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = /^([a-f0-9]{64})\s+\*?manifest\.json$/.exec(line);
      return match?.[1] ? [match[1]] : [];
    });
  const expectedManifestHash = manifestEntries[0];
  if (
    manifestEntries.length !== 1 ||
    !expectedManifestHash ||
    (await fileSha256(manifestPath)) !== expectedManifestHash
  ) {
    throw new Error("Backup manifest checksum mismatch");
  }
  const manifest = backupManifestSchema.parse(
    JSON.parse(await readFile(manifestPath, "utf8")),
  );
  const records = new Map(
    manifest.databases.map((record) => [record.name, record]),
  );
  if (records.size !== manifest.databases.length)
    throw new Error("Duplicate database records in backup manifest");
  for (const database of databases) {
    if (!records.has(database.name))
      throw new Error(`Backup is missing ${database.name}`);
  }
  // Verify all declared database files, including the retired derived embedding file.
  for (const record of records.values()) {
    const path = join(source, record.name);
    await requireRegularFile(path);
    await requireNoSidecars(path);
    if (
      (await lstat(path)).size !== record.bytes ||
      (await fileSha256(path)) !== record.sha256
    ) {
      throw new Error(`Backup checksum mismatch: ${record.name}`);
    }
  }

  const lock = `${destination}.import-lock`;
  await mkdir(lock, { mode: 0o700 });
  let stage: string | undefined;
  try {
    if (await exists(destination))
      throw new Error("Destination already exists");
    stage = await mkdtemp(
      join(dirname(destination), `.${basename(destination)}.incomplete-`),
    );
    const evidence = [];
    for (const database of databases) {
      options.signal?.throwIfAborted();
      const path = join(stage, database.output);
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await copyFile(join(source, database.name), path);
      await chmod(path, 0o600);
      const record = records.get(database.name);
      if ((await fileSha256(path)) !== record?.sha256)
        throw new Error(`Source changed during copy: ${database.name}`);
      const url = pathToFileURL(path).href;
      const legacy = createClient({ url, intMode: "bigint" });
      let before;
      try {
        await checkIntegrity(legacy);
        if (database.service === "job-queue") {
          const active = await legacy.execute(
            "SELECT count(*) AS count FROM job_queue WHERE status = 'processing'",
          );
          if (Number(active.rows[0]?.["count"]) !== 0) {
            throw new Error(
              "Backup contains processing jobs. Drain or explicitly reconcile them on 0.2 before recapturing; the importer will not replay side effects.",
            );
          }
        }
        before = await durableTableEvidence(
          legacy,
          database.service === "entity-service",
        );
        const preservedTables = new Set(before.map((table) => table.name));
        for (const required of database.requiredTables) {
          if (!preservedTables.has(required))
            throw new Error(
              `Missing source table: ${database.name}/${required}`,
            );
        }
        if (database.service === "entity-service")
          await legacy.execute("DROP TABLE IF EXISTS entity_fts");
      } finally {
        await closeSqliteClient(legacy);
      }
      options.signal?.throwIfAborted();
      await runPackageMigrations({
        label: database.service,
        config: { url },
        schema: {},
        migrationsFolder: migrationsFolder(database.service),
      });
      const { client } = createSqliteDatabase({ url, schema: {} });
      try {
        await checkIntegrity(client);
        for (const table of before) {
          const after = await digestTable(client, table);
          if (after.count !== table.count || after.sha256 !== table.sha256) {
            throw new Error(
              `Durable content changed during migration: ${database.name}/${table.name}`,
            );
          }
        }
      } finally {
        await closeSqliteClient(client);
      }
      // Turso leaves an empty WAL after TRUNCATE. Remove only that empty file,
      // and only after the exclusive staged handle has durably closed.
      if (
        (await exists(`${path}-wal`)) &&
        (await lstat(`${path}-wal`)).size === 0
      ) {
        await rm(`${path}-wal`);
      }
      await requireNoSidecars(path);
      evidence.push({
        file: database.output,
        sha256: await fileSha256(path),
        tables: before,
      });
    }
    options.signal?.throwIfAborted();
    // Detect source mutation before publishing. We never opened a source DB handle.
    for (const record of records.values()) {
      const path = join(source, record.name);
      await requireRegularFile(path);
      await requireNoSidecars(path);
      if ((await fileSha256(path)) !== record.sha256)
        throw new Error(`Source changed during import: ${record.name}`);
    }
    if ((await fileSha256(manifestPath)) !== expectedManifestHash)
      throw new Error("Source manifest changed during import");
    const report = {
      schemaVersion: 1,
      outcome: "databases-verified",
      engine: "turso",
      sourceSnapshot: manifest.snapshotId,
      sourceVersion: manifest.sourceVersion,
      sourceManifestSha256: expectedManifestHash,
      contentAndConfigurationRestoreRequired: true,
      embeddings: "regenerate-with-runtime-provider",
      processingJobs: "refused",
      databases: evidence,
    };
    await writeFile(
      join(stage, "import-report.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      { mode: 0o600 },
    );
    if (await exists(destination))
      throw new Error(
        "Destination appeared during import; refusing to overwrite it",
      );
    options.signal?.throwIfAborted();
    await rename(stage, destination);
    return destination;
  } catch (error) {
    throw new Error(
      `Database import failed${stage ? `; incomplete output retained at ${stage}` : ""}`,
      { cause: error },
    );
  } finally {
    await rmdir(lock);
  }
}
