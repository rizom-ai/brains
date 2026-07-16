-- Historical pre-Drizzle auth schema after legacy migrations 1-4.
-- This fixture is test input for the bounded compatibility bridge only.
CREATE TABLE auth_schema_migrations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL
);

INSERT INTO auth_schema_migrations (id, name, applied_at) VALUES
  (1, 'initial-auth-runtime-schema', 1),
  (2, 'optional-webauthn-challenge-user', 2),
  (3, 'a2a-peer-trust', 3),
  (4, 'signing-key-purpose', 4);

CREATE TABLE auth_users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('anchor', 'trusted', 'public')),
  status TEXT NOT NULL CHECK (status IN ('active', 'invited', 'suspended')),
  canonical_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_auth_users_canonical_id
  ON auth_users(canonical_id) WHERE canonical_id IS NOT NULL;

CREATE TABLE auth_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (
    type IN ('passkey', 'discord', 'mcp', 'oauth', 'email', 'did', 'a2a')
  ),
  issuer TEXT,
  identity_key_hash TEXT NOT NULL,
  delivery_subject TEXT,
  label TEXT,
  verified_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_auth_identities_active_key
  ON auth_identities(identity_key_hash) WHERE revoked_at IS NULL;
CREATE INDEX idx_auth_identities_user_id ON auth_identities(user_id);

CREATE TABLE passkey_credentials (
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
);
CREATE INDEX idx_passkey_credentials_user_id
  ON passkey_credentials(user_id);

CREATE TABLE webauthn_challenges (
  challenge_hash TEXT PRIMARY KEY,
  user_id TEXT REFERENCES auth_users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('registration', 'authentication')),
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_webauthn_challenges_user_id
  ON webauthn_challenges(user_id);

CREATE TABLE operator_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_operator_sessions_user_id ON operator_sessions(user_id);

CREATE TABLE oauth_clients (
  client_id TEXT PRIMARY KEY,
  secret_hash TEXT,
  metadata_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE oauth_auth_codes (
  code_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  pkce_challenge TEXT NOT NULL,
  scope TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_oauth_auth_codes_client_id
  ON oauth_auth_codes(client_id);

CREATE TABLE oauth_refresh_tokens (
  token_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  replaced_by_hash TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_oauth_refresh_tokens_user_id
  ON oauth_refresh_tokens(user_id);

CREATE TABLE oauth_signing_keys (
  kid TEXT PRIMARY KEY,
  private_jwk TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'retired')),
  created_at INTEGER NOT NULL,
  retired_at INTEGER,
  purpose TEXT NOT NULL DEFAULT 'oauth' CHECK (purpose IN ('oauth', 'a2a'))
);
CREATE UNIQUE INDEX idx_oauth_signing_keys_active_purpose
  ON oauth_signing_keys(purpose) WHERE status = 'active';

CREATE TABLE setup_tokens (
  token_hash TEXT PRIMARY KEY,
  purpose TEXT NOT NULL,
  target_user_id TEXT REFERENCES auth_users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  delivery_key_hash TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_setup_tokens_target_user_id ON setup_tokens(target_user_id);

CREATE TABLE auth_audit_events (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES auth_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_auth_audit_events_actor_user_id
  ON auth_audit_events(actor_user_id);

CREATE TABLE a2a_peer_trust (
  domain TEXT PRIMARY KEY,
  key_fingerprint TEXT NOT NULL,
  granted_level TEXT NOT NULL CHECK (granted_level IN ('public', 'trusted')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
