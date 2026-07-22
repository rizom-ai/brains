import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
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
  THasDefault extends boolean = false,
> = SQLiteColumn<
  {
    name: TName;
    tableName: TTableName;
    dataType: "string";
    columnType: "SQLiteText";
    data: TData;
    driverParam: string;
    notNull: TNotNull;
    hasDefault: THasDefault;
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

type AuthPeopleTable = AuthTable<
  "auth_people",
  {
    id: AuthTextColumn<"auth_people", "id", true, true>;
    displayName: AuthTextColumn<"auth_people", "display_name", true>;
    profileEntityId: AuthTextColumn<"auth_people", "profile_entity_id", false>;
    createdAt: AuthIntegerColumn<"auth_people", "created_at", true>;
    updatedAt: AuthIntegerColumn<"auth_people", "updated_at", true>;
  }
>;

export const authPeople: AuthPeopleTable = sqliteTable(
  "auth_people",
  {
    id: text("id").primaryKey(),
    displayName: text("display_name").notNull(),
    profileEntityId: text("profile_entity_id"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => ({
    profileEntityIdIdx: uniqueIndex("idx_auth_people_profile_entity_id").on(
      table.profileEntityId,
    ),
  }),
);

type AuthBrainAnchorTable = AuthTable<
  "auth_brain_anchor",
  {
    id: AuthTextColumn<"auth_brain_anchor", "id", true, true>;
    kind: AuthTextColumn<
      "auth_brain_anchor",
      "kind",
      true,
      false,
      "person" | "collective",
      ["person", "collective"]
    >;
    subjectId: AuthTextColumn<"auth_brain_anchor", "subject_id", true>;
    displayName: AuthTextColumn<"auth_brain_anchor", "display_name", true>;
    profileEntityId: AuthTextColumn<
      "auth_brain_anchor",
      "profile_entity_id",
      false
    >;
    createdAt: AuthIntegerColumn<"auth_brain_anchor", "created_at", true>;
    updatedAt: AuthIntegerColumn<"auth_brain_anchor", "updated_at", true>;
  }
>;

export const authBrainAnchor: AuthBrainAnchorTable = sqliteTable(
  "auth_brain_anchor",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: ["person", "collective"] }).notNull(),
    subjectId: text("subject_id").notNull(),
    displayName: text("display_name").notNull(),
    profileEntityId: text("profile_entity_id"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => ({
    singletonCheck: check(
      "auth_brain_anchor_singleton_check",
      sql`${table.id} = 'brain'`,
    ),
    kindCheck: check(
      "auth_brain_anchor_kind_check",
      sql`${table.kind} IN ('person', 'collective')`,
    ),
  }),
);

type AuthUsersTable = AuthTable<
  "auth_users",
  {
    id: AuthTextColumn<"auth_users", "id", true, true>;
    personId: AuthTextColumn<"auth_users", "person_id", true>;
    displayName: AuthTextColumn<"auth_users", "display_name", true>;
    role: AuthTextColumn<
      "auth_users",
      "role",
      true,
      false,
      "admin" | "trusted" | "public",
      ["admin", "trusted", "public"]
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
    personId: text("person_id")
      .notNull()
      .references(() => authPeople.id, {
        onDelete: "restrict",
      }),
    displayName: text("display_name").notNull(),
    role: text("role", { enum: ["admin", "trusted", "public"] }).notNull(),
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
    personIdIdx: uniqueIndex("idx_auth_users_person_id").on(table.personId),
    roleCheck: check(
      "auth_users_role_check",
      sql`${table.role} IN ('admin', 'trusted', 'public')`,
    ),
    statusCheck: check(
      "auth_users_status_check",
      sql`${table.status} IN ('active', 'invited', 'suspended')`,
    ),
  }),
);

type PersonIdentityClaimsTable = AuthTable<
  "person_identity_claims",
  {
    id: AuthTextColumn<"person_identity_claims", "id", true, true>;
    personId: AuthTextColumn<"person_identity_claims", "person_id", true>;
    type: AuthTextColumn<
      "person_identity_claims",
      "type",
      true,
      false,
      "passkey" | "discord" | "mcp" | "oauth" | "email" | "did" | "a2a",
      ["passkey", "discord", "mcp", "oauth", "email", "did", "a2a"]
    >;
    issuer: AuthTextColumn<"person_identity_claims", "issuer", false>;
    identityKeyHash: AuthTextColumn<
      "person_identity_claims",
      "identity_key_hash",
      true
    >;
    deliverySubject: AuthTextColumn<
      "person_identity_claims",
      "delivery_subject",
      false
    >;
    label: AuthTextColumn<"person_identity_claims", "label", false>;
    visibility: AuthTextColumn<
      "person_identity_claims",
      "visibility",
      true,
      false,
      "private" | "trusted" | "public",
      ["private", "trusted", "public"]
    >;
    revokedAt: AuthIntegerColumn<"person_identity_claims", "revoked_at", false>;
    createdAt: AuthIntegerColumn<"person_identity_claims", "created_at", true>;
  }
>;

export const authIdentities: PersonIdentityClaimsTable = sqliteTable(
  "person_identity_claims",
  {
    id: text("id").primaryKey(),
    personId: text("person_id")
      .notNull()
      .references(() => authPeople.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: ["passkey", "discord", "mcp", "oauth", "email", "did", "a2a"],
    }).notNull(),
    issuer: text("issuer"),
    identityKeyHash: text("identity_key_hash").notNull(),
    deliverySubject: text("delivery_subject"),
    label: text("label"),
    visibility: text("visibility", {
      enum: ["private", "trusted", "public"],
    }).notNull(),
    revokedAt: integer("revoked_at"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => ({
    activeKeyIdx: uniqueIndex("idx_person_identity_claims_active_key")
      .on(table.identityKeyHash)
      .where(sql`revoked_at IS NULL`),
    keyIdx: index("idx_person_identity_claims_key").on(table.identityKeyHash),
    personIdIdx: index("idx_person_identity_claims_person_id").on(
      table.personId,
    ),
    typeCheck: check(
      "person_identity_claims_type_check",
      sql`${table.type} IN ('passkey', 'discord', 'mcp', 'oauth', 'email', 'did', 'a2a')`,
    ),
    visibilityCheck: check(
      "person_identity_claims_visibility_check",
      sql`${table.visibility} IN ('private', 'trusted', 'public')`,
    ),
  }),
);

type AuthIdentityEvidenceTable = AuthTable<
  "auth_identity_evidence",
  {
    id: AuthTextColumn<"auth_identity_evidence", "id", true, true>;
    claimId: AuthTextColumn<"auth_identity_evidence", "claim_id", true>;
    sourceKind: AuthTextColumn<
      "auth_identity_evidence",
      "source_kind",
      true,
      false,
      "admin" | "agent" | "migration" | "provider",
      ["admin", "agent", "migration", "provider"]
    >;
    sourceId: AuthTextColumn<"auth_identity_evidence", "source_id", false>;
    assurance: AuthTextColumn<
      "auth_identity_evidence",
      "assurance",
      true,
      false,
      "asserted" | "verified",
      ["asserted", "verified"]
    >;
    verifiedAt: AuthIntegerColumn<
      "auth_identity_evidence",
      "verified_at",
      false
    >;
    createdAt: AuthIntegerColumn<"auth_identity_evidence", "created_at", true>;
  }
>;

export const authIdentityEvidence: AuthIdentityEvidenceTable = sqliteTable(
  "auth_identity_evidence",
  {
    id: text("id").primaryKey(),
    claimId: text("claim_id")
      .notNull()
      .references(() => authIdentities.id, { onDelete: "cascade" }),
    sourceKind: text("source_kind", {
      enum: ["admin", "agent", "migration", "provider"],
    }).notNull(),
    sourceId: text("source_id"),
    assurance: text("assurance", {
      enum: ["asserted", "verified"],
    }).notNull(),
    verifiedAt: integer("verified_at"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => ({
    claimIdIdx: index("idx_auth_identity_evidence_claim_id").on(table.claimId),
    verifiedIdx: index("idx_auth_identity_evidence_verified").on(
      table.claimId,
      table.assurance,
    ),
    sourceKindCheck: check(
      "auth_identity_evidence_source_kind_check",
      sql`${table.sourceKind} IN ('admin', 'agent', 'migration', 'provider')`,
    ),
    assuranceCheck: check(
      "auth_identity_evidence_assurance_check",
      sql`${table.assurance} IN ('asserted', 'verified')`,
    ),
    verificationCheck: check(
      "auth_identity_evidence_verification_check",
      sql`(${table.assurance} = 'asserted' AND ${table.verifiedAt} IS NULL)
          OR (${table.assurance} = 'verified' AND ${table.verifiedAt} IS NOT NULL)`,
    ),
  }),
);

type PersonExternalPeersTable = AuthTable<
  "person_external_peers",
  {
    peerId: AuthTextColumn<"person_external_peers", "peer_id", true, true>;
    personId: AuthTextColumn<"person_external_peers", "person_id", true>;
    verificationStatus: AuthTextColumn<
      "person_external_peers",
      "verification_status",
      true,
      false,
      "unverified" | "verified",
      ["unverified", "verified"]
    >;
    createdByUserId: AuthTextColumn<
      "person_external_peers",
      "created_by_user_id",
      false
    >;
    createdAt: AuthIntegerColumn<"person_external_peers", "created_at", true>;
    updatedAt: AuthIntegerColumn<"person_external_peers", "updated_at", true>;
  }
>;

/**
 * Associates a local person with an independent external brain actor.
 * This relation grants no access and carries no representation semantics.
 */
export const personExternalPeers: PersonExternalPeersTable = sqliteTable(
  "person_external_peers",
  {
    peerId: text("peer_id").primaryKey(),
    personId: text("person_id")
      .notNull()
      .references(() => authPeople.id, { onDelete: "cascade" }),
    verificationStatus: text("verification_status", {
      enum: ["unverified", "verified"],
    }).notNull(),
    createdByUserId: text("created_by_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => ({
    personIdIdx: index("idx_person_external_peers_person_id").on(
      table.personId,
    ),
    verificationStatusCheck: check(
      "person_external_peers_verification_status_check",
      sql`${table.verificationStatus} IN ('unverified', 'verified')`,
    ),
  }),
);

type InterfacePrincipalGrantsTable = AuthTable<
  "interface_principal_grants",
  {
    id: AuthTextColumn<"interface_principal_grants", "id", true, true>;
    interfaceType: AuthTextColumn<
      "interface_principal_grants",
      "interface_type",
      true
    >;
    principalKeyHash: AuthTextColumn<
      "interface_principal_grants",
      "principal_key_hash",
      true
    >;
    label: AuthTextColumn<
      "interface_principal_grants",
      "label",
      true,
      false,
      string,
      [string, ...string[]],
      true
    >;
    permissionLevel: AuthTextColumn<
      "interface_principal_grants",
      "permission_level",
      true,
      false,
      "admin" | "trusted",
      ["admin", "trusted"]
    >;
    source: AuthTextColumn<
      "interface_principal_grants",
      "source",
      true,
      false,
      "config" | "admin",
      ["config", "admin"]
    >;
    createdAt: AuthIntegerColumn<
      "interface_principal_grants",
      "created_at",
      true
    >;
    updatedAt: AuthIntegerColumn<
      "interface_principal_grants",
      "updated_at",
      true
    >;
    revokedAt: AuthIntegerColumn<
      "interface_principal_grants",
      "revoked_at",
      false
    >;
  }
>;

export const interfacePrincipalGrants: InterfacePrincipalGrantsTable =
  sqliteTable(
    "interface_principal_grants",
    {
      id: text("id").primaryKey(),
      interfaceType: text("interface_type").notNull(),
      principalKeyHash: text("principal_key_hash").notNull(),
      label: text("label").notNull().default("Unnamed principal"),
      permissionLevel: text("permission_level", {
        enum: ["admin", "trusted"],
      }).notNull(),
      source: text("source", { enum: ["config", "admin"] }).notNull(),
      createdAt: integer("created_at").notNull(),
      updatedAt: integer("updated_at").notNull(),
      revokedAt: integer("revoked_at"),
    },
    (table) => ({
      activePrincipalIdx: uniqueIndex(
        "idx_interface_principal_grants_active_principal",
      )
        .on(table.interfaceType, table.principalKeyHash)
        .where(sql`revoked_at IS NULL`),
      permissionLevelCheck: check(
        "interface_principal_grants_permission_level_check",
        sql`${table.permissionLevel} IN ('admin', 'trusted')`,
      ),
      sourceCheck: check(
        "interface_principal_grants_source_check",
        sql`${table.source} IN ('config', 'admin')`,
      ),
    }),
  );

type InterfaceAnchorBindingsTable = AuthTable<
  "interface_anchor_bindings",
  {
    id: AuthTextColumn<"interface_anchor_bindings", "id", true, true>;
    interfaceType: AuthTextColumn<
      "interface_anchor_bindings",
      "interface_type",
      true
    >;
    principalKeyHash: AuthTextColumn<
      "interface_anchor_bindings",
      "principal_key_hash",
      true
    >;
    source: AuthTextColumn<
      "interface_anchor_bindings",
      "source",
      true,
      false,
      "config" | "admin",
      ["config", "admin"]
    >;
    createdAt: AuthIntegerColumn<
      "interface_anchor_bindings",
      "created_at",
      true
    >;
    updatedAt: AuthIntegerColumn<
      "interface_anchor_bindings",
      "updated_at",
      true
    >;
    revokedAt: AuthIntegerColumn<
      "interface_anchor_bindings",
      "revoked_at",
      false
    >;
  }
>;

export const interfaceAnchorBindings: InterfaceAnchorBindingsTable =
  sqliteTable(
    "interface_anchor_bindings",
    {
      id: text("id").primaryKey(),
      interfaceType: text("interface_type").notNull(),
      principalKeyHash: text("principal_key_hash").notNull(),
      source: text("source", { enum: ["config", "admin"] }).notNull(),
      createdAt: integer("created_at").notNull(),
      updatedAt: integer("updated_at").notNull(),
      revokedAt: integer("revoked_at"),
    },
    (table) => ({
      activePrincipalIdx: uniqueIndex(
        "idx_interface_anchor_bindings_active_principal",
      )
        .on(table.interfaceType, table.principalKeyHash)
        .where(sql`revoked_at IS NULL`),
      sourceCheck: check(
        "interface_anchor_bindings_source_check",
        sql`${table.source} IN ('config', 'admin')`,
      ),
    }),
  );

type AuthAccessSeedStateTable = AuthTable<
  "auth_access_seed_state",
  {
    id: AuthTextColumn<"auth_access_seed_state", "id", true, true>;
    seededAt: AuthIntegerColumn<"auth_access_seed_state", "seeded_at", true>;
    updatedAt: AuthIntegerColumn<"auth_access_seed_state", "updated_at", true>;
  }
>;

export const authAccessSeedState: AuthAccessSeedStateTable = sqliteTable(
  "auth_access_seed_state",
  {
    id: text("id").primaryKey(),
    seededAt: integer("seeded_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => ({
    singletonCheck: check(
      "auth_access_seed_state_singleton_check",
      sql`${table.id} = 'config'`,
    ),
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
    kindCheck: check(
      "webauthn_challenges_kind_check",
      sql`${table.kind} IN ('registration', 'authentication')`,
    ),
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
  (table) => ({
    activePurposeIdx: uniqueIndex("idx_oauth_signing_keys_active_purpose")
      .on(table.purpose)
      .where(sql`status = 'active'`),
    purposeCheck: check(
      "oauth_signing_keys_purpose_check",
      sql`${table.purpose} IN ('oauth', 'a2a')`,
    ),
    statusCheck: check(
      "oauth_signing_keys_status_check",
      sql`${table.status} IN ('active', 'retired')`,
    ),
  }),
);

type SetupTokensTable = AuthTable<
  "setup_tokens",
  {
    tokenHash: AuthTextColumn<"setup_tokens", "token_hash", true, true>;
    purpose: AuthTextColumn<"setup_tokens", "purpose", true>;
    targetUserId: AuthTextColumn<"setup_tokens", "target_user_id", false>;
    deliveryClaimId: AuthTextColumn<"setup_tokens", "delivery_claim_id", false>;
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
    deliveryClaimId: text("delivery_claim_id").references(
      () => authIdentities.id,
      { onDelete: "cascade" },
    ),
    expiresAt: integer("expires_at").notNull(),
    consumedAt: integer("consumed_at"),
    deliveryKeyHash: text("delivery_key_hash"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => ({
    targetUserIdIdx: index("idx_setup_tokens_target_user_id").on(
      table.targetUserId,
    ),
    deliveryClaimIdIdx: index("idx_setup_tokens_delivery_claim_id").on(
      table.deliveryClaimId,
    ),
    deliveryRequiresTargetCheck: check(
      "setup_tokens_delivery_requires_target_check",
      sql`${table.deliveryClaimId} IS NULL OR ${table.targetUserId} IS NOT NULL`,
    ),
  }),
);

type SetupTokenDeliveriesTable = AuthTable<
  "setup_token_deliveries",
  {
    tokenHash: AuthTextColumn<"setup_token_deliveries", "token_hash", true>;
    recipientHash: AuthTextColumn<
      "setup_token_deliveries",
      "recipient_hash",
      true
    >;
    deliveredAt: AuthIntegerColumn<
      "setup_token_deliveries",
      "delivered_at",
      true
    >;
    deliveryId: AuthTextColumn<"setup_token_deliveries", "delivery_id", false>;
  }
>;

export const setupTokenDeliveries: SetupTokenDeliveriesTable = sqliteTable(
  "setup_token_deliveries",
  {
    tokenHash: text("token_hash")
      .notNull()
      .references(() => setupTokens.tokenHash, { onDelete: "cascade" }),
    recipientHash: text("recipient_hash").notNull(),
    deliveredAt: integer("delivered_at").notNull(),
    deliveryId: text("delivery_id"),
  },
  (table) => ({
    primaryKey: primaryKey({
      columns: [table.tokenHash, table.recipientHash],
    }),
    tokenHashIdx: index("idx_setup_token_deliveries_token_hash").on(
      table.tokenHash,
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

export const a2aPeerTrust: A2aPeerTrustTable = sqliteTable(
  "a2a_peer_trust",
  {
    domain: text("domain").primaryKey(),
    keyFingerprint: text("key_fingerprint").notNull(),
    grantedLevel: text("granted_level", {
      enum: ["public", "trusted"],
    }).notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => ({
    grantedLevelCheck: check(
      "a2a_peer_trust_granted_level_check",
      sql`${table.grantedLevel} IN ('public', 'trusted')`,
    ),
  }),
);

export const authRuntimeSchema: {
  a2aPeerTrust: A2aPeerTrustTable;
  authAccessSeedState: AuthAccessSeedStateTable;
  authAuditEvents: AuthAuditEventsTable;
  authBrainAnchor: AuthBrainAnchorTable;
  authIdentities: PersonIdentityClaimsTable;
  authIdentityEvidence: AuthIdentityEvidenceTable;
  authPeople: AuthPeopleTable;
  authUsers: AuthUsersTable;
  interfaceAnchorBindings: InterfaceAnchorBindingsTable;
  interfacePrincipalGrants: InterfacePrincipalGrantsTable;
  oauthAuthCodes: OauthAuthCodesTable;
  oauthClients: OauthClientsTable;
  oauthRefreshTokens: OauthRefreshTokensTable;
  oauthSigningKeys: OauthSigningKeysTable;
  authSessions: AuthSessionsTable;
  passkeyCredentials: PasskeyCredentialsTable;
  personExternalPeers: PersonExternalPeersTable;
  setupTokenDeliveries: SetupTokenDeliveriesTable;
  setupTokens: SetupTokensTable;
  webauthnChallenges: WebauthnChallengesTable;
} = {
  a2aPeerTrust,
  authAccessSeedState,
  authAuditEvents,
  authBrainAnchor,
  authIdentities,
  authIdentityEvidence,
  authPeople,
  authUsers,
  interfaceAnchorBindings,
  interfacePrincipalGrants,
  oauthAuthCodes,
  oauthClients,
  oauthRefreshTokens,
  oauthSigningKeys,
  authSessions,
  passkeyCredentials,
  personExternalPeers,
  setupTokenDeliveries,
  setupTokens,
  webauthnChallenges,
};

export type PersonExternalPeer = typeof personExternalPeers.$inferSelect;
export type InsertPersonExternalPeer = typeof personExternalPeers.$inferInsert;
export type InterfacePrincipalGrant =
  typeof interfacePrincipalGrants.$inferSelect;
export type InterfaceAnchorBinding =
  typeof interfaceAnchorBindings.$inferSelect;
export type AuthBrainAnchor = typeof authBrainAnchor.$inferSelect;
export type InsertAuthBrainAnchor = typeof authBrainAnchor.$inferInsert;
export type AuthPerson = typeof authPeople.$inferSelect;
export type InsertAuthPerson = typeof authPeople.$inferInsert;
export type AuthUser = typeof authUsers.$inferSelect;
export type InsertAuthUser = typeof authUsers.$inferInsert;
export type AuthIdentity = typeof authIdentities.$inferSelect;
export type InsertAuthIdentity = typeof authIdentities.$inferInsert;
export type AuthIdentityEvidence = typeof authIdentityEvidence.$inferSelect;
export type InsertAuthIdentityEvidence =
  typeof authIdentityEvidence.$inferInsert;
