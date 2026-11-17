import { afterEach, describe, expect, it } from "bun:test";
import { createClient, type Client } from "@libsql/client";
import {
  acquireDatabaseLease,
  DatabaseLeaseConflictError,
  describeDatabaseLease,
  readDatabaseLeases,
  type DatabaseLeaseRecord,
} from "../src/database-lease";
import {
  createTestEntityDatabase,
  type TestEntityDatabase,
} from "./helpers/test-entity-db";

const databases: TestEntityDatabase[] = [];
const clients: Client[] = [];

afterEach(async () => {
  clients.splice(0).forEach((client) => client.close());
  await Promise.all(databases.splice(0).map((db) => db.cleanup()));
});

async function migratedClient(): Promise<Client> {
  const database = await createTestEntityDatabase();
  databases.push(database);
  const client = createClient({ url: database.url });
  clients.push(client);
  return client;
}

async function insertLease(
  client: Client,
  lease: Partial<DatabaseLeaseRecord> & Pick<DatabaseLeaseRecord, "id">,
): Promise<void> {
  const now = Date.now();
  await client.execute({
    sql: "INSERT INTO database_leases (id, role, command, hostname, pid, started_at, heartbeat_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    args: [
      lease.id,
      lease.role ?? "brain",
      lease.command ?? null,
      lease.hostname ?? "other-host",
      lease.pid ?? 41,
      lease.startedAt ?? now - 60_000,
      lease.heartbeatAt ?? now - 1_000,
      lease.expiresAt ?? now + 59_000,
    ],
  });
}

describe("database leases", () => {
  it("reads no leases from a database without the lease table", async () => {
    const client = createClient({ url: ":memory:" });
    clients.push(client);

    expect(await readDatabaseLeases(client)).toEqual([]);
  });

  it("records a brain lease, renews it and deletes it on release", async () => {
    const client = await migratedClient();
    let now = 1_000_000;

    const lease = await acquireDatabaseLease(client, {
      role: "brain",
      hostname: "brain-host",
      pid: 7,
      now: () => now,
      renewIntervalMs: 60_000,
    });
    const [recorded] = await readDatabaseLeases(client);
    expect(recorded).toMatchObject({
      role: "brain",
      command: null,
      hostname: "brain-host",
      pid: 7,
      startedAt: 1_000_000,
      heartbeatAt: 1_000_000,
      expiresAt: 1_060_000,
    });

    now = 1_010_000;
    expect(await lease.renew()).toBe(true);
    expect((await readDatabaseLeases(client))[0]).toMatchObject({
      heartbeatAt: 1_010_000,
      expiresAt: 1_070_000,
    });

    await lease.release();
    expect(await readDatabaseLeases(client)).toEqual([]);
  });

  it("lets brain processes share a database", async () => {
    const client = await migratedClient();
    await insertLease(client, { id: "web" });

    const lease = await acquireDatabaseLease(client, { role: "brain" });

    expect(await readDatabaseLeases(client)).toHaveLength(2);
    await lease.release();
  });

  it("refuses a brain while a maintenance command holds the database, naming it", async () => {
    const client = await migratedClient();
    await insertLease(client, {
      id: "run",
      role: "maintenance",
      command: "assets:migrate",
      hostname: "one-off-container",
      pid: 99,
    });

    const refused = await acquireDatabaseLease(client, { role: "brain" }).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(refused).toBeInstanceOf(DatabaseLeaseConflictError);
    const message = String(refused);
    expect(message).toContain("assets:migrate");
    expect(message).toContain("one-off-container");
    expect(message).toContain("99");
    // The refused brain leaves no row behind.
    expect((await readDatabaseLeases(client)).map((row) => row.id)).toEqual([
      "run",
    ]);
  });

  it("prunes expired leases when a brain starts", async () => {
    const client = await migratedClient();
    const now = Date.now();
    await insertLease(client, {
      id: "crashed-run",
      role: "maintenance",
      command: "assets:migrate",
      heartbeatAt: now - 3_600_000,
      expiresAt: now - 3_540_000,
    });
    await insertLease(client, {
      id: "crashed-brain",
      heartbeatAt: now - 3_600_000,
      expiresAt: now - 3_540_000,
    });

    const lease = await acquireDatabaseLease(client, { role: "brain" });

    expect((await readDatabaseLeases(client)).map((row) => row.id)).toEqual([
      lease.id,
    ]);
    await lease.release();
  });

  it("prunes a lease that expired while the brain runs at its next renewal", async () => {
    const client = await migratedClient();
    let now = Date.now();
    const lease = await acquireDatabaseLease(client, {
      role: "brain",
      now: () => now,
      renewIntervalMs: 60_000,
    });
    await insertLease(client, {
      id: "killed-brain",
      heartbeatAt: now,
      expiresAt: now + 1_000,
    });

    now += 1_001;
    expect(await lease.renew()).toBe(true);

    expect((await readDatabaseLeases(client)).map((row) => row.id)).toEqual([
      lease.id,
    ]);
    await lease.release();
  });

  it("renews a brain's own lease that lapsed instead of pruning it", async () => {
    const client = await migratedClient();
    let now = Date.now();
    const lease = await acquireDatabaseLease(client, {
      role: "brain",
      now: () => now,
      renewIntervalMs: 60_000,
    });

    now += 120_000;
    expect(await lease.renew()).toBe(true);

    expect(await readDatabaseLeases(client)).toEqual([
      expect.objectContaining({ id: lease.id, expiresAt: now + 60_000 }),
    ]);
    await lease.release();
  });

  it("keeps fresh brain and maintenance leases through a renewal", async () => {
    const client = await migratedClient();
    let now = Date.now();
    const lease = await acquireDatabaseLease(client, {
      role: "brain",
      now: () => now,
      renewIntervalMs: 60_000,
    });
    await insertLease(client, {
      id: "web",
      heartbeatAt: now,
      expiresAt: now + 60_000,
    });
    await insertLease(client, {
      id: "run",
      role: "maintenance",
      command: "assets:migrate",
      heartbeatAt: now,
      expiresAt: now + 60_000,
    });

    now += 10_000;
    expect(await lease.renew()).toBe(true);

    expect(
      (await readDatabaseLeases(client)).map((row) => row.id).sort(),
    ).toEqual([lease.id, "run", "web"].sort());
    await lease.release();
  });

  it("refuses maintenance while a brain or another command holds the database", async () => {
    const client = await migratedClient();
    await insertLease(client, { id: "web", hostname: "brain-container" });

    const refused = await acquireDatabaseLease(client, {
      role: "maintenance",
      command: "assets:migrate",
    }).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(refused).toBeInstanceOf(DatabaseLeaseConflictError);
    expect(String(refused)).toContain("brain-container");
    expect(await readDatabaseLeases(client)).toHaveLength(1);

    await client.execute("DELETE FROM database_leases");
    await insertLease(client, {
      id: "other-run",
      role: "maintenance",
      command: "assets:reconcile",
    });
    const second = await acquireDatabaseLease(client, {
      role: "maintenance",
      command: "assets:migrate",
    }).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(String(second)).toContain("assets:reconcile");
  });

  it("leaves expired brain leases to the next brain when maintenance starts", async () => {
    const client = await migratedClient();
    const now = Date.now();
    await insertLease(client, {
      id: "crashed-brain",
      heartbeatAt: now - 3_600_000,
      expiresAt: now - 3_540_000,
    });

    const lease = await acquireDatabaseLease(client, {
      role: "maintenance",
      command: "assets:migrate",
    });

    expect(
      (await readDatabaseLeases(client)).map((row) => row.id).sort(),
    ).toEqual(["crashed-brain", lease.id].sort());
    await lease.release();
  });

  it("describes a lease by command, process, host and heartbeat age", () => {
    expect(
      describeDatabaseLease(
        {
          id: "x",
          role: "maintenance",
          command: "assets:migrate",
          hostname: "3f2a9c1b7d0e",
          pid: 41,
          startedAt: Date.parse("2026-11-15T03:12:00.000Z"),
          heartbeatAt: 1_000_000,
          expiresAt: 1_060_000,
        },
        1_004_000,
      ),
    ).toBe(
      "assets:migrate: process 41 on host 3f2a9c1b7d0e, started 2026-11-15T03:12:00.000Z, heartbeat 4s ago",
    );
  });
});
