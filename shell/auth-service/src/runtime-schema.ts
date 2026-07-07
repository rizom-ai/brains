import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const authUsers = sqliteTable(
  "auth_users",
  {
    id: text("id").primaryKey(),
    displayName: text("display_name").notNull(),
    role: text("role", { enum: ["anchor", "trusted", "public"] }).notNull(),
    status: text("status", {
      enum: ["active", "invited", "suspended"],
    }).notNull(),
    canonicalId: text("canonical_id"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => ({
    canonicalIdIdx: uniqueIndex("idx_auth_users_canonical_id").on(
      table.canonicalId,
    ),
  }),
);

export const authIdentities = sqliteTable(
  "auth_identities",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: ["passkey", "discord", "mcp", "oauth", "email", "did", "a2a"],
    }).notNull(),
    issuer: text("issuer"),
    identityKeyHash: text("identity_key_hash").notNull(),
    deliverySubject: text("delivery_subject"),
    label: text("label"),
    verifiedAt: integer("verified_at"),
    revokedAt: integer("revoked_at"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => ({
    activeKeyIdx: uniqueIndex("idx_auth_identities_active_key")
      .on(table.identityKeyHash)
      .where(sql`revoked_at IS NULL`),
    userIdIdx: index("idx_auth_identities_user_id").on(table.userId),
  }),
);

export const passkeyCredentials = sqliteTable(
  "passkey_credentials",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    publicKey: text("public_key").notNull(),
    counter: integer("counter").notNull(),
    transportsJson: text("transports_json"),
    credentialDeviceType: text("credential_device_type"),
    credentialBackedUp: integer("credential_backed_up", {
      mode: "boolean",
    }).notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    revokedAt: integer("revoked_at"),
  },
  (table) => ({
    userIdIdx: index("idx_passkey_credentials_user_id").on(table.userId),
  }),
);

export const webauthnChallenges = sqliteTable(
  "webauthn_challenges",
  {
    challengeHash: text("challenge_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["registration", "authentication"] }).notNull(),
    expiresAt: integer("expires_at").notNull(),
    consumedAt: integer("consumed_at"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => ({
    userIdIdx: index("idx_webauthn_challenges_user_id").on(table.userId),
  }),
);

export const operatorSessions = sqliteTable(
  "operator_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at").notNull(),
    revokedAt: integer("revoked_at"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => ({
    userIdIdx: index("idx_operator_sessions_user_id").on(table.userId),
  }),
);

export const oauthClients = sqliteTable("oauth_clients", {
  clientId: text("client_id").primaryKey(),
  secretHash: text("secret_hash"),
  metadataJson: text("metadata_json").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const oauthAuthCodes = sqliteTable(
  "oauth_auth_codes",
  {
    codeHash: text("code_hash").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    redirectUri: text("redirect_uri").notNull(),
    pkceChallenge: text("pkce_challenge").notNull(),
    scope: text("scope").notNull(),
    expiresAt: integer("expires_at").notNull(),
    consumedAt: integer("consumed_at"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => ({
    clientIdIdx: index("idx_oauth_auth_codes_client_id").on(table.clientId),
  }),
);

export const oauthRefreshTokens = sqliteTable(
  "oauth_refresh_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    expiresAt: integer("expires_at").notNull(),
    revokedAt: integer("revoked_at"),
    replacedByHash: text("replaced_by_hash"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => ({
    userIdIdx: index("idx_oauth_refresh_tokens_user_id").on(table.userId),
  }),
);

export const oauthSigningKeys = sqliteTable("oauth_signing_keys", {
  kid: text("kid").primaryKey(),
  privateJwk: text("private_jwk").notNull(),
  status: text("status", { enum: ["active", "retired"] }).notNull(),
  createdAt: integer("created_at").notNull(),
  retiredAt: integer("retired_at"),
});

export const setupTokens = sqliteTable(
  "setup_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    purpose: text("purpose").notNull(),
    targetUserId: text("target_user_id").references(() => authUsers.id, {
      onDelete: "cascade",
    }),
    expiresAt: integer("expires_at").notNull(),
    consumedAt: integer("consumed_at"),
    deliveryKeyHash: text("delivery_key_hash"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => ({
    targetUserIdIdx: index("idx_setup_tokens_target_user_id").on(
      table.targetUserId,
    ),
  }),
);

export const authAuditEvents = sqliteTable(
  "auth_audit_events",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadataJson: text("metadata_json"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => ({
    actorUserIdIdx: index("idx_auth_audit_events_actor_user_id").on(
      table.actorUserId,
    ),
  }),
);

export const authSchemaMigrations = sqliteTable("auth_schema_migrations", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  appliedAt: integer("applied_at").notNull(),
});

export const authRuntimeSchema = {
  authAuditEvents,
  authIdentities,
  authSchemaMigrations,
  authUsers,
  oauthAuthCodes,
  oauthClients,
  oauthRefreshTokens,
  oauthSigningKeys,
  operatorSessions,
  passkeyCredentials,
  setupTokens,
  webauthnChallenges,
};

export type AuthUser = typeof authUsers.$inferSelect;
export type InsertAuthUser = typeof authUsers.$inferInsert;
export type AuthIdentity = typeof authIdentities.$inferSelect;
export type InsertAuthIdentity = typeof authIdentities.$inferInsert;
