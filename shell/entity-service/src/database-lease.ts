import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import type { Client } from "@libsql/client";
import { z } from "@brains/utils/zod";

/** How often a lease holder renews its row. */
export const DATABASE_LEASE_RENEW_INTERVAL_MS = 10_000;
/** How long a row stays fresh after its last renewal. */
export const DATABASE_LEASE_TTL_MS = 60_000;

/**
 * A brain process serving the database, or an offline maintenance command
 * converting it. Brain processes share a database; maintenance excludes
 * every other holder.
 */
export type DatabaseLeaseRole = "brain" | "maintenance";

const leaseRowSchema: z.ZodObject<{
  id: z.ZodString;
  role: z.ZodEnum<{ brain: "brain"; maintenance: "maintenance" }>;
  command: z.ZodNullable<z.ZodString>;
  hostname: z.ZodString;
  pid: z.ZodNumber;
  startedAt: z.ZodNumber;
  heartbeatAt: z.ZodNumber;
  expiresAt: z.ZodNumber;
}> = z.object({
  id: z.string(),
  role: z.enum(["brain", "maintenance"]),
  command: z.string().nullable(),
  hostname: z.string(),
  pid: z.number(),
  startedAt: z.number(),
  heartbeatAt: z.number(),
  expiresAt: z.number(),
});

/** One process's lease on the database file, as stored. */
export type DatabaseLeaseRecord = z.output<typeof leaseRowSchema>;

/** The statement surface leases need. */
type LeaseClient = Pick<Client, "execute">;

/** A lease that was left fresh: its holder renewed it within the TTL. */
export function isDatabaseLeaseFresh(
  lease: DatabaseLeaseRecord,
  now: number = Date.now(),
): boolean {
  return lease.expiresAt > now;
}

/** Who holds a lease, where, and how long ago it was renewed. */
export function describeDatabaseLease(
  lease: DatabaseLeaseRecord,
  now: number = Date.now(),
): string {
  const age = Math.max(0, Math.round((now - lease.heartbeatAt) / 1000));
  return `${lease.command ?? lease.role}: process ${lease.pid} on host ${lease.hostname}, started ${new Date(lease.startedAt).toISOString()}, heartbeat ${formatAge(age)} ago`;
}

function formatAge(seconds: number): string {
  if (seconds < 120) return `${seconds}s`;
  if (seconds < 7200) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

/** Another holder's fresh lease stopped this one from being taken. */
export class DatabaseLeaseConflictError extends Error {
  public readonly holders: DatabaseLeaseRecord[];

  constructor(role: DatabaseLeaseRole, holders: DatabaseLeaseRecord[]) {
    const described = holders.map((holder) => describeDatabaseLease(holder));
    super(
      role === "brain"
        ? `Refusing to start: a maintenance command is converting this database (${described.join("; ")}). Start the brain once it finishes.`
        : `Refusing to continue: the database is in use (${described.join("; ")}).`,
    );
    this.name = "DatabaseLeaseConflictError";
    this.holders = holders;
  }
}

/**
 * Every lease row; none when the database predates the lease table, since
 * no process of a leasing release has opened it.
 */
export async function readDatabaseLeases(
  client: LeaseClient,
): Promise<DatabaseLeaseRecord[]> {
  const table = await client.execute(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'database_leases'",
  );
  if (table.rows.length === 0) return [];
  const result = await client.execute(
    "SELECT id, role, command, hostname, pid, started_at AS startedAt, heartbeat_at AS heartbeatAt, expires_at AS expiresAt FROM database_leases ORDER BY started_at, id",
  );
  return result.rows.map((row) => leaseRowSchema.parse({ ...row }));
}

export interface DatabaseLeaseOptions {
  role: DatabaseLeaseRole;
  /** The maintenance command holding the lease; brains name none. */
  command?: string | undefined;
  hostname?: string | undefined;
  pid?: number | undefined;
  now?: (() => number) | undefined;
  renewIntervalMs?: number | undefined;
  ttlMs?: number | undefined;
  /** Serializes the lease's writes with the holder's own. */
  runWrite?: (<T>(write: () => Promise<T>) => Promise<T>) | undefined;
  /** A renewal failed or found the row gone; renewal keeps trying. */
  onRenewalProblem?: ((problem: unknown) => void) | undefined;
}

/** A held lease, renewed on a timer until released or stopped. */
export interface HeldDatabaseLease {
  readonly id: string;
  /** Renew now; false when the row is gone. */
  renew(): Promise<boolean>;
  /** Stop renewing and delete the row: a clean stop. */
  release(): Promise<void>;
  /** Stop renewing and keep the row, which then expires. */
  stop(): void;
}

/**
 * Take a lease on the database, refusing while a conflicting holder's lease
 * is fresh: a brain refuses while a maintenance command runs, a maintenance
 * command while anything else does. The row is written before conflicts are
 * read, so of two holders starting together at least one sees the other.
 * A brain also removes expired rows, which only a crash leaves: when it
 * starts, and again with each renewal, so a row a killed process left while
 * still fresh is gone within a renewal of expiring.
 */
export async function acquireDatabaseLease(
  client: LeaseClient,
  options: DatabaseLeaseOptions,
): Promise<HeldDatabaseLease> {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? DATABASE_LEASE_TTL_MS;
  const runWrite =
    options.runWrite ?? (<T>(write: () => Promise<T>): Promise<T> => write());
  const id = randomUUID();
  const startedAt = now();

  await runWrite(async () => {
    if (options.role === "brain")
      await pruneExpiredLeases(client, startedAt, id);
    await client.execute({
      sql: "INSERT INTO database_leases (id, role, command, hostname, pid, started_at, heartbeat_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      args: [
        id,
        options.role,
        options.command ?? null,
        options.hostname ?? hostname(),
        options.pid ?? process.pid,
        startedAt,
        startedAt,
        startedAt + ttlMs,
      ],
    });
  });

  const conflicts = (await readDatabaseLeases(client)).filter(
    (lease) =>
      lease.id !== id &&
      isDatabaseLeaseFresh(lease, now()) &&
      (options.role === "maintenance" || lease.role === "maintenance"),
  );
  if (conflicts.length > 0) {
    await runWrite(() => deleteLease(client, id));
    throw new DatabaseLeaseConflictError(options.role, conflicts);
  }

  const renew = (): Promise<boolean> =>
    runWrite(async () => {
      const at = now();
      if (options.role === "brain") await pruneExpiredLeases(client, at, id);
      const result = await client.execute({
        sql: "UPDATE database_leases SET heartbeat_at = ?, expires_at = ? WHERE id = ?",
        args: [at, at + ttlMs, id],
      });
      return result.rowsAffected === 1;
    });

  let inFlight: Promise<unknown> | undefined;
  const timer = setInterval(() => {
    if (inFlight) return;
    inFlight = renew()
      .then((held) => {
        if (!held) options.onRenewalProblem?.(new Error("Lease row is gone"));
      })
      .catch((error: unknown) => options.onRenewalProblem?.(error))
      .finally(() => {
        inFlight = undefined;
      });
  }, options.renewIntervalMs ?? DATABASE_LEASE_RENEW_INTERVAL_MS);
  timer.unref();

  let stopped = false;
  const stop = (): void => {
    stopped = true;
    clearInterval(timer);
  };
  return {
    id,
    renew,
    stop,
    release: async (): Promise<void> => {
      if (stopped) return;
      stop();
      await inFlight;
      await runWrite(() => deleteLease(client, id));
    },
  };
}

async function deleteLease(client: LeaseClient, id: string): Promise<void> {
  await client.execute({
    sql: "DELETE FROM database_leases WHERE id = ?",
    args: [id],
  });
}

/** Delete every expired row but the holder's own, which it is renewing. */
async function pruneExpiredLeases(
  client: LeaseClient,
  now: number,
  ownId: string,
): Promise<void> {
  await client.execute({
    sql: "DELETE FROM database_leases WHERE expires_at <= ? AND id != ?",
    args: [now, ownId],
  });
}
