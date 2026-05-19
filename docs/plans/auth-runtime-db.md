# Plan: Auth runtime database

## Status

Proposed integration plan. This refines the broader [Operator runtime database](./operator-runtime-db.md) direction for auth-specific state and supersedes the earlier JSON-first idea for canonical identity links unless the DB work is explicitly deferred again.

## Goal

Create one private runtime database for users, credentials, OAuth state, identity bindings, permissions, and auth audit so multi-user auth, hosted Discord routing, conversation attribution, and CMS commit attribution all share the same source of truth.

The database is runtime state. It must never live under `brain-data`, be exported as markdown, or sync through the content git repo.

## Current baseline

`shell/auth-service` already provides OAuth/passkey/JWT foundation, but persistence is split across JSON/JWK files in `./data/auth`:

- `oauth-passkeys.json`
- `oauth-sessions.json`
- `oauth-clients.json`
- `oauth-auth-codes.json`
- `oauth-refresh-tokens.json`
- `oauth-setup-state.json`
- `oauth-signing-key.jwk`

The runtime subject is still `single-operator`. Canonical identity plumbing exists, but has no private store after the git-backed `canonical-identity-link` entity was removed.

## Consumers to satisfy

- **Multi-user auth**: real `usr_<uuid>` subjects, roles, active/suspended status, multiple owners, last-owner protection.
- **MCP OAuth**: per-session permissions from the authenticated user instead of global anchor authority.
- **Chat / hosted Discord**: explicit `discord:<id>` to user lookup for routing and attribution, without storing those bindings in content.
- **Conversation memory**: optional canonical identity enrichment from private runtime identity bindings.
- **CMS git gateway**: editor identity and permission level for commit attribution and write gating.
- **Future dashboard People UX / CLI**: user, role, passkey, and identity management.

## Core decisions

1. **Use libSQL + Drizzle, matching the repo's existing pattern.**
   - Default local path: `./data/auth/auth.db`.
   - Keep the parent directory private (`0700`) and database files private (`0600`) where the platform supports it.
   - Follow the precedent in `shell/entity-service` and `shell/job-queue` (`@libsql/client` + `drizzle-orm/libsql`, migrations via `drizzle-kit`). Do not introduce `bun:sqlite` or a second DB stack.
2. **The auth DB owns auth truth.**
   - Users, roles, identities, passkeys, sessions, OAuth grants, refresh tokens, setup tokens, and auth audit live here.
   - Content entities may reference safe public/person labels later, but never become the source of auth truth.
3. **`usr_<uuid>` replaces `single-operator`.**
   - Fresh setup creates the first active owner user.
   - Existing stores migrate lazily and revoke old `single-operator` refresh tokens.
4. **Identity binding is explicit.**
   - No display-name matching or inferred cross-platform linking.
   - Operators attach identities such as Discord ids, emails, OAuth subjects, DIDs, or MCP subjects.
5. **Avoid raw account ids where lookup hashes are enough.**
   - Store a normalized identity key hash for lookup.
   - Store type/issuer/label metadata for management UI.
   - Store raw provider tokens or subjects only when a concrete protocol requires them, and keep them runtime-private.
6. **Role resolution is deny-by-default for authenticated but invalid users.**
   - A valid token/session whose user is missing or suspended is denied.
   - Rule fallback applies only to unauthenticated/interface-local callers that do not resolve to an auth user.

## Data model sketch

Names are illustrative; final migrations should use snake_case tables and explicit indexes.

### Users

```ts
interface AuthUserRow {
  id: string; // usr_<uuid>
  display_name: string;
  role: "anchor" | "trusted" | "public";
  status: "active" | "invited" | "suspended";
  canonical_id?: string; // generated `user:<id-suffix>` by default; operator-renameable later
  created_at: number;
  updated_at: number;
}
```

### Identity bindings

```ts
interface AuthIdentityRow {
  id: string;
  user_id: string;
  type: "passkey" | "discord" | "mcp" | "oauth" | "email" | "did" | "a2a";
  issuer?: string;
  identity_key_hash: string; // sha256(normalized identity key) — used for lookup
  delivery_subject?: string; // raw deliverable address (e.g. email) — only set for delivery-capable types; only used for sending when verified_at is set
  label?: string; // redacted/display-safe label, e.g. Daniel#1234
  verified_at?: number;
  revoked_at?: number;
  created_at: number;
}
```

Normalized lookup keys:

- `passkey:<credential-id>`
- `discord:<snowflake>`
- `mcp:<subject>`
- `oauth:<issuer>:<subject>`
- `email:<lowercase-email>`
- `did:<did>`

Active identities should be unique by `identity_key_hash`.

Delivery model: the auth DB does not store user emails on `auth_users`. When a user verifies an email identity (or other addressable channel), the raw deliverable address lands on the corresponding `auth_identities` row as `delivery_subject`. Operator-supplied setup emails continue to use existing config + recipient-hash dedupe (`shell/auth-service/src/setup-state-store.ts`) and are not affected. CMS commit attribution keeps using the configured `directory-sync` `git.authorEmail` (`Brain <brain@localhost>` by default); per-user attribution, if needed later, goes in commit trailers, not the author line.

### Credentials and grants

- `passkey_credentials`: credential id, user id, public key, counter, transports JSON, device type, backup state, timestamps.
- `webauthn_challenges`: challenge hash, user id, kind, expiry, consumed timestamp.
- `operator_sessions`: session token hash, user id, expiry, revoked timestamp.
- `oauth_clients`: client id, optional secret hash, registered metadata JSON, timestamps.
- `oauth_auth_codes`: code hash, client id, user id, redirect URI, PKCE challenge, scope, expiry, consumed timestamp.
- `oauth_refresh_tokens`: token hash, client id, user id, scope, expiry, revoked/replaced metadata.
- `oauth_signing_keys`: key id, private JWK, active/retired status, timestamps.
- `setup_tokens`: token hash/id, purpose, target user id, expiry, consumed timestamp, delivery dedupe metadata.

### Audit

```ts
interface AuthAuditEventRow {
  id: string;
  actor_user_id?: string;
  action: string;
  target_type?: string;
  target_id?: string;
  metadata_json?: string;
  created_at: number;
}
```

Use audit for user creation, role changes, identity attach/detach, passkey revoke, setup-token generation, login failures where useful, and CMS gateway authorizing decisions later.

## Service boundary

Add an auth runtime storage layer inside `shell/auth-service`, not a content plugin:

- `AuthRuntimeDatabase`
  - opens/closes DB
  - runs migrations
  - owns file permissions
- `AuthUserStore`
  - create/list/update users
  - enforce last-active-anchor protection
  - resolve active users and identities
- `AuthCredentialStore`
  - passkeys, WebAuthn challenges, setup tokens
- `OAuthGrantStore`
  - clients, auth codes, sessions, refresh tokens, signing keys
- `AuthAuditStore`
  - append/query auth audit events

`AuthService` should expose stable high-level APIs rather than leaking table access:

```ts
interface AuthPrincipal {
  userId: string;
  displayName: string;
  role: "anchor" | "trusted" | "public";
  status: "active" | "invited" | "suspended";
  permissionLevel: "anchor" | "trusted" | "public";
  canonicalId?: string;
}
```

Suggested APIs:

- `resolveSession(request): Promise<AuthPrincipal | undefined>`
- `resolveBearerToken(request): Promise<AuthPrincipal | undefined>`
- `resolveIdentity(type, subject, issuer?): Promise<AuthPrincipal | undefined>`
- `createUser`, `updateUserRole`, `suspendUser`
- `attachIdentity`, `detachIdentity`
- `startPasskeyRegistrationForUser`, `revokePasskey`
- `revokeUserSessionsAndRefreshTokens(userId)`

## Permission resolution

At shell/interface boundaries:

1. Verify session/token/signature if present.
2. Resolve to an active auth user.
3. If authenticated but unresolved/suspended, deny.
4. If resolved, use `user.role` as the permission level.
5. If unauthenticated or interface-local only, try `resolveIdentity()`.
6. If no auth user matches, fall back to existing `PermissionService` rules.

This preserves existing `brain.yaml` rules while making auth users authoritative when present.

## Canonical identity and conversation attribution

The auth DB becomes the private canonical identity backend. Do not add a separate `./data/identity/canonical-identities.json` store unless this DB plan is explicitly postponed.

- `CanonicalIdentityService` should query `AuthService.resolveIdentity()` or a small read-only identity index.
- `canonicalId` comes from `auth_users.canonical_id` when set, otherwise a safe runtime-only user id may be used inside runtime stores.
- Git-backed derived memory should store only safe canonical labels when configured; raw actor ids and account ids stay runtime-private.
- Existing actor/source metadata remains valid and should be preserved by chat interfaces.

## Migration strategy

### Fresh installs

1. DB starts empty.
2. First setup creates `usr_<uuid>` with role `anchor`, status `active`, and `canonical_id = user:<id-suffix>` generated from the user id.
3. Passkey registration binds the credential to that user.
4. Sessions, auth codes, access tokens, and refresh tokens use `sub = usr_<uuid>`.

### Existing installs

Run an idempotent migration on auth-service startup:

1. Create/open `auth.db` and record migration version.
2. Import the current JWK signing key.
3. Import OAuth clients.
4. If passkeys or sessions use `single-operator` and no users exist, create the first active owner user.
5. Import passkeys, rebinding `single-operator` to that user id.
6. Import active sessions and auth codes where safe.
7. Import refresh tokens except `single-operator` tokens; revoke/skip those and force one-time re-auth.
8. Preserve old JSON files as backup until migration is verified; do not delete automatically in the first release.

Migration should be repeatable and should not create duplicate users, credentials, or clients.

## Phased implementation

### Phase 1 — DB foundation and schema

- Add auth DB open/close lifecycle and migrations.
- Add repositories and tests against a temp SQLite DB.
- Keep existing JSON stores as runtime source until migration code is ready.

Validation: migrations are idempotent; file permissions are private; DB opens in local and test environments.

### Phase 2 — Users and passkeys

- Add `auth_users`, `auth_identities`, passkey credential/challenge tables.
- First setup creates an owner user.
- New passkeys bind to user ids.
- Migrate `single-operator` passkeys.
- Add last-active-anchor protection.

Validation: fresh setup, login, and old passkey migration all produce `usr_<uuid>` subjects.

### Phase 3 — OAuth/session stores

- Move clients, auth codes, sessions, refresh tokens, setup tokens, and signing keys into DB-backed stores.
- Revoke old `single-operator` refresh tokens.
- Add user-status checks for sessions and bearer tokens.
- Revoke a user's sessions/refresh tokens when role/status/identity changes require it.

Validation: OAuth code flow, refresh rotation, logout, setup-token flow, and client registration work from DB stores.

### Phase 4 — Permission integration

- Return `AuthPrincipal` from bearer/session verification.
- Make HTTP MCP create per-session servers at the user's permission level.
- Add identity lookup before rule fallback for Discord/MCP/chat interfaces.
- Keep static `MCP_AUTH_TOKEN` as deprecated anchor fallback.

Validation: trusted users cannot call anchor-only tools; suspended users are denied; legacy rule fallback still works.

### Phase 5 — Management surface

- Add anchor-only tools and optional CLI wrappers for user/identity/passkey management.
- Add dashboard People panel only after tools/CLI are stable.
- Add audit events for every management mutation.

Validation: owners can create/promote/suspend users; trusted users cannot manage users; last owner cannot be demoted or suspended.

### Phase 6 — Consumers

- Wire `CanonicalIdentityService` to auth DB identity lookup.
- Wire chat/hosted Discord routing to identity lookup where needed.
- Wire CMS git gateway author/permission decisions to `AuthPrincipal`.
- Add conversation/job/tool attribution from `AuthPrincipal`.

Validation: linked Discord user maps to a brain user; CMS commits show editor attribution; conversation metadata can include user/canonical attribution without content-stored account bindings.

## Security notes

- Hash bearer/session/refresh/setup tokens before storage.
- Prefer identity-key hashes over raw account ids for lookup.
- Store OAuth provider tokens only if a future flow truly needs them; encrypt or isolate them if added.
- Role downgrades, suspension, and identity detach should revoke affected sessions and refresh tokens.
- Never auto-link identities by display name or email similarity.
- Reject changes that leave zero active anchors.
- Auth DB is backed up via the same mechanism as the rest of the runtime data dir. No SQLite-specific backup tooling required; WAL mode keeps the main file consistent at checkpoint boundaries.

## Resolved decisions

1. **DB stack**: libSQL + Drizzle, following `shell/entity-service` and `shell/job-queue`. No `bun:sqlite`, no second stack.
2. **User emails**: not stored on `auth_users`. Deliverable addresses live on `auth_identities.delivery_subject` for verified email (and other delivery-capable) identities. Operator setup emails keep the existing recipient-hash pattern; CMS commits keep the existing `directory-sync` author config.
3. **`canonical_id`**: generated `user:<id-suffix>` on user creation. Operator-renameable later when a People management surface lands; field is a nullable string so rename is a column update with no migration.
4. **OAuth clients**: migrate in the same phase as grants (Phase 3). Avoids a JSON/SQL hybrid with weak referential integrity.
5. **Backup/restore**: no auth-specific policy. Auth DB lives under the runtime data dir and is covered by whatever already backs it up.

## Related plans

- [Multi-user and permissions](./multi-user.md)
- [Conversation speaker attribution](./conversation-speaker-attribution.md)
- [Unified ChatInterface using Vercel Chat SDK](./chat-interface-sdk.md)
- [Hosted Rover Discord UX](./hosted-rover-discord.md)
- [CMS heavy backend](./cms-heavy-backend.md)
- [Operator runtime database](./operator-runtime-db.md)
