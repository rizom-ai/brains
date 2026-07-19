import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { AuthRuntimeDatabase } from "../src/runtime-db";

const tempDirs: string[] = [];
const legacyAuthV4Fixture = await Bun.file(
  new URL("./fixtures/legacy-auth-v4.sql", import.meta.url),
).text();
const legacyAuthV5Fixture = await Bun.file(
  new URL("./fixtures/legacy-auth-v5.sql", import.meta.url),
).text();
const legacyAuthV6Fixture = await Bun.file(
  new URL("./fixtures/legacy-auth-v6.sql", import.meta.url),
).text();
const currentAuthTableNames = [
  "__drizzle_migrations",
  "a2a_peer_trust",
  "agent_person_links",
  "auth_audit_events",
  "auth_brain_anchor",
  "auth_identity_evidence",
  "auth_legacy_imports",
  "auth_people",
  "auth_sessions",
  "auth_users",
  "oauth_auth_codes",
  "oauth_clients",
  "oauth_refresh_tokens",
  "oauth_signing_keys",
  "passkey_credentials",
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
    const instrumented = database as unknown as {
      prepareLocalDatabasePath(): Promise<void>;
    };
    const prepare = instrumented.prepareLocalDatabasePath.bind(database);
    let prepareCalls = 0;
    instrumented.prepareLocalDatabasePath = async (): Promise<void> => {
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

  it("preserves authorization and identity enum constraints", async () => {
    const storageDir = await tempStorageDir();
    const database = new AuthRuntimeDatabase({ storageDir });
    await database.start();

    try {
      const expectedValues = new Map<string, string[]>([
        [
          "auth_users",
          ["admin", "trusted", "public", "active", "invited", "suspended"],
        ],
        [
          "person_identity_claims",
          [
            "passkey",
            "discord",
            "mcp",
            "oauth",
            "email",
            "did",
            "a2a",
            "private",
            "trusted",
            "public",
          ],
        ],
        [
          "auth_identity_evidence",
          ["admin", "agent", "migration", "provider", "asserted", "verified"],
        ],
        ["agent_person_links", ["pending", "active", "revoked"]],
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
      }
    } finally {
      await database.stop();
    }
  });

  it("renames the legacy session table without losing active rows", async () => {
    const storageDir = await tempStorageDir();
    const legacy = createClient({ url: `file:${join(storageDir, "auth.db")}` });
    await legacy.executeMultiple(legacyAuthV4Fixture);
    await legacy.batch(
      [
        `INSERT INTO auth_users
          (id, display_name, role, status, canonical_id, created_at, updated_at)
          VALUES ('usr_anchor', 'Anchor', 'anchor', 'active', 'user:anchor', 1, 1)`,
        `INSERT INTO operator_sessions
          (token_hash, user_id, expires_at, revoked_at, created_at)
          VALUES ('legacy-token-hash', 'usr_anchor', 9999999999, NULL, 1)`,
        `INSERT INTO setup_tokens
          (token_hash, purpose, target_user_id, expires_at, consumed_at,
           delivery_key_hash, created_at)
          VALUES ('legacy-setup-hash', 'passkey_setup', NULL, 9999999999,
                  NULL, 'legacy-recipient-hash', 2)`,
      ],
      "write",
    );
    legacy.close();

    const migrated = new AuthRuntimeDatabase({ storageDir });
    await migrated.start();
    try {
      const rows = await migrated.client.execute(
        "SELECT token_hash, user_id FROM auth_sessions",
      );
      const migratedUsers = await migrated.client.execute(
        "SELECT id, person_id, role FROM auth_users",
      );
      const anchor = await migrated.client.execute(
        "SELECT kind, subject_id, display_name FROM auth_brain_anchor",
      );
      expect(
        rows.rows.map((row) => ({
          tokenHash: row["token_hash"],
          userId: row["user_id"],
        })),
      ).toEqual([{ tokenHash: "legacy-token-hash", userId: "usr_anchor" }]);
      expect(migratedUsers.rows[0]).toMatchObject({
        id: "usr_anchor",
        person_id: "prsn_anchor",
        role: "admin",
      });
      expect(anchor.rows[0]).toMatchObject({
        kind: "person",
        subject_id: "prsn_anchor",
        display_name: "Anchor",
      });
      const deliveries = await migrated.client.execute(
        `SELECT token_hash, recipient_hash, delivered_at
          FROM setup_token_deliveries`,
      );
      expect(
        deliveries.rows.map((row) => ({
          tokenHash: row["token_hash"],
          recipientHash: row["recipient_hash"],
          deliveredAt: row["delivered_at"],
        })),
      ).toEqual([
        {
          tokenHash: "legacy-setup-hash",
          recipientHash: "legacy-recipient-hash",
          deliveredAt: 2,
        },
      ]);
      expect(await tableNames(migrated)).toEqual(currentAuthTableNames);
    } finally {
      await migrated.stop();
    }
  });

  it("migrates v5 users and identities into people, claims, and evidence without changing ids", async () => {
    const storageDir = await tempStorageDir();
    const legacy = createClient({ url: `file:${join(storageDir, "auth.db")}` });
    await legacy.executeMultiple(legacyAuthV4Fixture);
    await legacy.executeMultiple(legacyAuthV5Fixture);
    await legacy.batch(
      [
        `INSERT INTO auth_users
          (id, display_name, role, status, canonical_id, created_at, updated_at)
          VALUES ('usr_mira', 'Mira Reyes', 'trusted', 'active', 'user:mira', 10, 20)`,
        `INSERT INTO auth_identities
          (id, user_id, type, identity_key_hash, label, verified_at, created_at)
          VALUES ('aid_mira_discord', 'usr_mira', 'discord', 'hash-mira', 'MiraR', 15, 12)`,
      ],
      "write",
    );
    legacy.close();

    const migrated = new AuthRuntimeDatabase({ storageDir });
    await migrated.start();
    try {
      const users = await migrated.client.execute(
        "SELECT id, person_id FROM auth_users WHERE id = 'usr_mira'",
      );
      expect(
        users.rows.map((row) => ({
          id: row["id"],
          personId: row["person_id"],
        })),
      ).toEqual([{ id: "usr_mira", personId: "prsn_mira" }]);

      const claims = await migrated.client.execute(
        "SELECT id, person_id, identity_key_hash, visibility FROM person_identity_claims",
      );
      expect(
        claims.rows.map((row) => ({
          id: row["id"],
          personId: row["person_id"],
          identityKeyHash: row["identity_key_hash"],
          visibility: row["visibility"],
        })),
      ).toEqual([
        {
          id: "aid_mira_discord",
          personId: "prsn_mira",
          identityKeyHash: "hash-mira",
          visibility: "private",
        },
      ]);

      const evidence = await migrated.client.execute(
        "SELECT claim_id, source_kind, assurance, verified_at FROM auth_identity_evidence",
      );
      expect(
        evidence.rows.map((row) => ({
          claimId: row["claim_id"],
          sourceKind: row["source_kind"],
          assurance: row["assurance"],
          verifiedAt: row["verified_at"],
        })),
      ).toEqual([
        {
          claimId: "aid_mira_discord",
          sourceKind: "migration",
          assurance: "verified",
          verifiedAt: 15,
        },
      ]);
      expect(await tableNames(migrated)).toEqual(currentAuthTableNames);
    } finally {
      await migrated.stop();
    }
  });

  it("preserves existing v6 people, users, sessions, links, and claim ids", async () => {
    const storageDir = await tempStorageDir();
    const legacy = createClient({ url: `file:${join(storageDir, "auth.db")}` });
    await legacy.executeMultiple(legacyAuthV4Fixture);
    await legacy.batch(
      [
        `INSERT INTO auth_users
          (id, display_name, role, status, canonical_id, created_at, updated_at)
          VALUES ('usr_existing', 'Existing Person', 'trusted', 'active',
                  'user:existing', 10, 20)`,
        `INSERT INTO auth_identities
          (id, user_id, type, identity_key_hash, label, verified_at, created_at)
          VALUES ('aid_existing_email', 'usr_existing', 'email',
                  'hash-existing', 'e…@example.com', NULL, 12)`,
        `INSERT INTO operator_sessions
          (token_hash, user_id, expires_at, revoked_at, created_at)
          VALUES ('existing-session', 'usr_existing', 9999999999, NULL, 13)`,
      ],
      "write",
    );
    await legacy.executeMultiple(legacyAuthV5Fixture);
    await legacy.executeMultiple(legacyAuthV6Fixture);
    await legacy.execute({
      sql: `INSERT INTO agent_person_links
        (agent_id, person_id, status, created_by_user_id,
         consented_by_user_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        "agent:existing",
        "prsn_existing",
        "active",
        "usr_existing",
        "usr_existing",
        14,
        15,
      ],
    });
    legacy.close();

    const migrated = new AuthRuntimeDatabase({ storageDir });
    await migrated.start();
    try {
      const [user, claim, evidence, session, link] = await Promise.all([
        migrated.client.execute(
          "SELECT id, person_id, role, status FROM auth_users WHERE id = 'usr_existing'",
        ),
        migrated.client.execute(
          "SELECT id, person_id FROM person_identity_claims WHERE id = 'aid_existing_email'",
        ),
        migrated.client.execute(
          "SELECT claim_id, assurance FROM auth_identity_evidence WHERE claim_id = 'aid_existing_email'",
        ),
        migrated.client.execute(
          "SELECT user_id FROM auth_sessions WHERE token_hash = 'existing-session'",
        ),
        migrated.client.execute(
          "SELECT agent_id, person_id, status FROM agent_person_links WHERE agent_id = 'agent:existing'",
        ),
      ]);

      expect(user.rows[0]).toMatchObject({
        id: "usr_existing",
        person_id: "prsn_existing",
        role: "trusted",
        status: "active",
      });
      expect(claim.rows[0]).toMatchObject({
        id: "aid_existing_email",
        person_id: "prsn_existing",
      });
      expect(evidence.rows[0]).toMatchObject({
        claim_id: "aid_existing_email",
        assurance: "asserted",
      });
      expect(session.rows[0]?.["user_id"]).toBe("usr_existing");
      expect(link.rows[0]).toMatchObject({
        agent_id: "agent:existing",
        person_id: "prsn_existing",
        status: "active",
      });
      expect(await tableNames(migrated)).toEqual(currentAuthTableNames);
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
      const migrations = await second.client.execute(
        "SELECT hash, created_at FROM __drizzle_migrations",
      );
      expect(migrations.rows).toHaveLength(3);
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
