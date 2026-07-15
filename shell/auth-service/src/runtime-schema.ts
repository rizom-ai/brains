import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  type SQLiteColumn,
  type SQLiteTableWithColumns,
} from "drizzle-orm/sqlite-core";

type AuthTextColumn<
  TTableName extends string,
  TName extends string,
  TNotNull extends boolean,
  TPrimaryKey extends boolean = false,
  TData = string,
  TEnumValues extends [string, ...string[]] = [string, ...string[]],
> = SQLiteColumn<
  {
    name: TName;
    tableName: TTableName;
    dataType: "string";
    columnType: "SQLiteText";
    data: TData;
    driverParam: string;
    notNull: TNotNull;
    hasDefault: false;
    isPrimaryKey: TPrimaryKey;
    isAutoincrement: false;
    hasRuntimeDefault: false;
    enumValues: TEnumValues;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  },
  Record<string, never>,
  { length: number | undefined }
>;

type AuthIntegerColumn<
  TTableName extends string,
  TName extends string,
  TNotNull extends boolean,
  TPrimaryKey extends boolean = false,
  THasDefault extends boolean = false,
> = SQLiteColumn<
  {
    name: TName;
    tableName: TTableName;
    dataType: "number";
    columnType: "SQLiteInteger";
    data: number;
    driverParam: number;
    notNull: TNotNull;
    hasDefault: THasDefault;
    isPrimaryKey: TPrimaryKey;
    isAutoincrement: false;
    hasRuntimeDefault: false;
    enumValues: undefined;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  },
  Record<string, never>,
  Record<string, never>
>;

type AuthBooleanColumn<
  TTableName extends string,
  TName extends string,
  TNotNull extends boolean,
> = SQLiteColumn<
  {
    name: TName;
    tableName: TTableName;
    dataType: "boolean";
    columnType: "SQLiteBoolean";
    data: boolean;
    driverParam: number;
    notNull: TNotNull;
    hasDefault: false;
    isPrimaryKey: false;
    isAutoincrement: false;
    hasRuntimeDefault: false;
    enumValues: undefined;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  },
  Record<string, never>,
  Record<string, never>
>;

type AuthTable<
  TName extends string,
  TColumns extends Record<string, SQLiteColumn>,
> = SQLiteTableWithColumns<{
  name: TName;
  schema: undefined;
  columns: TColumns;
  dialect: "sqlite";
}>;

type AuthUsersTable = AuthTable<
  "auth_users",
  {
    id: AuthTextColumn<"auth_users", "id", true, true>;
    displayName: AuthTextColumn<"auth_users", "display_name", true>;
    role: AuthTextColumn<
      "auth_users",
      "role",
      true,
      false,
      "anchor" | "trusted" | "public",
      ["anchor", "trusted", "public"]
    >;
    status: AuthTextColumn<
      "auth_users",
      "status",
      true,
      false,
      "active" | "invited" | "suspended",
      ["active", "invited", "suspended"]
    >;
    canonicalId: AuthTextColumn<"auth_users", "canonical_id", false>;
    createdAt: AuthIntegerColumn<"auth_users", "created_at", true>;
    updatedAt: AuthIntegerColumn<"auth_users", "updated_at", true>;
  }
>;

export const authUsers: AuthUsersTable = sqliteTable(
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

type AuthIdentitiesTable = AuthTable<
  "auth_identities",
  {
    id: AuthTextColumn<"auth_identities", "id", true, true>;
    userId: AuthTextColumn<"auth_identities", "user_id", true>;
    type: AuthTextColumn<
      "auth_identities",
      "type",
      true,
      false,
      "passkey" | "discord" | "mcp" | "oauth" | "email" | "did" | "a2a",
      ["passkey", "discord", "mcp", "oauth", "email", "did", "a2a"]
    >;
    issuer: AuthTextColumn<"auth_identities", "issuer", false>;
    identityKeyHash: AuthTextColumn<
      "auth_identities",
      "identity_key_hash",
      true
    >;
    deliverySubject: AuthTextColumn<
      "auth_identities",
      "delivery_subject",
      false
    >;
    label: AuthTextColumn<"auth_identities", "label", false>;
    verifiedAt: AuthIntegerColumn<"auth_identities", "verified_at", false>;
    revokedAt: AuthIntegerColumn<"auth_identities", "revoked_at", false>;
    createdAt: AuthIntegerColumn<"auth_identities", "created_at", true>;
  }
>;

export const authIdentities: AuthIdentitiesTable = sqliteTable(
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

type PasskeyCredentialsTable = AuthTable<
  "passkey_credentials",
  {
    id: AuthTextColumn<"passkey_credentials", "id", true, true>;
    userId: AuthTextColumn<"passkey_credentials", "user_id", true>;
    publicKey: AuthTextColumn<"passkey_credentials", "public_key", true>;
    counter: AuthIntegerColumn<"passkey_credentials", "counter", true>;
    transportsJson: AuthTextColumn<
      "passkey_credentials",
      "transports_json",
      false
    >;
    credentialDeviceType: AuthTextColumn<
      "passkey_credentials",
      "credential_device_type",
      false
    >;
    credentialBackedUp: AuthBooleanColumn<
      "passkey_credentials",
      "credential_backed_up",
      true
    >;
    createdAt: AuthIntegerColumn<"passkey_credentials", "created_at", true>;
    updatedAt: AuthIntegerColumn<"passkey_credentials", "updated_at", true>;
    revokedAt: AuthIntegerColumn<"passkey_credentials", "revoked_at", false>;
  }
>;

export const passkeyCredentials: PasskeyCredentialsTable = sqliteTable(
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

type WebauthnChallengesTable = AuthTable<
  "webauthn_challenges",
  {
    challengeHash: AuthTextColumn<
      "webauthn_challenges",
      "challenge_hash",
      true,
      true
    >;
    userId: AuthTextColumn<"webauthn_challenges", "user_id", false>;
    kind: AuthTextColumn<
      "webauthn_challenges",
      "kind",
      true,
      false,
      "registration" | "authentication",
      ["registration", "authentication"]
    >;
    expiresAt: AuthIntegerColumn<"webauthn_challenges", "expires_at", true>;
    consumedAt: AuthIntegerColumn<"webauthn_challenges", "consumed_at", false>;
    createdAt: AuthIntegerColumn<"webauthn_challenges", "created_at", true>;
  }
>;

export const webauthnChallenges: WebauthnChallengesTable = sqliteTable(
  "webauthn_challenges",
  {
    challengeHash: text("challenge_hash").primaryKey(),
    userId: text("user_id").references(() => authUsers.id, {
      onDelete: "cascade",
    }),
    kind: text("kind", { enum: ["registration", "authentication"] }).notNull(),
    expiresAt: integer("expires_at").notNull(),
    consumedAt: integer("consumed_at"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => ({
    userIdIdx: index("idx_webauthn_challenges_user_id").on(table.userId),
  }),
);

type AuthSessionsTable = AuthTable<
  "auth_sessions",
  {
    tokenHash: AuthTextColumn<"auth_sessions", "token_hash", true, true>;
    userId: AuthTextColumn<"auth_sessions", "user_id", true>;
    expiresAt: AuthIntegerColumn<"auth_sessions", "expires_at", true>;
    revokedAt: AuthIntegerColumn<"auth_sessions", "revoked_at", false>;
    createdAt: AuthIntegerColumn<"auth_sessions", "created_at", true>;
  }
>;

export const authSessions: AuthSessionsTable = sqliteTable(
  "auth_sessions",
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
    userIdIdx: index("idx_auth_sessions_user_id").on(table.userId),
  }),
);

type OauthClientsTable = AuthTable<
  "oauth_clients",
  {
    clientId: AuthTextColumn<"oauth_clients", "client_id", true, true>;
    secretHash: AuthTextColumn<"oauth_clients", "secret_hash", false>;
    metadataJson: AuthTextColumn<"oauth_clients", "metadata_json", true>;
    createdAt: AuthIntegerColumn<"oauth_clients", "created_at", true>;
    updatedAt: AuthIntegerColumn<"oauth_clients", "updated_at", true>;
  }
>;

export const oauthClients: OauthClientsTable = sqliteTable("oauth_clients", {
  clientId: text("client_id").primaryKey(),
  secretHash: text("secret_hash"),
  metadataJson: text("metadata_json").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

type OauthAuthCodesTable = AuthTable<
  "oauth_auth_codes",
  {
    codeHash: AuthTextColumn<"oauth_auth_codes", "code_hash", true, true>;
    clientId: AuthTextColumn<"oauth_auth_codes", "client_id", true>;
    userId: AuthTextColumn<"oauth_auth_codes", "user_id", true>;
    redirectUri: AuthTextColumn<"oauth_auth_codes", "redirect_uri", true>;
    pkceChallenge: AuthTextColumn<"oauth_auth_codes", "pkce_challenge", true>;
    scope: AuthTextColumn<"oauth_auth_codes", "scope", true>;
    expiresAt: AuthIntegerColumn<"oauth_auth_codes", "expires_at", true>;
    consumedAt: AuthIntegerColumn<"oauth_auth_codes", "consumed_at", false>;
    createdAt: AuthIntegerColumn<"oauth_auth_codes", "created_at", true>;
  }
>;

export const oauthAuthCodes: OauthAuthCodesTable = sqliteTable(
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

type OauthRefreshTokensTable = AuthTable<
  "oauth_refresh_tokens",
  {
    tokenHash: AuthTextColumn<"oauth_refresh_tokens", "token_hash", true, true>;
    clientId: AuthTextColumn<"oauth_refresh_tokens", "client_id", true>;
    userId: AuthTextColumn<"oauth_refresh_tokens", "user_id", true>;
    scope: AuthTextColumn<"oauth_refresh_tokens", "scope", true>;
    expiresAt: AuthIntegerColumn<"oauth_refresh_tokens", "expires_at", true>;
    revokedAt: AuthIntegerColumn<"oauth_refresh_tokens", "revoked_at", false>;
    replacedByHash: AuthTextColumn<
      "oauth_refresh_tokens",
      "replaced_by_hash",
      false
    >;
    createdAt: AuthIntegerColumn<"oauth_refresh_tokens", "created_at", true>;
  }
>;

export const oauthRefreshTokens: OauthRefreshTokensTable = sqliteTable(
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

type OauthSigningKeysTable = AuthTable<
  "oauth_signing_keys",
  {
    kid: AuthTextColumn<"oauth_signing_keys", "kid", true, true>;
    purpose: AuthTextColumn<
      "oauth_signing_keys",
      "purpose",
      true,
      false,
      "oauth" | "a2a",
      ["oauth", "a2a"]
    >;
    privateJwk: AuthTextColumn<"oauth_signing_keys", "private_jwk", true>;
    status: AuthTextColumn<
      "oauth_signing_keys",
      "status",
      true,
      false,
      "active" | "retired",
      ["active", "retired"]
    >;
    createdAt: AuthIntegerColumn<"oauth_signing_keys", "created_at", true>;
    retiredAt: AuthIntegerColumn<"oauth_signing_keys", "retired_at", false>;
  }
>;

export const oauthSigningKeys: OauthSigningKeysTable = sqliteTable(
  "oauth_signing_keys",
  {
    kid: text("kid").primaryKey(),
    purpose: text("purpose", { enum: ["oauth", "a2a"] }).notNull(),
    privateJwk: text("private_jwk").notNull(),
    status: text("status", { enum: ["active", "retired"] }).notNull(),
    createdAt: integer("created_at").notNull(),
    retiredAt: integer("retired_at"),
  },
);

type SetupTokensTable = AuthTable<
  "setup_tokens",
  {
    tokenHash: AuthTextColumn<"setup_tokens", "token_hash", true, true>;
    purpose: AuthTextColumn<"setup_tokens", "purpose", true>;
    targetUserId: AuthTextColumn<"setup_tokens", "target_user_id", false>;
    expiresAt: AuthIntegerColumn<"setup_tokens", "expires_at", true>;
    consumedAt: AuthIntegerColumn<"setup_tokens", "consumed_at", false>;
    deliveryKeyHash: AuthTextColumn<"setup_tokens", "delivery_key_hash", false>;
    createdAt: AuthIntegerColumn<"setup_tokens", "created_at", true>;
  }
>;

export const setupTokens: SetupTokensTable = sqliteTable(
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

type AuthAuditEventsTable = AuthTable<
  "auth_audit_events",
  {
    id: AuthTextColumn<"auth_audit_events", "id", true, true>;
    actorUserId: AuthTextColumn<"auth_audit_events", "actor_user_id", false>;
    action: AuthTextColumn<"auth_audit_events", "action", true>;
    targetType: AuthTextColumn<"auth_audit_events", "target_type", false>;
    targetId: AuthTextColumn<"auth_audit_events", "target_id", false>;
    metadataJson: AuthTextColumn<"auth_audit_events", "metadata_json", false>;
    createdAt: AuthIntegerColumn<"auth_audit_events", "created_at", true>;
  }
>;

export const authAuditEvents: AuthAuditEventsTable = sqliteTable(
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

type A2aPeerTrustTable = AuthTable<
  "a2a_peer_trust",
  {
    domain: AuthTextColumn<"a2a_peer_trust", "domain", true, true>;
    keyFingerprint: AuthTextColumn<"a2a_peer_trust", "key_fingerprint", true>;
    grantedLevel: AuthTextColumn<
      "a2a_peer_trust",
      "granted_level",
      true,
      false,
      "public" | "trusted",
      ["public", "trusted"]
    >;
    createdAt: AuthIntegerColumn<"a2a_peer_trust", "created_at", true>;
    updatedAt: AuthIntegerColumn<"a2a_peer_trust", "updated_at", true>;
  }
>;

export const a2aPeerTrust: A2aPeerTrustTable = sqliteTable("a2a_peer_trust", {
  domain: text("domain").primaryKey(),
  keyFingerprint: text("key_fingerprint").notNull(),
  grantedLevel: text("granted_level", {
    enum: ["public", "trusted"],
  }).notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

type AuthSchemaMigrationsTable = AuthTable<
  "auth_schema_migrations",
  {
    id: AuthIntegerColumn<"auth_schema_migrations", "id", true, true, true>;
    name: AuthTextColumn<"auth_schema_migrations", "name", true>;
    appliedAt: AuthIntegerColumn<"auth_schema_migrations", "applied_at", true>;
  }
>;

export const authSchemaMigrations: AuthSchemaMigrationsTable = sqliteTable(
  "auth_schema_migrations",
  {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    appliedAt: integer("applied_at").notNull(),
  },
);

export const authRuntimeSchema: {
  a2aPeerTrust: A2aPeerTrustTable;
  authAuditEvents: AuthAuditEventsTable;
  authIdentities: AuthIdentitiesTable;
  authSchemaMigrations: AuthSchemaMigrationsTable;
  authUsers: AuthUsersTable;
  oauthAuthCodes: OauthAuthCodesTable;
  oauthClients: OauthClientsTable;
  oauthRefreshTokens: OauthRefreshTokensTable;
  oauthSigningKeys: OauthSigningKeysTable;
  authSessions: AuthSessionsTable;
  passkeyCredentials: PasskeyCredentialsTable;
  setupTokens: SetupTokensTable;
  webauthnChallenges: WebauthnChallengesTable;
} = {
  a2aPeerTrust,
  authAuditEvents,
  authIdentities,
  authSchemaMigrations,
  authUsers,
  oauthAuthCodes,
  oauthClients,
  oauthRefreshTokens,
  oauthSigningKeys,
  authSessions,
  passkeyCredentials,
  setupTokens,
  webauthnChallenges,
};

export type AuthUser = typeof authUsers.$inferSelect;
export type InsertAuthUser = typeof authUsers.$inferInsert;
export type AuthIdentity = typeof authIdentities.$inferSelect;
export type InsertAuthIdentity = typeof authIdentities.$inferInsert;
