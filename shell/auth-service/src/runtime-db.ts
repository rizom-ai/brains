import { createClient, type Client } from "@libsql/client";
import { chmod, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { authRuntimeSchema } from "./runtime-schema";

export type AuthRuntimeDB = LibSQLDatabase<typeof authRuntimeSchema>;

export interface AuthRuntimeDatabaseOptions {
  /** Directory for the local auth runtime database. Ignored when url is set. */
  storageDir?: string;
  /** libSQL URL. Defaults to file:<storageDir>/auth.db. */
  url?: string;
  authToken?: string;
}

interface StartedDatabase {
  client: Client;
  db: AuthRuntimeDB;
  url: string;
}

const INITIAL_MIGRATION_ID = 1;

export class AuthRuntimeDatabase {
  private readonly storageDir: string;
  private readonly configuredUrl: string | undefined;
  private readonly authToken: string | undefined;
  private active: StartedDatabase | undefined;

  constructor(options: AuthRuntimeDatabaseOptions = {}) {
    this.storageDir = options.storageDir ?? join(".", "data", "auth");
    this.configuredUrl = options.url;
    this.authToken = options.authToken;
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
    if (this.active) {
      return;
    }

    await this.prepareLocalDatabasePath();

    const client = this.authToken
      ? createClient({ url: this.url, authToken: this.authToken })
      : createClient({ url: this.url });
    const db = drizzle(client, { schema: authRuntimeSchema });
    this.active = { client, db, url: this.url };

    try {
      await this.configureConnection();
      await this.runMigrations();
      await this.secureLocalDatabaseFile();
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    const active = this.active;
    this.active = undefined;
    active?.client.close();
  }

  private async configureConnection(): Promise<void> {
    await this.client.execute("PRAGMA foreign_keys = ON");
    if (isLocalFileUrl(this.url)) {
      await this.client.execute("PRAGMA journal_mode = WAL");
      await this.client.execute("PRAGMA busy_timeout = 5000");
    }
  }

  private async prepareLocalDatabasePath(): Promise<void> {
    const path = localPathFromFileUrl(this.url);
    if (!path) {
      return;
    }
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await chmod(dirname(path), 0o700);
  }

  private async secureLocalDatabaseFile(): Promise<void> {
    const path = localPathFromFileUrl(this.url);
    if (!path) {
      return;
    }
    await chmod(path, 0o600);
  }

  private async runMigrations(): Promise<void> {
    await this.client.batch(
      [
        `CREATE TABLE IF NOT EXISTS auth_schema_migrations (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at INTEGER NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS auth_users (
          id TEXT PRIMARY KEY,
          display_name TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('anchor', 'trusted', 'public')),
          status TEXT NOT NULL CHECK (status IN ('active', 'invited', 'suspended')),
          canonical_id TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_users_canonical_id
          ON auth_users(canonical_id)
          WHERE canonical_id IS NOT NULL`,
        `CREATE TABLE IF NOT EXISTS auth_identities (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
          type TEXT NOT NULL CHECK (type IN ('passkey', 'discord', 'mcp', 'oauth', 'email', 'did', 'a2a')),
          issuer TEXT,
          identity_key_hash TEXT NOT NULL,
          delivery_subject TEXT,
          label TEXT,
          verified_at INTEGER,
          revoked_at INTEGER,
          created_at INTEGER NOT NULL
        )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_identities_active_key
          ON auth_identities(identity_key_hash)
          WHERE revoked_at IS NULL`,
        `CREATE INDEX IF NOT EXISTS idx_auth_identities_user_id
          ON auth_identities(user_id)`,
        `CREATE TABLE IF NOT EXISTS passkey_credentials (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
          public_key TEXT NOT NULL,
          counter INTEGER NOT NULL,
          transports_json TEXT,
          credential_device_type TEXT,
          credential_backed_up INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          revoked_at INTEGER
        )`,
        `CREATE INDEX IF NOT EXISTS idx_passkey_credentials_user_id
          ON passkey_credentials(user_id)`,
        `CREATE TABLE IF NOT EXISTS webauthn_challenges (
          challenge_hash TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
          kind TEXT NOT NULL CHECK (kind IN ('registration', 'authentication')),
          expires_at INTEGER NOT NULL,
          consumed_at INTEGER,
          created_at INTEGER NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_user_id
          ON webauthn_challenges(user_id)`,
        `CREATE TABLE IF NOT EXISTS operator_sessions (
          token_hash TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
          expires_at INTEGER NOT NULL,
          revoked_at INTEGER,
          created_at INTEGER NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS idx_operator_sessions_user_id
          ON operator_sessions(user_id)`,
        `CREATE TABLE IF NOT EXISTS oauth_clients (
          client_id TEXT PRIMARY KEY,
          secret_hash TEXT,
          metadata_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS oauth_auth_codes (
          code_hash TEXT PRIMARY KEY,
          client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
          redirect_uri TEXT NOT NULL,
          pkce_challenge TEXT NOT NULL,
          scope TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          consumed_at INTEGER,
          created_at INTEGER NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS idx_oauth_auth_codes_client_id
          ON oauth_auth_codes(client_id)`,
        `CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
          token_hash TEXT PRIMARY KEY,
          client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
          scope TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          revoked_at INTEGER,
          replaced_by_hash TEXT,
          created_at INTEGER NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS idx_oauth_refresh_tokens_user_id
          ON oauth_refresh_tokens(user_id)`,
        `CREATE TABLE IF NOT EXISTS oauth_signing_keys (
          kid TEXT PRIMARY KEY,
          private_jwk TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('active', 'retired')),
          created_at INTEGER NOT NULL,
          retired_at INTEGER
        )`,
        `CREATE TABLE IF NOT EXISTS setup_tokens (
          token_hash TEXT PRIMARY KEY,
          purpose TEXT NOT NULL,
          target_user_id TEXT REFERENCES auth_users(id) ON DELETE CASCADE,
          expires_at INTEGER NOT NULL,
          consumed_at INTEGER,
          delivery_key_hash TEXT,
          created_at INTEGER NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS idx_setup_tokens_target_user_id
          ON setup_tokens(target_user_id)`,
        `CREATE TABLE IF NOT EXISTS auth_audit_events (
          id TEXT PRIMARY KEY,
          actor_user_id TEXT REFERENCES auth_users(id) ON DELETE SET NULL,
          action TEXT NOT NULL,
          target_type TEXT,
          target_id TEXT,
          metadata_json TEXT,
          created_at INTEGER NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS idx_auth_audit_events_actor_user_id
          ON auth_audit_events(actor_user_id)`,
        {
          sql: `INSERT OR IGNORE INTO auth_schema_migrations (id, name, applied_at)
            VALUES (?, ?, ?)`,
          args: [
            INITIAL_MIGRATION_ID,
            "initial-auth-runtime-schema",
            Date.now(),
          ],
        },
      ],
      "write",
    );
  }
}

function isLocalFileUrl(url: string): boolean {
  return url.startsWith("file:");
}

function localPathFromFileUrl(url: string): string | undefined {
  return isLocalFileUrl(url) ? url.slice("file:".length) : undefined;
}
