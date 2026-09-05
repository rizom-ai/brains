import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeSqliteClient, createSqliteDatabase } from "@brains/db";
import { AuthRuntimeDatabase } from "../src/runtime-db";

const tempDirs: string[] = [];
const legacyAuthV4Fixture = await Bun.file(
  new URL("./fixtures/legacy-auth-v4.sql", import.meta.url),
).text();
const currentAuthTableNames = [
  "__drizzle_migrations",
  "a2a_peer_trust",
  "auth_access_seed_state",
  "auth_account_plugin_settings",
  "auth_audit_events",
  "auth_brain_anchor",
  "auth_identity_evidence",
  "auth_invitation_delivery_attempts",
  "auth_invitations",
  "auth_people",
  "auth_sessions",
  "auth_users",
  "interface_anchor_bindings",
  "interface_principal_grants",
  "oauth_auth_codes",
  "oauth_clients",
  "oauth_refresh_tokens",
  "oauth_signing_keys",
  "passkey_credentials",
  "person_external_peers",
  "person_identity_claims",
  "setup_token_deliveries",
  "setup_tokens",
  "webauthn_challenges",
];

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
  it("rejects remote database URLs before opening a connection", () => {
    for (const url of [
      "libsql://auth.example.com",
      "https://auth.example.com",
    ]) {
      expect(() => new AuthRuntimeDatabase({ url })).toThrow(
        "Auth runtime database requires a local file: URL",
      );
    }
  });

  it("drains admitted writes before concurrent shutdown completes", async () => {
    const storageDir = await tempStorageDir();
    const database = new AuthRuntimeDatabase({ storageDir });
    await database.start();
    await database.client.execute("CREATE TABLE durability_probe (value TEXT)");
    const write = database.client.execute(
      "INSERT INTO durability_probe VALUES ('persisted')",
    );
    await Promise.all([write, database.stop(), database.stop()]);

    await database.start();
    try {
      const result = await database.client.execute(
        "SELECT value FROM durability_probe",
      );
      expect(result.rows[0]?.["value"]).toBe("persisted");
    } finally {
      await database.stop();
    }
  });

  it("creates a private local auth database with the initial schema", async () => {
    const storageDir = await tempStorageDir();
    const database = new AuthRuntimeDatabase({ storageDir });

    await database.start();
    try {
      expect(database.url).toBe(`file:${join(storageDir, "auth.db")}`);
      expect(await tableNames(database)).toEqual(currentAuthTableNames);

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

  it("deduplicates concurrent first-start migrations", async () => {
    const storageDir = await tempStorageDir();
    const database = new AuthRuntimeDatabase({ storageDir });
    // Element access rather than an assertion: it reaches the private member
    // while keeping its real signature, so a change to it fails here.
    const prepare = database["prepareLocalDatabasePath"].bind(database);
    let prepareCalls = 0;
    database["prepareLocalDatabasePath"] = async (): Promise<void> => {
      prepareCalls += 1;
      await prepare();
    };

    await Promise.all(
      Array.from({ length: 8 }, (): Promise<void> => database.start()),
    );
    try {
      expect(prepareCalls).toBe(1);
      expect(await tableNames(database)).toEqual(currentAuthTableNames);
    } finally {
      await database.stop();
    }
  });

  it("indexes active and historical identity claim lookups", async () => {
    const storageDir = await tempStorageDir();
    const database = new AuthRuntimeDatabase({ storageDir });
    await database.start();

    try {
      const indexes = await database.client.execute(
        "PRAGMA index_list('person_identity_claims')",
      );
      expect(indexes.rows.map((row) => row["name"])).toEqual(
        expect.arrayContaining([
          "idx_person_identity_claims_active_key",
          "idx_person_identity_claims_key",
        ]),
      );
    } finally {
      await database.stop();
    }
  });

  it("preserves authorization constraints while channel identity types remain extensible", async () => {
    const storageDir = await tempStorageDir();
    const database = new AuthRuntimeDatabase({ storageDir });
    await database.start();

    try {
      const expectedValues = new Map<string, string[]>([
        [
          "auth_users",
          ["admin", "trusted", "public", "active", "invited", "suspended"],
        ],
        ["person_identity_claims", ["private", "trusted", "public"]],
        [
          "auth_identity_evidence",
          ["admin", "agent", "migration", "provider", "asserted", "verified"],
        ],
        ["person_external_peers", ["unverified", "verified"]],
        ["webauthn_challenges", ["registration", "authentication"]],
        ["oauth_signing_keys", ["oauth", "a2a", "active", "retired"]],
        ["a2a_peer_trust", ["public", "trusted"]],
      ]);

      for (const [table, values] of expectedValues) {
        const result = await database.client.execute({
          sql: "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
          args: [table],
        });
        const definition = String(result.rows[0]?.["sql"]);
        expect(definition).toContain("CHECK");
        for (const value of values) expect(definition).toContain(`'${value}'`);
        if (table === "person_identity_claims") {
          expect(definition).not.toContain("person_identity_claims_type_check");
        }
      }
    } finally {
      await database.stop();
    }
  });

  it("rejects unsupported pre-Drizzle auth databases", async () => {
    const storageDir = await tempStorageDir();
    const { client: legacy } = createSqliteDatabase({
      url: `file:${join(storageDir, "auth.db")}`,
      schema: {},
    });
    await legacy.executeMultiple(legacyAuthV4Fixture);
    await closeSqliteClient(legacy);

    const database = new AuthRuntimeDatabase({ storageDir });
    expect(database.start()).rejects.toThrow();
  });

  it("runs migrations idempotently", async () => {
    const storageDir = await tempStorageDir();
    const first = new AuthRuntimeDatabase({ storageDir });

    await first.start();
    await first.stop();

    const second = new AuthRuntimeDatabase({ storageDir });
    await second.start();
    try {
      const migrations = await second.client.execute(
        "SELECT hash, created_at FROM __drizzle_migrations",
      );
      expect(migrations.rows).toHaveLength(12);
      expect(
        migrations.rows.every(
          (migration) => Number(migration["created_at"]) > 0,
        ),
      ).toBe(true);
      expect(await tableNames(second)).toContain("auth_users");
      expect(await tableNames(second)).not.toContain("auth_schema_migrations");
      expect(await tableNames(second)).not.toContain("operator_sessions");
    } finally {
      await second.stop();
    }
  });
});
