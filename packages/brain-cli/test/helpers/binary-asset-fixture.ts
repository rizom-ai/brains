import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openOfflineEntityDatabase } from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { createSilentLogger } from "@brains/test-utils";

export const PNG: Buffer = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
// A second, distinct image: a GIF header is enough to describe it.
export const GIF: Buffer = Buffer.from(
  "R0lGODlhAQABAIAAAP///wAAACwAAAAAAQABAAACAkQBADs=",
  "base64",
);
export const dataUrl = (type: string, bytes: Buffer): string =>
  `data:image/${type};base64,${bytes.toString("base64")}`;

const directories: string[] = [];

/** Remove every database a test created; call from afterEach. */
export async function removeFixtures(): Promise<void> {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true })),
  );
}

/** A stopped app's entity database with inline images in every state. */
export async function fixture(
  rows: Array<[id: string, content: string]>,
  fts: string[] = [],
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "assets-migrate-"));
  directories.push(directory);
  const path = join(directory, "brain.db");
  await migrateEntities({ url: `file:${path}` }, createSilentLogger());
  const client = openOfflineEntityDatabase(path).client;
  try {
    await client.execute(
      "CREATE VIRTUAL TABLE IF NOT EXISTS entity_fts USING fts5(entity_id UNINDEXED, entity_type UNINDEXED, content)",
    );
    await Promise.all(
      rows.map(([id, content]) =>
        client.execute({
          sql: "INSERT INTO entities (id, entityType, content, contentHash, created, updated) VALUES (?, 'image', ?, ?, 1, 2)",
          args: [id, content, `hash-${id}`],
        }),
      ),
    );
    await Promise.all(
      fts.map((id) =>
        client.execute({
          sql: "INSERT INTO entity_fts (entity_id, entity_type, content) VALUES (?, 'image', 'inline')",
          args: [id],
        }),
      ),
    );
  } finally {
    client.close();
  }
  return path;
}

/** When `0013_staged_asset_chunks` was generated, as its journal records it. */
const STAGED_ASSET_MIGRATION_AT = 1792135342713;

/** A database written by main, before the staged asset schema migration. */
export async function mainEraFixture(
  rows: Array<[id: string, content: string]>,
): Promise<string> {
  const path = await fixture(rows);
  const client = openOfflineEntityDatabase(path).client;
  try {
    await client.execute("DROP TABLE database_leases");
    await client.execute("DROP TABLE asset_chunks");
    await client.execute("DROP TABLE assets");
    await client.execute("DROP TABLE asset_uploads");
    await client.execute(
      "CREATE TABLE assets (digest text PRIMARY KEY NOT NULL, bytes blob NOT NULL, size_bytes integer NOT NULL, created integer NOT NULL)",
    );
    // Main's last migration came before the staged asset chunks (0013).
    await client.execute({
      sql: "DELETE FROM __drizzle_migrations WHERE created_at >= ?",
      args: [STAGED_ASSET_MIGRATION_AT],
    });
  } finally {
    client.close();
  }
  return path;
}

/**
 * A lease another process left on the database: fresh by default, as a
 * running brain in another container keeps it; `ageMs` back-dates its last
 * heartbeat, so an hour-old one is what a crash leaves.
 */
export async function leaseFrom(
  path: string,
  lease: {
    role?: "brain" | "maintenance";
    command?: string;
    hostname?: string;
    pid?: number;
    ageMs?: number;
  } = {},
): Promise<void> {
  const heartbeatAt = Date.now() - (lease.ageMs ?? 1_000);
  const client = openOfflineEntityDatabase(path).client;
  try {
    await client.execute({
      sql: "INSERT INTO database_leases (id, role, command, hostname, pid, started_at, heartbeat_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      args: [
        crypto.randomUUID(),
        lease.role ?? "brain",
        lease.command ?? null,
        lease.hostname ?? "brain-container",
        lease.pid ?? 41,
        heartbeatAt - 60_000,
        heartbeatAt,
        heartbeatAt + 60_000,
      ],
    });
  } finally {
    client.close();
  }
}

/** No other process holds the database: the app is stopped. */
export const stopped = { findHolders: async (): Promise<number[]> => [] };

/** The size of a database's write-ahead log; 0 when it has none. */
export async function walBytes(path: string): Promise<number> {
  const wal = Bun.file(`${path}-wal`);
  return (await wal.exists()) ? wal.size : 0;
}

const samplers = new Set<Bun.Subprocess>();

/** End every sampler a test started; call from afterEach. */
export async function stopWalSamplers(): Promise<void> {
  const running = [...samplers];
  samplers.clear();
  for (const sampler of running) sampler.kill();
  await Promise.all(running.map((sampler) => sampler.exited));
}

/**
 * Sample a database's write-ahead log from another process while a run
 * holds this one's event loop; `stop` resolves to the largest size seen.
 * A test that ends before calling `stop` leaves it to stopWalSamplers.
 */
export function sampleWalPeak(path: string): { stop(): Promise<number> } {
  const sampler = Bun.spawn(
    [
      process.execPath,
      "-e",
      `const { statSync } = require("node:fs");
       let peak = 0;
       const sample = () => { try { peak = Math.max(peak, statSync(process.argv[1]).size); } catch {} };
       const timer = setInterval(sample, 1);
       process.stdin.on("data", () => { clearInterval(timer); sample(); process.stdout.write(String(peak)); process.exit(0); });`,
      `${path}-wal`,
    ],
    { stdin: "pipe", stdout: "pipe" },
  );
  samplers.add(sampler);
  return {
    async stop(): Promise<number> {
      await sampler.stdin.write("stop");
      await sampler.stdin.end();
      const peak = Number(await new Response(sampler.stdout).text());
      await sampler.exited;
      samplers.delete(sampler);
      return peak;
    },
  };
}
