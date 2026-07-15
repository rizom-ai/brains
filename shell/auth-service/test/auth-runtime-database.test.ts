import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthRuntimeDatabase } from "../src/runtime-db";

const tempDirs: string[] = [];

async function tempStorageDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "brains-auth-runtime-db-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function tableNames(database: AuthRuntimeDatabase): Promise<string[]> {
  const result = await database.client.execute({
    sql: "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    args: [],
  });
  return result.rows.map((row) => String(row["name"]));
}

describe("AuthRuntimeDatabase", () => {
  it("creates a private local auth database with the initial schema", async () => {
    const storageDir = await tempStorageDir();
    const database = new AuthRuntimeDatabase({ storageDir });

    await database.start();
    try {
      expect(database.url).toBe(`file:${join(storageDir, "auth.db")}`);
      expect(await tableNames(database)).toEqual([
        "a2a_peer_trust",
        "auth_audit_events",
        "auth_identities",
        "auth_schema_migrations",
        "auth_sessions",
        "auth_users",
        "oauth_auth_codes",
        "oauth_clients",
        "oauth_refresh_tokens",
        "oauth_signing_keys",
        "passkey_credentials",
        "setup_tokens",
        "webauthn_challenges",
      ]);

      if (process.platform !== "win32") {
        const dirStats = await stat(storageDir);
        const dbStats = await stat(join(storageDir, "auth.db"));
        expect(dirStats.mode & 0o777).toBe(0o700);
        expect(dbStats.mode & 0o777).toBe(0o600);
      }
    } finally {
      await database.stop();
    }
  });

  it("renames the legacy session table without losing active rows", async () => {
    const storageDir = await tempStorageDir();
    const legacy = new AuthRuntimeDatabase({ storageDir });
    await legacy.start();
    await legacy.client.batch(
      [
        `INSERT INTO auth_users
          (id, display_name, role, status, canonical_id, created_at, updated_at)
          VALUES ('usr_anchor', 'Anchor', 'anchor', 'active', 'user:anchor', 1, 1)`,
        `INSERT INTO auth_sessions
          (token_hash, user_id, expires_at, revoked_at, created_at)
          VALUES ('legacy-token-hash', 'usr_anchor', 9999999999, NULL, 1)`,
        "DROP INDEX idx_auth_sessions_user_id",
        "ALTER TABLE auth_sessions RENAME TO operator_sessions",
        "CREATE INDEX idx_operator_sessions_user_id ON operator_sessions(user_id)",
        "DELETE FROM auth_schema_migrations WHERE id = 5",
      ],
      "write",
    );
    await legacy.stop();

    const migrated = new AuthRuntimeDatabase({ storageDir });
    await migrated.start();
    try {
      const rows = await migrated.client.execute(
        "SELECT token_hash, user_id FROM auth_sessions",
      );
      expect(
        rows.rows.map((row) => ({
          tokenHash: row["token_hash"],
          userId: row["user_id"],
        })),
      ).toEqual([{ tokenHash: "legacy-token-hash", userId: "usr_anchor" }]);
      expect(await tableNames(migrated)).not.toContain("operator_sessions");
    } finally {
      await migrated.stop();
    }
  });

  it("runs migrations idempotently", async () => {
    const storageDir = await tempStorageDir();
    const first = new AuthRuntimeDatabase({ storageDir });

    await first.start();
    await first.stop();

    const second = new AuthRuntimeDatabase({ storageDir });
    await second.start();
    try {
      const migrations = await second.client.execute({
        sql: "SELECT id FROM auth_schema_migrations ORDER BY id",
        args: [],
      });
      expect(migrations.rows.map((row) => row["id"])).toEqual([1, 2, 3, 4, 5]);
      expect(await tableNames(second)).toContain("auth_users");
      expect(await tableNames(second)).not.toContain("operator_sessions");
    } finally {
      await second.stop();
    }
  });
});
