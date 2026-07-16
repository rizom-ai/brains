import type { Client, InStatement } from "@libsql/client";

/** Timestamp of the generated Drizzle baseline in drizzle/meta/_journal.json. */
export const AUTH_DRIZZLE_BASELINE_TIMESTAMP = 1_784_196_869_337;

/**
 * One-time bridge for databases created by the pre-Drizzle auth runner.
 * New databases and every migration after the baseline use Drizzle directly.
 */
export async function upgradeLegacyAuthDatabase(client: Client): Promise<void> {
  if (!(await tableExists(client, "auth_schema_migrations"))) return;

  await applyLegacyMigration(client, 2, "optional-webauthn-challenge-user", [
    `CREATE TABLE webauthn_challenges_v2 (
      challenge_hash TEXT PRIMARY KEY,
      user_id TEXT REFERENCES auth_users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('registration', 'authentication')),
      expires_at INTEGER NOT NULL,
      consumed_at INTEGER,
      created_at INTEGER NOT NULL
    )`,
    `INSERT INTO webauthn_challenges_v2
      (challenge_hash, user_id, kind, expires_at, consumed_at, created_at)
      SELECT challenge_hash, user_id, kind, expires_at, consumed_at, created_at
      FROM webauthn_challenges`,
    "DROP TABLE webauthn_challenges",
    "ALTER TABLE webauthn_challenges_v2 RENAME TO webauthn_challenges",
    `CREATE INDEX idx_webauthn_challenges_user_id
      ON webauthn_challenges(user_id)`,
  ]);

  await applyLegacyMigration(client, 3, "a2a-peer-trust", [
    `CREATE TABLE a2a_peer_trust (
      domain TEXT PRIMARY KEY,
      key_fingerprint TEXT NOT NULL,
      granted_level TEXT NOT NULL CHECK (granted_level IN ('public', 'trusted')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
  ]);

  await applyLegacyMigration(client, 4, "signing-key-purpose", [
    `ALTER TABLE oauth_signing_keys
      ADD COLUMN purpose TEXT NOT NULL DEFAULT 'oauth'
      CHECK (purpose IN ('oauth', 'a2a'))`,
    `CREATE UNIQUE INDEX idx_oauth_signing_keys_active_purpose
      ON oauth_signing_keys(purpose) WHERE status = 'active'`,
  ]);

  await applyLegacyMigration(client, 5, "auth-session-terminology", [
    "ALTER TABLE operator_sessions RENAME TO auth_sessions",
    "DROP INDEX IF EXISTS idx_operator_sessions_user_id",
    "CREATE INDEX idx_auth_sessions_user_id ON auth_sessions(user_id)",
  ]);

  await applyLegacyMigration(client, 6, "person-subjects", [
    `CREATE TABLE auth_people (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      profile_entity_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE UNIQUE INDEX idx_auth_people_profile_entity_id
      ON auth_people(profile_entity_id)
      WHERE profile_entity_id IS NOT NULL`,
    `ALTER TABLE auth_users
      ADD COLUMN person_id TEXT REFERENCES auth_people(id) ON DELETE RESTRICT`,
    `INSERT INTO auth_people
      (id, display_name, profile_entity_id, created_at, updated_at)
      SELECT
        CASE
          WHEN id LIKE 'usr_%' THEN 'prsn_' || substr(id, 5)
          ELSE 'prsn_' || id
        END,
        display_name,
        NULL,
        created_at,
        updated_at
      FROM auth_users`,
    `UPDATE auth_users
      SET person_id = CASE
        WHEN id LIKE 'usr_%' THEN 'prsn_' || substr(id, 5)
        ELSE 'prsn_' || id
      END
      WHERE person_id IS NULL`,
    "CREATE UNIQUE INDEX idx_auth_users_person_id ON auth_users(person_id)",
    `ALTER TABLE auth_identities
      ADD COLUMN person_id TEXT REFERENCES auth_people(id) ON DELETE CASCADE`,
    `UPDATE auth_identities
      SET person_id = (
        SELECT auth_users.person_id
        FROM auth_users
        WHERE auth_users.id = auth_identities.user_id
      )
      WHERE person_id IS NULL`,
    "CREATE INDEX idx_auth_identities_person_id ON auth_identities(person_id)",
    `CREATE TABLE agent_person_links (
      agent_id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL REFERENCES auth_people(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'revoked')),
      created_by_user_id TEXT REFERENCES auth_users(id) ON DELETE SET NULL,
      consented_by_user_id TEXT REFERENCES auth_users(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    "CREATE INDEX idx_agent_person_links_person_id ON agent_person_links(person_id)",
  ]);

  await client.batch(
    [
      `CREATE TABLE person_identity_claims (
        id TEXT PRIMARY KEY,
        person_id TEXT NOT NULL REFERENCES auth_people(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('passkey', 'discord', 'mcp', 'oauth', 'email', 'did', 'a2a')),
        issuer TEXT,
        identity_key_hash TEXT NOT NULL,
        delivery_subject TEXT,
        label TEXT,
        visibility TEXT NOT NULL DEFAULT 'private'
          CHECK (visibility IN ('private', 'trusted', 'public')),
        revoked_at INTEGER,
        created_at INTEGER NOT NULL
      )`,
      `CREATE UNIQUE INDEX idx_person_identity_claims_active_key
        ON person_identity_claims(identity_key_hash)
        WHERE revoked_at IS NULL`,
      `CREATE INDEX idx_person_identity_claims_key
        ON person_identity_claims(identity_key_hash)`,
      `CREATE INDEX idx_person_identity_claims_person_id
        ON person_identity_claims(person_id)`,
      `CREATE TABLE auth_identity_evidence (
        id TEXT PRIMARY KEY,
        claim_id TEXT NOT NULL REFERENCES person_identity_claims(id) ON DELETE CASCADE,
        source_kind TEXT NOT NULL
          CHECK (source_kind IN ('admin', 'agent', 'migration', 'provider')),
        source_id TEXT,
        assurance TEXT NOT NULL CHECK (assurance IN ('asserted', 'verified')),
        verified_at INTEGER,
        created_at INTEGER NOT NULL,
        CHECK (
          (assurance = 'asserted' AND verified_at IS NULL)
          OR (assurance = 'verified' AND verified_at IS NOT NULL)
        )
      )`,
      `CREATE INDEX idx_auth_identity_evidence_claim_id
        ON auth_identity_evidence(claim_id)`,
      `CREATE INDEX idx_auth_identity_evidence_verified
        ON auth_identity_evidence(claim_id, assurance)`,
      `INSERT INTO person_identity_claims
        (id, person_id, type, issuer, identity_key_hash, delivery_subject,
         label, visibility, revoked_at, created_at)
        SELECT id, person_id, type, issuer, identity_key_hash,
               delivery_subject, label, 'private', revoked_at, created_at
        FROM auth_identities`,
      `INSERT INTO auth_identity_evidence
        (id, claim_id, source_kind, source_id, assurance, verified_at, created_at)
        SELECT 'aev_' || id,
               id,
               'migration',
               NULL,
               CASE WHEN verified_at IS NULL THEN 'asserted' ELSE 'verified' END,
               verified_at,
               created_at
        FROM auth_identities`,
      "DROP TABLE auth_identities",
      `CREATE TABLE auth_legacy_imports (
        source TEXT PRIMARY KEY,
        completed_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS __drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash TEXT NOT NULL,
        created_at numeric
      )`,
      {
        sql: `INSERT INTO __drizzle_migrations (hash, created_at)
          VALUES (?, ?)`,
        args: ["legacy-auth-runtime-bridge", AUTH_DRIZZLE_BASELINE_TIMESTAMP],
      },
      "DROP TABLE auth_schema_migrations",
    ],
    "write",
  );
}

async function applyLegacyMigration(
  client: Client,
  id: number,
  name: string,
  statements: InStatement[],
): Promise<void> {
  const existing = await client.execute({
    sql: "SELECT id FROM auth_schema_migrations WHERE id = ?",
    args: [id],
  });
  if (existing.rows.length > 0) return;

  await client.batch(
    [
      ...statements,
      {
        sql: `INSERT INTO auth_schema_migrations (id, name, applied_at)
          VALUES (?, ?, ?)`,
        args: [id, name, Date.now()],
      },
    ],
    "write",
  );
}

async function tableExists(client: Client, name: string): Promise<boolean> {
  const result = await client.execute({
    sql: `SELECT name FROM sqlite_master
      WHERE type = 'table' AND name = ?`,
    args: [name],
  });
  return result.rows.length > 0;
}
