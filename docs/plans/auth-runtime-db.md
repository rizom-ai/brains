# Plan: Auth runtime database

## Status

Feature-complete but **not mergeable yet**. Auth runtime implementation on `feature/auth-runtime-db` includes the role-aware People dashboard and compatibility-safe session terminology migration. The bounded legacy-cookie reader remains active until its automated release gate permits removal. Legacy JSON/JWK files are retained only as immutable migration backups and optional standalone-store compatibility, not as the `AuthService` source of truth.

A high-effort multi-agent review (2026-07-16) surfaced blocking privilege-escalation and boot-crash defects that the branch's new multi-user capability introduces. See [Review findings — 2026-07-16](#review-findings--2026-07-16). P0 items must be fixed before merge.

## Goal

Create one private runtime database for users, credentials, OAuth state, identity bindings, permissions, and auth audit so multi-user auth, hosted Discord routing, conversation attribution, and CMS commit attribution all share the same source of truth.

The database is runtime state. It must never live under `brain-data`, be exported as markdown, or sync through the content git repo.

## Source of truth

This plan owns auth-specific schema, auth storage APIs, JSON/JWK migration, and the `single-operator` to `usr_<uuid>` migration. Broader runtime storage location, deploy persistence, and backup/restore policy belong to [Operator runtime database](./operator-runtime-db.md). Product behavior, permissions, user-management UX, and attribution phases belong to [Multi-User & Permissions](./multi-user.md).

## Current baseline

On `main`, `shell/auth-service` provides the OAuth/passkey/JWT and A2A signing/trust foundation, but persistence is split across JSON/JWK files in `./data/auth`:

- `oauth-passkeys.json`
- `oauth-sessions.json`
- `oauth-clients.json`
- `oauth-auth-codes.json`
- `oauth-refresh-tokens.json`
- `oauth-setup-state.json`
- `oauth-signing-key.jwk`
- `a2a-signing-key.jwk`
- `a2a-peer-trust.json`

The mainline runtime subject is still `single-operator`. Canonical identity plumbing exists, but has no private store after the git-backed `canonical-identity-link` entity was removed.

## Implementation checkpoint — 2026-07-13

Implemented on `feature/auth-runtime-db`:

- Local libSQL/Drizzle auth database lifecycle, private directory/file modes, WAL configuration, generated Drizzle Kit migration assets, and a release-gated one-time bridge for pre-Drizzle schemas.
- Database-backed users, identities, passkeys, WebAuthn challenges, sessions, OAuth clients/codes/refresh tokens, setup tokens, OAuth and A2A signing keys, A2A peer trust, and structured audit events.
- Idempotent JSON/JWK imports that preserve legacy files unchanged; unsafe `single-operator` refresh tokens are deliberately skipped.
- Transactional first-anchor creation and last-active-anchor protection with concurrent mutation coverage.
- Session, bearer, and linked-identity principal APIs with role/status revocation behavior.
- Per-principal MCP session permissions, cross-user session protection, role-change invalidation, and explicit `resolved`/`denied`/`unbound` identity handling so inactive or revoked bindings cannot fall through to static rules.
- High-level user, role, status, identity, passkey-revocation, and audit APIs with optional authenticated-actor attribution for management mutations.
- Async `CanonicalIdentityService` enrichment through an internal auth-principal channel, resolving hashed private bindings without exposing raw identity subjects.
- Canonical user attribution propagated through conversations, agent-invoked and confirmed tool contexts, tool lifecycle events, and tool-enqueued job metadata, including non-MCP chat paths.
- Same-origin, session-authenticated anchor API for user, role, status, identity, passkey, user-session, and user-specific passkey-registration administration; every mutation requires an explicit action confirmation and remains absent from model tools.
- Actor-attributed management and A2A trust auditing plus secret-free WebAuthn failure events.
- Explicit Drizzle table declarations with `isolatedDeclarations: true` restored.

The required People dashboard and terminology migration are complete. Migration 5 preserves existing session rows; new sessions use `brains_auth_session`; the runtime temporarily reads the historical cookie name and clears both names on logout. CI and release metadata enforce the removal boundary.

A local CLI and invitation delivery remain optional. Cross-consumer validation covers auth service, dashboard, MCP interface/service, web chat, CMS surfaces, Discord, A2A, agent discovery, affected typechecks, and lint.

## Review findings — 2026-07-16

High-effort multi-agent review of the full `main...HEAD` branch diff (8 finder angles, per-candidate adversarial verification). 17 findings confirmed against the code. The dominant theme: **this branch makes non-anchor users possible for the first time (person promotion → invited user → passkey login), but several surfaces still equate "has a session cookie" with "is the anchor operator," turning previously-safe single-operator gates into privilege escalations.** A second cluster is that legacy JSON→DB migrations re-run unconditionally on every `initialize()`, so one bad or orphaned legacy row bricks startup or resurrects revoked state.

Each item is `file:line — problem → fix`. Verified severity in brackets.

### P0 — Privilege escalation (fix before merge)

- [ ] **CMS editor gate accepts any session** [confirmed] — `plugins/cms/src/plugin.ts:89` uses `hasAuthSession`/`getAuthSession`, which only check cookie existence (`auth-service.ts:940`), not role or status. Any promoted `trusted`/`public` user (or a suspended user with a live cookie) gets full entity read/write through the editor API (`plugins/cms/src/editor-routes.ts`). **Fix:** gate on `resolveSession` (`auth-service.ts:947`, checks `status === "active"` and returns `permissionLevel`) and require `permissionLevel === "anchor"`, matching web-chat/dashboard.
- [ ] **Sveltia token endpoint releases the content-repo PAT to any session** [confirmed] — `plugins/sveltia-cms/src/plugin.ts:456` (and login gate at `:618`) return `{ token: contentRepoToken }` after only `getAuthSession`. A `public`-role user obtains git-level content write. **Fix:** same `resolveSession` + anchor gate. (Suspended-user variant is mitigated because `updateUserStatus` revokes sessions; the `public`-role path is the live hole.)
- [ ] **MCP trusts client-supplied `_meta.userId`** [confirmed] — `shell/mcp-service/src/mcp-registration.ts:181` falls back to `extra._meta["userId"]` when there is no verified subject (reachable on stdio transport and HTTP with `auth.disabled`). Downstream code trusts any `usr_`-prefixed value: `interfaces/mcp/src/tools/index.ts:172` builds a `kind:"user"` ActorRef; `entities/agent-discovery/src/tools/agent-set-trust-level.ts:172,188` records it as `actorUserId`. A client sends `_meta.userId="usr_<victim>"` and impersonates a real user in conversation attribution, confirmations, and A2A trust-change audit. **Fix:** never derive an authenticated user id from unverified `_meta`; only trust `verifiedSubject`. Remove the `startsWith("usr_")` heuristic (see altitude item on ActorRef flattening).

### P0 — Boot crash-loop / integrity (legacy migrations re-run every `initialize()`)

Findings below share one root cause: `migrateLegacy*` imports run unconditionally on every startup with no "legacy import complete" marker. **Deeper fix that resolves the first and fourth together:** record legacy-import completion once (a row in `auth_schema_migrations` or a dedicated one-shot guard) so imports never re-read the immutable JSON after the first success. Individual fixes still listed in case the one-shot guard is deferred.

- [x] **Unknown legacy subjects caused startup failure** [fixed] — one-time legacy import now filters expired/consumed records before relationship lookup and aggregate-log-skips orphaned users rather than blocking auth startup.
- [x] **Legacy grant FK failures blocked startup** [fixed] — authorization-code and refresh-token import verifies that the referenced client and user were imported before insertion, skips invalid relationships, and preserves the immutable backup.
- [x] **`AuthRuntimeDatabase.start()` first-init race** [fixed] — startup now caches and reuses one in-flight promise, publishes the active client only after migration succeeds, and closes only the failed local client. Concurrent-start coverage verifies one initialization path.
- [x] **Revoked A2A peer trust resurrected on restart** [fixed] — `auth_legacy_imports` records successful completion of the immutable JSON/JWK import set. Later restarts never reread legacy trust grants; revocation persistence has restart coverage.

### P1 — Correctness / data loss

- [ ] **Passkey `excludeCredentials` leaks every user's credentials and blocks legitimate registration** [confirmed] — `shell/auth-service/src/passkey-service.ts:80,93` builds `excludeCredentials` from store-wide `listCredentials()` instead of the target user. A targeted setup-link holder receives every user's credential IDs (cross-user enumeration), and a shared authenticator holding another user's credential for this RP wrongly blocks the target from registering. **Fix:** scope to `user.subject` via the existing `AuthCredentialStore.listPasskeys(userId)` (`credential-store.ts:208`).
- [ ] **Conversation-memory recall loss for legacy participants** [confirmed] — `entities/conversation-memory/src/lib/conversation-memory-retriever.ts:222` (`matchesIdentity`) now compares only exact `actorRefKey` equality; the old code also matched `canonicalId`/`actorId`/`sourceActorIds`, and the legacy normalizer (`schemas/summary.ts:110`) drops `sourceActorIds` and the raw `actorId`. A pre-branch participant `{actorId:"discord:42", canonicalId:"person-jan"}` normalizes to a canonical-derived key while a live-actor query normalizes to a `discord:42`-derived key — the summary is silently excluded. No migration rewrites stored summaries. **Fix:** restore `actorId`/`canonicalId`/`sourceActorIds` fallback matching, or migrate stored summaries to canonical keys.
- [ ] **Action-item / decision attribution lost for label-less actors** [confirmed] — `entities/conversation-memory/src/lib/summary-projector.ts:566,674` dropped `actor.actorId`/`actor.canonicalId` from the candidate labels. An actor with no `displayName`/`username` (e.g. MCP principals set only `displayName`, which is optional) that the extractor references by raw id comes back with empty `assignedTo`/`decidedBy`. **Fix:** re-add `actorId`/`canonicalId` (or fall back to `actorRefKey(actor.identity)` consistently, as `:465` already does).
- [ ] **Already-delivered setup link invalidated on restart** [confirmed] — `shell/auth-service/src/setup-flow.ts:133` rotates when the in-memory raw token is lost (any restart; DB stores only the hash), and `RuntimeSetupStateStore.saveSetupToken` (`setup-state-store.ts:226`) consumes all prior untargeted unconsumed tokens. The anchor-visible `auth-service_get_passkey_setup_url` MCP tool triggers this with `rotateHidden:true` and — unlike `ensureSetupToken` — lacks the delivered-token guard, so a mailed link 404s with no re-delivery. **Fix:** don't rotate/consume a still-valid delivered token; add the delivered-token guard to the tool path. (The stability test was inverted on this branch — restore the invariant.)
- [ ] **Per-recipient setup-delivery dedupe collapsed** [PLAUSIBLE, narrow] — `setup-state-store.ts:337` overwrites a single `delivery_key_hash` column instead of the legacy append-only per-recipient list, so a recipient change loses the earlier dedupe record and `importState` migrates only one legacy delivery. Worst case is one duplicate setup email around legacy import, not a recurring loop. **Fix (low priority):** keep per-recipient delivery rows.

### P2 — Efficiency

- [ ] **Identity-resolution cache is dead code** [confirmed] — `shell/identity-service/src/canonical-identity-service.ts:82-119`: `refreshCache` never populates `actorIndex`, so the `cachedResolution` branch is unreachable and every message pays a message-bus round trip + auth-DB query (`turn-processor.ts` calls `enrichActor` twice per turn), including external actors that can never resolve. **Fix:** populate the cache from resolutions and cache negative results with a TTL.
- [x] **Unindexed historical identity lookup** [fixed] — `person_identity_claims` now has both its active unique index and a total `identity_key_hash` index for denied/revoked-binding lookups.
- [ ] **People-admin endpoint is ~4N+1 queries** [confirmed] — `shell/auth-service/src/admin-endpoints.ts:206` fires `listUserIdentities` (which itself does a `requireUser` first) + `listUserPasskeys` + `listPersonAgents` per user (fan-out is concurrent via `Promise.all`, but ~200 queries for 50 users). **Fix:** bulk-select identities/passkeys/links and group in memory.
- [ ] **JWT verified twice per MCP request** [confirmed] — `interfaces/mcp/src/mcp-interface.ts:134-136` calls `verifyBearerToken` then `resolveBearerToken`, which re-verifies internally (`auth-service.ts:986`). **Fix:** one method returning principal + scope from a single verification.
- [ ] **Session resolved twice per web-chat request** [confirmed] — `interfaces/web-chat/src/web-chat-interface.ts:143-147` default `resolveAuthSession` is itself another `resolveAuthPrincipal` call, so the fallback re-runs the cookie+session+user lookups for a guaranteed-identical result; `resolvePermissionLevel` (`:734`) has the same double-resolve. **Fix:** don't double-resolve; keep the override seam without re-querying on the default path.
- [ ] **`/api/console/jump` lost its operator gate** [confirmed] — `plugins/dashboard/src/plugin.ts:507` now accepts any principal with no `permissionLevel` check. Entity search stays visibility-scoped (safe), but anchor **widget-group names** — which the page deliberately hides — leak to `trusted`/`public` sessions. **Fix:** restore the permission gate / filter widget groups by `permissionLevel`.

### P3 — Altitude / cleanup

- [ ] **ActorRef is flattened back to a stringly-typed `userId`** [confirmed] — `shell/ai-service/src/turn-processor.ts:333` and `call-options.ts:26` duplicate `kind === "user" ? userId : actorRefKey(...)` with sentinels (`"agent-user"`, `"mcp-user"`), and consumers reverse-engineer it by `startsWith("usr_")`. `shell/job-queue/src/job-helpers.ts:97` writes `requestedByUserId: toolContext.userId` **unguarded**, so a non-user actor's encoded key (`external:ext_<hash>`) or a sentinel is persisted into job rows as a user id — the exact misattribution the discriminated `ActorRef` (Phase 6) was introduced to prevent, and the root enabler of the MCP `_meta` P0. **Fix:** carry `ActorRef` through `ToolContext` and one policy helper (`authenticatedUserId(context)`); stop encoding to strings at the boundary.
- [x] **Divergent auth migration stack** [fixed] — the current schema is defined once in Drizzle, migration SQL/journal/snapshots are generated by Drizzle Kit, runtime startup uses the standard Drizzle migrator, and the CLI bundles the generated assets. A marker-detected pre-Drizzle bridge remains only until the compatibility release gate permits removal.
- [ ] **People administration is a management surface miscast as a dashboard tab** [confirmed] — `plugins/dashboard/src/render/people-panel.tsx` (692 lines) grafts an anchor-only admin surface onto the dashboard SSR page as a hardcoded `{showPeople && …}` conditional with an inline vanilla-JS controller. The HTTP boundary is clean (thin client over `/auth/admin/*`; domain stays in auth-service), but the surface sidesteps the widget-registry model every other tab obeys, so ⌘K can't reach it (`console-jump.ts` builds doors from widget groups only — same root cause as the `/api/console/jump` P2 gap), and it re-declares auth's role list and mutation-action names as string literals that drift from `admin-endpoints.ts`. CMS is the precedent: a mutating management surface is its own console surface, not a monitoring widget. **Fix:** extract to its own `/people` React console surface, peer to `/cms`/`/chat`, per [multi-user.md decision 11](./multi-user.md); dashboard returns to pure monitoring.
- [ ] **Duplicated migration/hash scaffolding** [confirmed] — six near-identical `migrateLegacy*` methods (`auth-service.ts:349-527`) and five `runX` migration methods (`runtime-db.ts:119+`) differ only in table/label; six+ copies of the `sha256→base64url` hash one-liner live across the stores. **Fix:** a table-driven `migrateLegacyRecords(lister, importer, label)` helper and one shared hashing util (values are persisted in PK columns, so drift silently breaks lookups).

### Cleared — do not re-litigate

- **Refresh-token `single-operator` drop** (`auth-service.ts:507`) — **not a bug.** Deliberate, documented (plan lines 39/249, `multi-user.md:251`), logged as `skippedLegacy`. Forced one-time re-auth is the intended behavior.
- **MCP access tokens with `single-operator` subject rejected post-migration** (`mcp-interface.ts:136`) — **intended one-time re-auth**, not a lockout: 15-min access-token TTL, and the operator's passkey is migrated to the anchor, so it's a one-time OAuth re-consent.
- **Drizzle `.notNull()` vs nullable `ALTER` on `person_id`** (`runtime-schema.ts:164`) — **refuted.** Migration 6 backfills every row and all insert paths set `person_id`; no NULL row is constructible.

## Consumers to satisfy

- **Multi-user auth**: real `usr_<uuid>` subjects, roles, active/suspended status, multiple anchors, last-anchor protection.
- **MCP OAuth**: per-session permissions from the authenticated user instead of global anchor authority.
- **Chat / hosted Discord**: explicit `discord:<id>` to user lookup for routing and attribution, without storing those bindings in content.
- **Conversation memory**: optional canonical identity enrichment from private runtime identity bindings.
- **CMS passkey login**: a valid authenticated browser session to gate release of the shared content PAT (see `plugins/cms/src/plugin.ts`, where the GitHub OAuth and passkey-gated PAT login methods already consume `auth-service`). No per-editor commit attribution — that is a Sveltia limitation, not an auth-DB feature.
- **A2A peer trust**: the peer-trust records (domain, pinned key fingerprint, granted inbound level) that directory approval writes per [a2a-request-signing.md](./a2a-request-signing.md) decision 6 — trust grants must live on this runtime plane, never in git-synced content.
- **Dashboard People UX / future CLI**: user, role, passkey, and identity management.

## Core decisions

1. **Use libSQL + Drizzle, matching the repo's existing pattern.**
   - Default local path: `./data/auth/auth.db`.
   - Keep the parent directory private (`0700`) and database files private (`0600`) where the platform supports it.
   - Follow the precedent in `shell/entity-service` and `shell/job-queue` (`@libsql/client` + `drizzle-orm/libsql`, migrations via `drizzle-kit`). Do not introduce `bun:sqlite` or a second DB stack.
2. **The auth DB owns auth truth.**
   - Users, roles, identities, passkeys, sessions, OAuth grants, refresh tokens, setup tokens, and auth audit live here.
   - Content entities may reference safe public/person labels later, but never become the source of auth truth.
3. **`usr_<uuid>` replaces `single-operator`.**
   - Fresh setup creates the first active anchor user.
   - Existing stores migrate lazily and revoke old `single-operator` refresh tokens.
4. **Identity binding is explicit.**
   - No display-name matching or inferred cross-platform linking.
   - Anchors attach identities such as Discord ids, emails, OAuth subjects, DIDs, or MCP subjects.
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
  person_id: string; // stable person subject
  display_name: string;
  role: "anchor" | "trusted" | "public";
  status: "active" | "invited" | "suspended";
  canonical_id?: string; // generated `user:<id-suffix>` by default; administratively renameable later
  created_at: number;
  updated_at: number;
}
```

### Person identity claims and evidence

```ts
interface PersonIdentityClaimRow {
  id: string;
  person_id: string;
  type: "passkey" | "discord" | "mcp" | "oauth" | "email" | "did" | "a2a";
  issuer?: string;
  identity_key_hash: string; // sha256(normalized identity key) — used for lookup
  delivery_subject?: string; // private raw routing address when required
  label?: string; // redacted/display-safe label, e.g. Daniel#1234
  visibility: "private" | "trusted" | "public";
  revoked_at?: number;
  created_at: number;
}

interface AuthIdentityEvidenceRow {
  id: string;
  claim_id: string;
  source_kind: "admin" | "agent" | "migration" | "provider";
  source_id?: string;
  assurance: "asserted" | "verified";
  verified_at?: number;
  created_at: number;
}
```

Claims belong to people. Independent evidence rows preserve agent assertion, administrator confirmation, provider verification, and migration provenance without overwriting one another. Only an active claim with verified evidence can authenticate.

Normalized lookup keys:

- `passkey:<credential-id>`
- `discord:<snowflake>`
- `mcp:<subject>`
- `oauth:<issuer>:<subject>`
- `email:<lowercase-email>`
- `did:<did>`

Active claims are unique by `identity_key_hash`; a second total index supports denied and historical-binding lookups.

Delivery model: the auth DB does not store user emails on `auth_users`. When a person verifies an email identity (or other addressable channel), the raw deliverable address lands on the corresponding `person_identity_claims` row as `delivery_subject`. Configured setup emails continue to use existing config + recipient-hash dedupe (`shell/auth-service/src/setup-state-store.ts`) and are not affected. CMS commit attribution keeps using the configured `directory-sync` `git.authorEmail` (`Brain <brain@localhost>` by default); per-user attribution, if needed later, goes in commit trailers, not the author line.

### Credentials and grants

- `passkey_credentials`: credential id, user id, public key, counter, transports JSON, device type, backup state, timestamps.
- `webauthn_challenges`: challenge hash, optional user id, kind, expiry, consumed timestamp. Registration challenges bind a user; discoverable-credential authentication challenges do not know the user until verification.
- `auth_sessions`: session token hash, user id, expiry, revoked timestamp. The historical table name is supported only by the pre-Drizzle upgrade bridge.
- `oauth_clients`: client id, optional secret hash, registered metadata JSON, timestamps.
- `oauth_auth_codes`: code hash, client id, user id, redirect URI, PKCE challenge, scope, expiry, consumed timestamp.
- `oauth_refresh_tokens`: token hash, client id, user id, scope, expiry, revoked/replaced metadata.
- `oauth_signing_keys`: key id, purpose (`oauth` or `a2a`), private JWK, active/retired status, timestamps. At most one active key per purpose.
- `setup_tokens`: token hash/id, purpose, target user id, expiry, consumed timestamp, delivery dedupe metadata.

### A2A peer trust

- `a2a_peer_trust`: normalized peer domain, pinned key fingerprint, granted inbound level (`public` or `trusted`), and timestamps. Anchor-level peer grants are forbidden.

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
4. If passkeys or sessions use `single-operator` and no users exist, create the first active anchor user.
5. Import passkeys, rebinding `single-operator` to that user id.
6. Import active sessions and auth codes where safe.
7. Import refresh tokens except `single-operator` tokens; revoke/skip those and force one-time re-auth.
8. Preserve old JSON files as backup until migration is verified; do not delete automatically in the first release.

Migration should be repeatable and should not create duplicate users, credentials, or clients.

## Phased implementation

### Phase 1 — DB foundation and schema

**Status: implemented.** Local lifecycle, generated Drizzle migrations, release-gated legacy upgrade bridge, permissions, explicit declaration-safe schema types, and temp-DB tests exist.

- Add auth DB open/close lifecycle and migrations.
- Add repositories and tests against a temp SQLite DB.
- Keep existing JSON stores as runtime source until migration code is ready.

Validation: migrations are idempotent; file permissions are private; DB opens in local and test environments.

### Phase 2 — Users and passkeys

**Status: implemented.** Users, identities, first-anchor setup, passkey credentials/challenges, legacy subject rebinding, and transactional anchor invariants use the runtime database.

- Add `auth_users`, `auth_identities`, passkey credential/challenge tables.
- First setup creates an anchor user.
- New passkeys bind to user ids.
- Migrate `single-operator` passkeys.
- Add last-active-anchor protection.

Validation: fresh setup, login, and old passkey migration all produce `usr_<uuid>` subjects.

### Phase 3 — OAuth/session stores

**Status: implemented.** OAuth/session/setup/signing stores use the runtime database, with idempotent legacy imports and revocation checks.

- Move clients, auth codes, sessions, refresh tokens, setup tokens, and signing keys into DB-backed stores.
- Revoke old `single-operator` refresh tokens.
- Add user-status checks for sessions and bearer tokens.
- Revoke a user's sessions/refresh tokens when role/status/identity changes require it.

Validation: OAuth code flow, refresh rotation, logout, setup-token flow, and client registration work from DB stores.

### Phase 4 — Permission integration

**Status: implemented.** Principal resolution and MCP/Discord integration deny invalid authenticated identities and enforce current per-user permissions.

- Return `AuthPrincipal` from bearer/session verification.
- Make HTTP MCP create per-session servers at the user's permission level.
- Bind each MCP session id to its authenticated user and permission level; reject cross-user reuse and invalidate the session when the user's role changes.
- Add identity lookup before rule fallback for Discord/MCP/chat interfaces.
- Keep static `MCP_AUTH_TOKEN` as deprecated anchor fallback.

Validation: trusted users cannot call anchor-only tools; suspended users are denied; MCP session ids cannot be reused by another user or retain a superseded role; legacy rule fallback still works.

### Phase 5 — Management surface

**Status: implemented, including the People client completed in phase 7.** User, role, status, identity, passkey, session-revocation, and user-specific passkey-registration operations are available through a same-origin anchor-session API and remain deliberately absent from model tools.

- Add an authenticated, anchor-driven admin API/dashboard and optional local CLI wrappers for user/identity/passkey management.
- Require explicit anchor interaction and confirmation for role, status, identity, and credential mutations.
- Do not expose auth-user records or management mutations as agent tools.
- Add audit events for every management mutation.

Validation: anchors can create/promote/suspend users; trusted users cannot manage users; the last anchor cannot be demoted or suspended.

### Phase 6 — Consumers

**Status: implemented.** `CanonicalIdentityService` resolves actors asynchronously through the private auth service; linked Discord messages carry canonical user attribution into active and passive conversations; OAuth-authenticated MCP and authenticated web chat propagate verified principals; agent-invoked and confirmed tools, tool lifecycle events, and tool-enqueued jobs retain the authenticated requester. A discriminated `ActorRef` now separates local users, opaque external identities, agents, and services; legacy flattened actor metadata is read-compatible but no longer written.

- Keep `CanonicalIdentityService` wired to auth DB identity lookup without storing raw provider subjects outside auth storage.
- Wire chat/hosted Discord routing to identity lookup where needed.
- Add conversation/job/tool attribution from `AuthPrincipal`.

Validation: linked Discord user maps to a brain user; conversation metadata can include user/canonical attribution without content-stored account bindings.

### Phase 7 — Auth-session terminology and People dashboard

**Status: implemented; bounded legacy-cookie compatibility remains active.**

- [x] Approve the lightweight [People dashboard mockup](../design/people-dashboard-mockup.html).
- [x] Rename `operator_sessions` to `auth_sessions` in migration 5 while preserving every active session row.
- [x] Rename `OperatorSession*`, `getOperatorSession`, and related service APIs to `AuthSession*` or `BrowserSession*`; no deprecated wrappers remain in the private workspace API.
- [x] Move `brains_operator_session` to `brains_auth_session`, dual-read the legacy cookie during a bounded compatibility window, and clear both cookies on logout.
  - `bun run auth-session:compat-check` enforces zero deprecated source consumers and blocks early removal of the legacy cookie reader.
  - `shell/auth-service/auth-session-compat.json` records the cookie and Drizzle-migration introduction releases plus the minimum supported upgrade version. The release workflow stamps introduction versions after the auth-service package is versioned.
  - Remove either the legacy cookie reader or pre-Drizzle database bridge only when the recorded minimum supported upgrade version is at least that compatibility path's introduction version.
- [x] Rename `OperatorSetupRequired` and user-facing operator setup/login copy to generic passkey/authenticated-session language.
- [x] Keep `single-operator` only as an immutable historical migration alias.
- [x] Make dashboard permission resolution use `resolveSession()` and the principal's actual role instead of treating any session as anchor.
- [x] Add the anchor-only People tab and canonical `Anchor`/`Trusted`/`Public` masthead labels required by the multi-user plan.

Validation: existing sessions survive migration; trusted sessions stay trusted in the dashboard; only anchors can use People administration; no user-facing role copy says Owner or Operator.

### Phase 8 — Person subjects and canonical identity claims

**Status: in progress.** The generated schema stores normalized person claims and independent evidence; the bounded bridge preserves legacy claim ids while backfilling migration evidence. Agent assertions cannot authenticate, while provider/admin verification remains separate. Stable person backfill, consent-bearing agent/person links, promotion, targeted registration, People linked-agent state, and the approved-agent promotion entry point are implemented. Agent-carried claim import, exact-match reuse during existing-user linking, and conflict reconciliation remain. Product behavior and promotion UX are specified in [Multi-user and permissions](./multi-user.md#phase-6--person-centered-identity-and-agent-promotion).

- Add stable runtime person records and link every auth user to one person through an ordered migration.
- Preserve user ids, passkeys, sessions, roles, statuses, and existing identity row ids during backfill.
- Make canonical provider claims person-owned while retaining user authentication bindings and claim provenance/assurance.
- Add runtime agent-to-person representation links with explicit consent state; content-plane agent records cannot grant access.
- Resolve linked user and agent views through shared person/claim ids without copying raw subjects.
- Keep raw delivery subjects private to auth/interface adapters and public projection opt-in.
- Promote an agent's represented person by creating an invited auth-user facet; require independent passkey/provider verification before activation.
- Keep agent attribution distinct and add initiating-user/delegation provenance rather than rewriting the agent actor as a user.

Validation: migrations are row-preserving and restart-idempotent; exact verified Discord claims are reused; asserted/conflicting claims cannot silently authenticate or merge; existing auth and identity lookup behavior remains compatible throughout the bounded migration.

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
2. **User emails**: not stored on `auth_users`. Deliverable addresses live on person-owned `person_identity_claims.delivery_subject` for verified email (and other delivery-capable) identities. Configured setup emails keep the existing recipient-hash pattern; CMS commits keep the existing `directory-sync` author config.
3. **`canonical_id`**: generated `user:<id-suffix>` on user creation. Administratively renameable later when a People management surface lands; field is a nullable string so rename is a column update with no migration.
4. **OAuth clients**: migrate in the same phase as grants (Phase 3). Avoids a JSON/SQL hybrid with weak referential integrity.
5. **Backup/restore**: no auth-specific policy. Auth DB lives under the runtime data dir and is covered by whatever already backs it up.

## Related plans

- [Multi-user and permissions](./multi-user.md)
- [Operator runtime database](./operator-runtime-db.md)
