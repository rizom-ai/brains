import { afterEach, describe, expect, test } from "bun:test";
import { createClient, type Client } from "@libsql/client";
import { closeSqliteClient, createSqliteDatabase } from "@brains/db";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { existsSync } from "node:fs";
import {
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { importBackup } from "../src/import-backup";
import { fileSha256 } from "../src/verify";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

const sources = [
  ["brain.db", "entity-service"],
  ["brain-jobs.db", "job-queue"],
  ["conversations.db", "conversation-service"],
  ["runtime-state.db", "runtime-state"],
  ["auth.db", "auth-service"],
] as const;

// Freeze the source schema: adding a 0.3 migration must not advance this fixture.
const sourceSchemaCutoffs = {
  "entity-service": 1787937772304, // 0010_happy_the_enforcers
  "job-queue": 1786601363780, // 0004_loose_magneto
  "conversation-service": 1784877204759, // 0002_dear_ultimatum
  "runtime-state": 1781628919983, // 0000_tidy_jackal
  "auth-service": 1786606188029, // 0011_vengeful_raider
} as const;

async function seed(
  client: Client,
  name: string,
  processing: boolean,
): Promise<void> {
  if (name === "brain.db") {
    await client.batch(
      Array.from({ length: 407 }, (_, i) => ({
        sql: "INSERT INTO entities (id, entityType, content, contentHash, visibility, metadata, created, updated) VALUES (?, 'note', ?, ?, 'restricted', '{}', 1, 1)",
        args: [
          `note-${String(i).padStart(6, "0")}`,
          `Café corpus entry ${i}`,
          `hash-${i}`,
        ],
      })),
    );
    await client.executeMultiple(
      "CREATE VIRTUAL TABLE entity_fts USING fts5(entity_id UNINDEXED, content); INSERT INTO entity_fts VALUES ('note-000000', 'Café corpus entry 0');",
    );
  } else if (name === "brain-jobs.db") {
    await client.execute({
      sql: "INSERT INTO job_queue (id, type, data, metadata, status, createdAt, scheduledFor) VALUES ('pending-job', 'fixture:job', '{}', '{}', ?, 1, 1)",
      args: [processing ? "processing" : "pending"],
    });
  } else if (name === "conversations.db") {
    await client.executeMultiple(`
      INSERT INTO conversations (id, session_id, interface_type, started, last_active, created, updated, channel_id) VALUES ('conversation', 'session', 'chat', '2026-01-01', '2026-01-01', '2026-01-01', '2026-01-01', 'channel');
      INSERT INTO messages (id, conversation_id, role, content, timestamp) VALUES ('message', 'conversation', 'user', 'Remember this conversation', '2026-01-01');
    `);
  } else if (name === "runtime-state.db") {
    await client.execute(
      "INSERT INTO runtime_state_records VALUES ('fixture', 'key', '{\"value\":42}', 1, 1)",
    );
    await client.execute(
      "CREATE TABLE migration_binary_probe (id TEXT PRIMARY KEY NOT NULL, payload BLOB NOT NULL)",
    );
    await client.execute({
      sql: "INSERT INTO migration_binary_probe VALUES ('blob', ?)",
      args: [new Uint8Array([0, 1, 128, 255])],
    });
  } else {
    await client.executeMultiple(`
      INSERT INTO auth_people (id, display_name, created_at, updated_at) VALUES ('person', 'Test operator', 1, 1);
      INSERT INTO auth_users (id, person_id, display_name, role, status, created_at, updated_at) VALUES ('user', 'person', 'Test operator', 'admin', 'active', 1, 1);
      INSERT INTO passkey_credentials (id, user_id, public_key, counter, credential_backed_up, created_at, updated_at) VALUES ('credential', 'user', 'fixture-public-key', 5, 0, 1, 1);
      INSERT INTO oauth_signing_keys (kid, purpose, private_jwk, status, created_at) VALUES ('key', 'oauth', '{"fixture":"preserve-private-material"}', 'active', 1);
    `);
  }
}

async function snapshot(
  processing = false,
): Promise<{ root: string; backup: string; destination: string }> {
  const root = await mkdtemp(join(tmpdir(), "db migration "));
  roots.push(root);
  const backup = join(root, "backup");
  await mkdir(backup);
  for (const [name, service] of sources) {
    const client = createClient({
      url: pathToFileURL(join(backup, name)).href,
    });
    try {
      await client.execute(
        "CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL, created_at NUMERIC)",
      );
      const migrations = readMigrationFiles({
        migrationsFolder: join(
          import.meta.dir,
          "../../../shell",
          service,
          "drizzle",
        ),
      });
      // 0.2 entity schema predates embedding consolidation and portable search.
      const legacyMigrations = migrations.filter(
        (migration) => migration.folderMillis <= sourceSchemaCutoffs[service],
      );
      for (const migration of legacyMigrations) {
        await client.migrate([
          ...migration.sql,
          {
            sql: "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
            args: [migration.hash, migration.folderMillis],
          },
        ]);
      }
      await seed(client, name, processing);
    } finally {
      await closeSqliteClient(client);
    }
  }
  await writeManifest(backup);
  return { root, backup, destination: join(root, "new state") };
}

async function writeManifest(backup: string): Promise<void> {
  const databases = [];
  for (const [name] of sources) {
    const path = join(backup, name);
    databases.push({
      name,
      status: "captured",
      quickCheck: "ok",
      bytes: Bun.file(path).size,
      sha256: await fileSha256(path),
    });
  }
  const path = join(backup, "manifest.json");
  await writeFile(
    path,
    JSON.stringify({
      schemaVersion: 1,
      outcome: "verified",
      sourceVersion: "0.2.0",
      snapshotId: "fixture",
      databases,
    }),
  );
  await writeFile(
    join(backup, "manifest-checksum.txt"),
    `${await fileSha256(path)}  manifest.json\n`,
  );
  const artifacts = [
    ...sources.map(([name]) => name),
    "manifest-checksum.txt",
    "manifest.json",
  ].sort();
  const checksums = await Promise.all(
    artifacts.map(
      async (name) => `${await fileSha256(join(backup, name))}  ${name}`,
    ),
  );
  await writeFile(join(backup, "manifest.sha256"), `${checksums.join("\n")}\n`);
}

async function failedImport(
  backup: string,
  destination: string,
): Promise<unknown> {
  return importBackup({
    backupDirectory: backup,
    destination,
    sourceStopped: true,
  }).then(
    () => undefined,
    (error: unknown) => error,
  );
}

async function run(command: string[], cwd: string): Promise<string> {
  const child = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code !== 0)
    throw new Error(`Command failed: ${command.join(" ")}\n${stderr}`);
  return stdout;
}

describe("offline database import", () => {
  test("runs the packed CLI outside the monorepo with its own migration assets", async () => {
    const { root, backup, destination } = await snapshot();
    const packageRoot = join(import.meta.dir, "..");
    await run(["bun", "run", "build"], packageRoot);
    const tarballs = join(root, "tarballs");
    await mkdir(tarballs);
    await run(
      ["bun", "pm", "pack", "--destination", tarballs, "--quiet"],
      packageRoot,
    );
    const tarball = (await readdir(tarballs)).find((file) =>
      file.endsWith(".tgz"),
    );
    if (!tarball) throw new Error("Missing packed importer");
    const consumer = join(root, "consumer");
    await mkdir(consumer);
    await writeFile(
      join(consumer, "package.json"),
      JSON.stringify({
        private: true,
        dependencies: {
          "@rizom/db-migration": `file:${join(tarballs, tarball)}`,
        },
      }),
    );
    await run(["bun", "install"], consumer);
    const output = await run(
      [
        "bun",
        "node_modules/@rizom/db-migration/dist/brain-db-migrate.js",
        "--backup",
        backup,
        "--destination",
        destination,
        "--source-stopped",
      ],
      consumer,
    );
    expect(output).toContain("Databases verified:");
    expect(existsSync(join(destination, "import-report.json"))).toBe(true);
    expect(existsSync(join(consumer, "node_modules", "@rizom", "brain"))).toBe(
      false,
    );
  });

  test("honors cancellation before creating any output", async () => {
    const { backup, destination } = await snapshot();
    const controller = new AbortController();
    controller.abort(new Error("operator cancelled"));
    const failure = await importBackup({
      backupDirectory: backup,
      destination,
      sourceStopped: true,
      signal: controller.signal,
    }).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(existsSync(destination)).toBe(false);
    expect(existsSync(`${destination}.import-lock`)).toBe(false);
  });
  test("imports all five databases, verifies durable state, and leaves the source byte-identical", async () => {
    const { backup, destination } = await snapshot();
    const original = await Promise.all(
      sources.map(([name]) => fileSha256(join(backup, name))),
    );
    expect(
      await importBackup({
        backupDirectory: backup,
        destination,
        sourceStopped: true,
      }),
    ).toBe(destination);
    expect(
      await Promise.all(
        sources.map(([name]) => fileSha256(join(backup, name))),
      ),
    ).toEqual(original);
    expect(existsSync(join(destination, "embeddings.db"))).toBe(false);
    const report = JSON.parse(
      await readFile(join(destination, "import-report.json"), "utf8"),
    );
    expect(report).toMatchObject({
      outcome: "databases-verified",
      engine: "turso",
      contentAndConfigurationRestoreRequired: true,
    });
    for (const [name] of sources) {
      const path = join(
        destination,
        name === "auth.db" ? "auth/auth.db" : name,
      );
      const { client } = createSqliteDatabase({
        url: pathToFileURL(path).href,
        schema: {},
      });
      try {
        if (name === "brain.db") {
          const result = await client.execute(
            "SELECT count(*) AS count FROM entities",
          );
          expect(result.rows[0]?.["count"]).toBe(407);
          expect(
            (
              await client.execute(
                "SELECT name FROM sqlite_master WHERE name = 'entity_fts'",
              )
            ).rows,
          ).toEqual([]);
        } else if (name === "auth.db") {
          expect(
            (await client.execute("SELECT counter FROM passkey_credentials"))
              .rows[0]?.["counter"],
          ).toBe(5);
        } else if (name === "brain-jobs.db") {
          expect(
            (await client.execute("SELECT status FROM job_queue")).rows[0]?.[
              "status"
            ],
          ).toBe("pending");
        }
      } finally {
        await closeSqliteClient(client);
      }
    }
  });

  test("refuses an existing destination without touching it", async () => {
    const { backup, destination } = await snapshot();
    await mkdir(destination);
    await writeFile(join(destination, "keep"), "untouched");
    expect(await failedImport(backup, destination)).toBeInstanceOf(Error);
    expect(await readFile(join(destination, "keep"), "utf8")).toBe("untouched");
  });

  test("rejects checksum changes before creating output", async () => {
    const { backup, destination } = await snapshot();
    await writeFile(join(backup, "brain.db"), "corrupted snapshot");
    expect(await failedImport(backup, destination)).toBeInstanceOf(Error);
    expect(existsSync(destination)).toBe(false);
    expect(existsSync(`${destination}.import-lock`)).toBe(false);
  });

  test("rejects WAL sidecars even when the main file hash matches", async () => {
    const { backup, destination } = await snapshot();
    await writeFile(join(backup, "brain.db-wal"), "live writes");
    expect(await failedImport(backup, destination)).toBeInstanceOf(Error);
    expect(existsSync(destination)).toBe(false);
  });

  test("fails closed on processing jobs and can retry after operator reconciliation", async () => {
    const { root, backup, destination } = await snapshot(true);
    const original = await fileSha256(join(backup, "brain-jobs.db"));
    expect(await failedImport(backup, destination)).toBeInstanceOf(Error);
    expect(existsSync(destination)).toBe(false);
    expect(existsSync(`${destination}.import-lock`)).toBe(false);
    expect(
      (await readdir(root)).some((name) => name.includes(".incomplete-")),
    ).toBe(true);
    expect(await fileSha256(join(backup, "brain-jobs.db"))).toBe(original);
    // Model the operator providing a newly reconciled and re-verified backup.
    const client = createClient({
      url: pathToFileURL(join(backup, "brain-jobs.db")).href,
    });
    try {
      await client.execute("UPDATE job_queue SET status = 'pending'");
    } finally {
      await closeSqliteClient(client);
    }
    await writeManifest(backup);
    expect(
      await importBackup({
        backupDirectory: backup,
        destination,
        sourceStopped: true,
      }),
    ).toBe(destination);
  });
});
