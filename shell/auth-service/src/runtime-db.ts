import {
  closeSqliteClient,
  createSqliteDatabase,
  type SqliteDatabase,
} from "@brains/db";
import { chmod, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/libsql/migrator";
import { authRuntimeSchema } from "./runtime-schema";

export type AuthRuntimeDB = SqliteDatabase<typeof authRuntimeSchema>;
type AuthRuntimeClient = ReturnType<typeof createSqliteDatabase>["client"];

export interface AuthRuntimeDatabaseOptions {
  /** Directory for the local auth runtime database. Ignored when url is set. */
  storageDir?: string;
  /** Local file URL. Defaults to file:<storageDir>/auth.db. */
  url?: string;
}

interface StartedDatabase {
  client: AuthRuntimeClient;
  db: AuthRuntimeDB;
  url: string;
}

export class AuthRuntimeDatabase {
  private readonly storageDir: string;
  private readonly configuredUrl: string | undefined;
  private active: StartedDatabase | undefined;
  private starting: Promise<void> | undefined;
  private stopping: Promise<void> | undefined;

  constructor(options: AuthRuntimeDatabaseOptions = {}) {
    this.storageDir = options.storageDir ?? join(".", "data", "auth");
    this.configuredUrl = options.url;
    // Validate before creating directories or opening any native handle.
    localPathFromFileUrl(this.url);
  }

  get client(): AuthRuntimeClient {
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
    if (this.stopping) await this.stopping;
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
    if (this.stopping) return this.stopping;
    const stopping = this.stopDatabase();
    this.stopping = stopping;
    try {
      await stopping;
    } finally {
      if (this.stopping === stopping) this.stopping = undefined;
    }
  }

  private async stopDatabase(): Promise<void> {
    if (this.starting) {
      try {
        await this.starting;
      } catch {
        // The start path closes its own client before rejecting.
      }
    }
    const active = this.active;
    this.active = undefined;
    if (active) await closeSqliteClient(active.client);
  }

  private async startDatabase(): Promise<void> {
    await this.prepareLocalDatabasePath();
    const { client, db } = createSqliteDatabase({
      url: this.url,
      schema: authRuntimeSchema,
    });

    try {
      await client.execute("PRAGMA foreign_keys = ON");
      await client.execute("PRAGMA journal_mode = WAL");
      await migrate(db, { migrationsFolder: authMigrationsFolder() });
      await this.secureLocalDatabaseFile();
      this.active = { client, db, url: this.url };
    } catch (error) {
      await closeSqliteClient(client);
      throw error;
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

function localPathFromFileUrl(url: string): string | undefined {
  if (!url.startsWith("file:")) {
    throw new Error("Auth runtime database requires a local file: URL");
  }
  const path = url.slice("file:".length);
  if (path === ":memory:") return undefined;
  return url.startsWith("file://") ? fileURLToPath(url) : path;
}
