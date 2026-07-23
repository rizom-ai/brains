import { createClient, type Client, type Config } from "@libsql/client";
import { chmod, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { upgradeLegacyAuthDatabase } from "./legacy-auth-database-upgrade";
import { authRuntimeSchema } from "./runtime-schema";

export type AuthRuntimeDB = LibSQLDatabase<typeof authRuntimeSchema>;

export interface AuthRuntimeReplicaOptions {
  /** Private remote libSQL primary used by the local embedded replica. */
  syncUrl: string;
  /** Authentication token for the private remote primary. */
  authToken: string;
  /** Remote-to-local sync cadence. Defaults to 60 seconds. */
  syncIntervalMs?: number | undefined;
}

export interface AuthRuntimeDatabaseOptions {
  /** Directory for the local auth runtime database. Ignored when url is set. */
  storageDir?: string;
  /** libSQL URL. Defaults to file:<storageDir>/auth.db. */
  url?: string;
  authToken?: string;
  /** Optional private remote primary for durable embedded-replica backup/PITR. */
  replica?: AuthRuntimeReplicaOptions;
}

interface AuthRuntimeClientConfigOptions {
  url: string;
  authToken?: string;
  replica?: AuthRuntimeReplicaOptions;
}

export function buildAuthRuntimeClientConfig(
  options: AuthRuntimeClientConfigOptions,
): Config {
  if (!options.replica) {
    return {
      url: options.url,
      ...(options.authToken ? { authToken: options.authToken } : {}),
    };
  }
  if (!isLocalFileUrl(options.url)) {
    throw new Error("Auth embedded replicas require a local file database");
  }
  if (!isRemoteReplicaUrl(options.replica.syncUrl)) {
    throw new Error("Auth embedded replicas require a remote libSQL URL");
  }
  if (!options.replica.authToken.trim()) {
    throw new Error("Auth embedded replicas require a private auth token");
  }
  const syncInterval = options.replica.syncIntervalMs ?? 60_000;
  if (!Number.isInteger(syncInterval) || syncInterval <= 0) {
    throw new Error("Auth embedded replica sync interval must be positive");
  }
  return {
    url: options.url,
    syncUrl: options.replica.syncUrl,
    authToken: options.replica.authToken,
    syncInterval,
  };
}

export function authRuntimeConnectionPragmas(
  url: string,
  embeddedReplica: boolean,
): string[] {
  return [
    "PRAGMA foreign_keys = ON",
    ...(isLocalFileUrl(url) && !embeddedReplica
      ? ["PRAGMA journal_mode = WAL", "PRAGMA busy_timeout = 5000"]
      : []),
  ];
}

interface StartedDatabase {
  client: Client;
  db: AuthRuntimeDB;
  url: string;
}

export class AuthRuntimeDatabase {
  private readonly storageDir: string;
  private readonly configuredUrl: string | undefined;
  private readonly authToken: string | undefined;
  private readonly replica: AuthRuntimeReplicaOptions | undefined;
  private active: StartedDatabase | undefined;
  private starting: Promise<void> | undefined;

  constructor(options: AuthRuntimeDatabaseOptions = {}) {
    this.storageDir = options.storageDir ?? join(".", "data", "auth");
    this.configuredUrl = options.url;
    this.authToken = options.authToken;
    this.replica = options.replica;
  }

  get client(): Client {
    if (!this.active) {
      throw new Error("Auth runtime database has not been started");
    }
    return this.active.client;
  }

  get db(): AuthRuntimeDB {
    if (!this.active) {
      throw new Error("Auth runtime database has not been started");
    }
    return this.active.db;
  }

  get url(): string {
    return this.configuredUrl ?? `file:${join(this.storageDir, "auth.db")}`;
  }

  async start(): Promise<void> {
    if (this.active) return;
    if (this.starting) return this.starting;

    const starting = this.startDatabase();
    this.starting = starting;
    try {
      await starting;
    } finally {
      if (this.starting === starting) this.starting = undefined;
    }
  }

  async stop(): Promise<void> {
    const starting = this.starting;
    if (starting) {
      try {
        await starting;
      } catch {
        // The start path closes its own client before rejecting.
      }
    }
    const active = this.active;
    this.active = undefined;
    active?.client.close();
  }

  private async startDatabase(): Promise<void> {
    await this.prepareLocalDatabasePath();
    const client = createClient(
      buildAuthRuntimeClientConfig({
        url: this.url,
        ...(this.authToken ? { authToken: this.authToken } : {}),
        ...(this.replica ? { replica: this.replica } : {}),
      }),
    );
    const db = drizzle(client, { schema: authRuntimeSchema });

    try {
      if (this.replica) await client.sync();
      await this.configureConnection(client);
      await upgradeLegacyAuthDatabase(client);
      await migrate(db, { migrationsFolder: authMigrationsFolder() });
      await this.secureLocalDatabaseFile();
      this.active = { client, db, url: this.url };
    } catch (error) {
      client.close();
      throw error;
    }
  }

  private async configureConnection(client: Client): Promise<void> {
    for (const pragma of authRuntimeConnectionPragmas(
      this.url,
      this.replica !== undefined,
    )) {
      await client.execute(pragma);
    }
  }

  private async prepareLocalDatabasePath(): Promise<void> {
    const path = localPathFromFileUrl(this.url);
    if (!path) return;
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await chmod(dirname(path), 0o700);
  }

  private async secureLocalDatabaseFile(): Promise<void> {
    const path = localPathFromFileUrl(this.url);
    if (path) await chmod(path, 0o600);
  }
}

function authMigrationsFolder(): string {
  return import.meta.url.includes("/dist/")
    ? new URL("./migrations/auth-service", import.meta.url).pathname
    : new URL("../drizzle", import.meta.url).pathname;
}

function isLocalFileUrl(url: string): boolean {
  return url.startsWith("file:");
}

function isRemoteReplicaUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "libsql:" || protocol === "https:";
  } catch {
    return false;
  }
}

function localPathFromFileUrl(url: string): string | undefined {
  return isLocalFileUrl(url) ? url.slice("file:".length) : undefined;
}
