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
        "auth_audit_events",
        "auth_identities",
        "auth_schema_migrations",
        "auth_users",
        "oauth_auth_codes",
        "oauth_clients",
        "oauth_refresh_tokens",
        "oauth_signing_keys",
        "operator_sessions",
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
      expect(migrations.rows.map((row) => row["id"])).toEqual([1]);
      expect(await tableNames(second)).toContain("auth_users");
    } finally {
      await second.stop();
    }
  });
});
