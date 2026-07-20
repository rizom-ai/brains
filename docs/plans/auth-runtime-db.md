# Plan: Auth runtime database

## Status

Implementation is in final hardening on `feature/auth-runtime-db`. The role-aware `/admin` console with its People section, compatibility-safe session terminology migration, generated Drizzle auth schema, and normalized identity evidence are implemented. The bounded legacy-cookie reader and pre-Drizzle database bridge remain active until their automated release gate permits removal. Legacy JSON/JWK files are retained only as immutable migration backups and optional standalone-store compatibility, not as the `AuthService` source of truth.

A high-effort multi-agent review (2026-07-16) surfaced privilege-escalation and boot-integrity defects introduced by multi-user capability. All confirmed P0 findings are now fixed with regression coverage; remaining lower-priority findings are tracked below. This plan refines the broader [Operator runtime database](./operator-runtime-db.md) boundary for auth-specific state.

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
- Transactional first-Admin creation, personal-Anchor binding, and last-active-Admin protection with concurrent mutation coverage.
- Session, bearer, and linked-identity principal APIs with role/status revocation behavior.
- Per-principal MCP session permissions, cross-user session protection, role-change invalidation, and explicit `resolved`/`denied`/`unbound` identity handling so inactive or revoked bindings cannot fall through to static rules.
- High-level user, role, status, identity, passkey-revocation, and audit APIs with optional authenticated-actor attribution for management mutations.
- Async `CanonicalIdentityService` enrichment through an internal auth-principal channel, resolving hashed private bindings without exposing raw identity subjects.
- Canonical user attribution propagated through conversations, agent-invoked and confirmed tool contexts, tool lifecycle events, and tool-enqueued job metadata, including non-MCP chat paths.
- Same-origin, session-authenticated Admin API for user, role, status, identity, passkey, user-session, and user-specific passkey-registration administration, plus read-only config-derived Anchor display; every mutation requires an explicit action confirmation and remains absent from model tools.
- Actor-attributed management and A2A trust auditing plus secret-free WebAuthn failure events.
- Explicit Drizzle table declarations with `isolatedDeclarations: true` restored.

The required admin console's People section and terminology migration are complete. Migration 5 preserves existing session rows; new sessions use `brains_auth_session`; the runtime temporarily reads the historical cookie name and clears both names on logout. CI and release metadata enforce the removal boundary.

A local CLI and invitation delivery remain optional. Cross-consumer validation covers auth service, dashboard, MCP interface/service, web chat, CMS surfaces, Discord, A2A, agent discovery, affected typechecks, and lint.

## Review findings — 2026-07-16

High-effort multi-agent review of the full `main...HEAD` branch diff (8 finder angles, per-candidate adversarial verification). 17 findings confirmed against the code. The dominant theme: **this branch makes non-admin users possible for the first time (person promotion → invited user → passkey login), but several surfaces still equate "has a session cookie" with "is an Admin," turning previously-safe single-operator gates into privilege escalations.** A second cluster is that legacy JSON→DB migrations re-run unconditionally on every `initialize()`, so one bad or orphaned legacy row bricks startup or resurrects revoked state.

Each item is `file:line — problem → fix`. Verified severity in brackets.

### P0 — Privilege escalation (fix before merge)

- [x] **CMS editor accepted any session** [fixed] — the editor shell and every editor API route now resolve the active principal and require `permissionLevel === "admin"`; trusted-session denial is covered.
- [x] **Sveltia token endpoint released the content-repo PAT to any session** [fixed] — passkey CMS shell/login gates and `/auth/cms-token` resolve the active principal and require Admin permission; non-Admin token requests return 403.
- [x] **MCP trusted client-supplied `_meta.userId`** [fixed] — tool registration derives user identity only from the server-verified auth subject. Unauthenticated metadata receives the non-user `mcp-user` sentinel, with spoofing coverage.

### P0 — Boot crash-loop / integrity (legacy migrations re-run every `initialize()`)

Findings below share one root cause: `migrateLegacy*` imports run unconditionally on every startup with no "legacy import complete" marker. **Deeper fix that resolves the first and fourth together:** record legacy-import completion once (a row in `auth_schema_migrations` or a dedicated one-shot guard) so imports never re-read the immutable JSON after the first success. Individual fixes still listed in case the one-shot guard is deferred.

- [x] **Unknown legacy subjects caused startup failure** [fixed] — one-time legacy import now filters expired/consumed records before relationship lookup and aggregate-log-skips orphaned users rather than blocking auth startup.
- [x] **Legacy grant FK failures blocked startup** [fixed] — authorization-code and refresh-token import verifies that the referenced client and user were imported before insertion, skips invalid relationships, and preserves the immutable backup.
- [x] **`AuthRuntimeDatabase.start()` first-init race** [fixed] — startup now caches and reuses one in-flight promise, publishes the active client only after migration succeeds, and closes only the failed local client. Concurrent-start coverage verifies one initialization path.
- [x] **Revoked A2A peer trust resurrected on restart** [fixed] — `auth_legacy_imports` records successful completion of the immutable JSON/JWK import set. Later restarts never reread legacy trust grants; revocation persistence has restart coverage.

### P1 — Correctness / data loss

- [x] **Passkey `excludeCredentials` leaked other users' credential ids** [fixed] — both runtime and compatibility stores scope registration exclusions to the target subject; multi-user coverage verifies only that person's passkeys are returned.
- [x] **Conversation-memory recall loss for legacy participants** [fixed] — legacy summary/decision/action actor references now retain deduplicated opaque `ActorRef` aliases derived from historical actor/source ids, and retrieval matches those aliases without restoring raw provider subjects.
- [x] **Action-item / decision attribution was lost for label-less actors** [fixed] — attribution matching now consistently falls back to the stable `actorRefKey`, matching the prompt speaker label without exposing or depending on raw legacy ids.
- [x] **Already-delivered setup link was invalidated on restart** [fixed] — hidden setup URL retrieval now refuses to rotate while an active delivered token exists. Restart coverage keeps the delivered link valid and hash-only.
- [x] **Per-recipient setup-delivery dedupe collapsed** [fixed] — `setup_token_deliveries` now retains one hash-only dedupe row per token and recipient, including provider delivery ids when available. The generated migration backfills the pre-normalized hash, while a one-shot compatibility import recovers every recipient still present in the immutable legacy setup-state backup.

### P2 — Efficiency

- [x] **Identity-resolution cache was dead code** [fixed] — private resolver results now populate a 30-second positive cache and unresolved actors use the same bounded negative cache. Cache hits preserve canonical display metadata and `refreshCache()` clears both indexes.
- [x] **Unindexed historical identity lookup** [fixed] — `person_identity_claims` now has both its active unique index and a total `identity_key_hash` index for denied/revoked-binding lookups.
- [x] **People-admin endpoint is ~4N+1 queries** [fixed] — the runtime admin adapter now bulk-loads users, identity claims plus evidence, passkeys, and agent links, then groups them in memory. The exported endpoint contract retains its per-user compatibility fallback, but the production `/auth/admin/users` path no longer fans out by roster size.
- [x] **JWT verified twice per MCP request** [fixed] — `resolveBearerGrant()` now returns verified token claims and the current active principal from one signature verification; the MCP hook consumes that grant instead of calling both verification paths.
- [x] **Session resolved twice per web-chat request** [fixed] — web chat now resolves one browser-access result per guarded request. The test override seam remains available as a fallback when no principal resolver succeeds, while the default path no longer repeats cookie, session, and user lookups.
- [x] **`/api/console/jump` lost its Admin gate** [fixed] — the endpoint now returns 403 unless the resolved active principal has Admin permission; trusted-session coverage prevents hidden widget-group disclosure.

### P3 — Altitude / cleanup

- [x] **ActorRef is flattened back to a stringly-typed `userId`** [fixed] — `ToolContext`, AI call options, tool events, MCP routing, create interceptors, and job metadata now carry a required discriminated `ActorRef`. The flattened `userId`/`canonicalId` context fields and agent/MCP sentinels were removed rather than deprecated. `authenticatedUserId(context)` is the only user projection policy; jobs retain `requestedByActor` for every actor kind and set `requestedByUserId` only for a user actor.
- [x] **Divergent auth migration stack** [fixed] — the current schema is defined once in Drizzle, migration SQL/journal/snapshots are generated by Drizzle Kit, runtime startup uses the standard Drizzle migrator, and the CLI bundles the generated assets. A marker-detected pre-Drizzle bridge remains only until the compatibility release gate permits removal.
- [x] **People administration is a management surface miscast as a dashboard tab** [fixed] — People now lives as the first section of the standalone `@brains/admin` React admin console at `/admin`, consuming browser-safe auth-service role and mutation contracts. The monitoring dashboard no longer embeds People markup, styles, scripts, or tab branches; the route-derived console strip and Admin-gated ⌘K response expose the Admin door. Authenticated non-Admins receive only their self-service representation-consent view, while roster administration remains enforced by the Admin-only auth API.
- [x] **Duplicated migration/hash scaffolding** [fixed] — legacy record imports now share one ordered `migrateLegacyRecords(lister, importer, label)` path for counting and structured logging while retaining record-specific validation. The former handwritten runtime migration runners were already removed by the generated Drizzle migration work. Persisted hex and base64url SHA-256 keys now use pinned shared utilities, preventing store-specific encoding drift.

### Refactoring follow-ups (2026-07-18 post-merge review)

Non-blocking cleanup surfaced by the merge-readiness pass over the six hardening/People-console commits. None gate the merge; ranked by payoff.

- [x] **Finish the `http-responses.ts` migration** [fixed] — `requireSameOriginJson(request)` now owns the same-origin and JSON-content guard responses for admin reconciliation, admin mutations, representation consent, and future private mutation routes.
- [x] **Extract shared error-to-response helpers** [fixed] — `errorMessage(error, fallback)` now centralizes safe thrown-error projection across admin, representation, and top-level auth request handling without exposing unknown thrown values.
- [x] **Split `plugins/admin/ui-react/src/App.tsx`** [fixed] — the People container is now isolated from reusable roster/detail/consent components, add/identity/promotion dialogs, the modal frame, shared view types, and pure label/date formatting. `App.tsx` retains the stable public exports while dropping from roughly 1,416 to about 450 lines.
- [x] **Centralize SPA mutation feedback** [fixed] — a tested `runWithFeedback` utility, `useMutationFeedback` hook, and safe `messageOf(error, fallback)` projection now own mutation, representation-consent, clipboard, and reconciliation feedback without exposing unknown thrown values.

### OAuth surface — endpoint hardening (2026-07-16 endpoint audit)

A follow-up audit of the full HTTP surface confirmed the admin/session/identity/representation/WebAuthn endpoints are well-gated (`resolveSession` → active Admin, same-origin + action-matched `confirmation`, thorough secret redaction; `acceptRepresentation` enforces `user.personId === link.personId`). The lower-severity OAuth authorization-server findings were defense-in-depth rather than access holes and are now fixed.

- [x] **`GET/POST /authorize` gates on bare session existence, not `resolveSession`** [fixed] — both authorization methods now use the same active-user session resolver as the rest of auth. Regression coverage creates a surviving session for a suspended user and verifies that page and approval requests both return 401.
- [x] **`POST /revoke` skips client auth when `client_id` is omitted** [fixed] — revocation now requires a registered `client_id`, authenticates confidential clients, and scopes the token update to that client. Public clients remain secretless by design but can no longer submit an unbound revocation.
- [x] **JWT verified twice per MCP request** [fixed, perf] — `resolveBearerGrant()` performs one verification and returns both scope claims and the active principal; `resolveBearerToken()` remains a compatibility projection over that grant.
- [x] **Duplicated request helpers across admin/representation endpoints** [fixed, cleanup] — same-origin checks, tolerant JSON reading, and private no-store JSON responses now share the auth HTTP response module.
- [x] **`resolveIdentity` collapses `denied` into `undefined`** [fixed] — `resolveIdentity` is retained only as an explicitly deprecated compatibility projection for non-authorizing enrichment; its contract warns that denied and unbound both return `undefined`. Authorization guidance and APIs use the discriminated `resolveIdentityAccess` result so denied bindings cannot fall through to static rules.

**Resolved — open dynamic client registration stays open; bound it, don't gate it.** Exposure model: this is an **internet-facing** OAuth authorization server — external MCP clients (Claude.ai, IDEs) connect over the public internet (`identity-and-trust.md:22`). Open DCR (`POST /register`, `oauth-endpoints.ts:248-268`, RFC 7591) is therefore _required_ for MCP client auto-registration and must **not** be gated behind an Admin/setup token, which would break onboarding. It is not an access hole: `/token` supports only `authorization_code` and `refresh_token` — no `client_credentials` grant (`oauth-endpoints.ts:294-304`) — so a self-registered client is inert until a human completes consent at `/authorize`, and the code is bound to that session's subject. The residual risk is storage/DoS (unbounded client rows) and consent-phishing, so:

- [x] **Rate-limit and prune `/register`** [fixed] — registration stays open, but each caller receives a 30-attempt-per-minute budget and each runtime retains a higher 300-attempt circuit breaker, returning `429` with `Retry-After` beyond either bound. Pruning removes registrations older than seven days only when no authorization code or refresh token records consent, preserving approved clients (consumed auth codes are soft-deleted, so a consented client keeps a permanent protecting row).

  Two follow-up refinements confirmed by the 2026-07-18 verification pass (both were refinements on a correct fix, not access holes):

  - [x] **Rate limiter was global, not per-caller** [fixed] — proxy-canonicalized caller IPs now have independent bounded in-memory windows, with a conservative shared bucket when no valid source header is available. The active source map is bounded by a higher per-runtime circuit breaker that also limits distributed abuse. State intentionally remains ephemeral and address-free outside process memory; multi-instance coordination belongs at the deployment edge.
  - [x] **Pruning was lazy, not scheduled** [fixed] — auth startup now runs stale-client maintenance immediately and starts an unreferenced hourly schedule, independent of registration traffic. Shutdown stops the schedule, failed maintenance is logged without taking authentication offline, and cadence coverage verifies long-running cleanup.
  - [x] **Supervise OAuth client maintenance through the private Effect lifecycle** [fixed] — a package-private, non-overlapping Effect supervisor now runs the immediate prune and unreferenced recurring delay, reports failures without stopping later maintenance, and uses `TestClock` for deterministic cadence coverage. Repeated shutdown calls join; shutdown interrupts the pending delay but drains an admitted prune before `AuthRuntimeDatabase.stop()`.

### Cleared — do not re-litigate

- **Refresh-token `single-operator` drop** (`auth-service.ts:507`) — **not a bug.** Deliberate, documented (plan lines 39/249, `multi-user.md:251`), logged as `skippedLegacy`. Forced one-time re-auth is the intended behavior.
- **MCP access tokens with `single-operator` subject rejected post-migration** (`mcp-interface.ts:136`) — **intended one-time re-auth**, not a lockout: 15-min access-token TTL, and the operator's passkey is migrated to the first Admin user, so it's a one-time OAuth re-consent.
- **Drizzle `.notNull()` vs nullable `ALTER` on `person_id`** (`runtime-schema.ts:164`) — **refuted.** Migration 6 backfills every row and all insert paths set `person_id`; no NULL row is constructible.

### Completed: Admin permission + Anchor identity (multi-user decision 12)

`multi-user.md` decision 12 (adopted 2026-07-18) splits **Anchor** (the brain's owner/subject identity) from **Admin** (the permission role). The migration is complete:

- [x] **Canonical role is `admin`** — `AUTH_USER_ROLES`, `permissionLevel`, endpoint gates, entity policy, interface configuration, evaluation fixtures, and console copy use only `admin | trusted | public`. There is no runtime role/config alias for `anchor`; generated migration `0002_superb_firebrand.sql` performs the bounded historical row conversion.
- [x] **`AuthPrincipal.isAnchor` is independent** — interfaces authorize only on `admin`, while authenticated/configured callers propagate `isAnchor` through chat and model instructions solely for identity/voice.
- [x] **Anchor kind and subject are persisted** — `auth_brain_anchor` stores one person or collective subject. A personal Anchor must remain an active Admin; a collective is administered by any active Admin, and no user has `isAnchor`.
- [x] **`profileEntityId` remains the profile-generalization seam** — person and Anchor summaries reuse the profile reference for the companion profile-on-subjects model rather than inventing a second linkage.

### Correction: anchor kind is configuration, not a console mutation (multi-user decision 13)

`multi-user.md` decision 13 (adopted 2026-07-19) corrects the shipped in-console anchor editor: the anchor kind is declared in `brain.yaml` (`anchor: person | team | organization`, where `team`/`organization` both resolve to the collective kind) and the console is read-only over both kind and profile. The runtime still projects the config-declared kind into the `auth_brain_anchor` singleton so `isAnchor` resolution and audit are unchanged, but the write path is removed:

- [x] **Remove the console anchor write path** — the `updateBrainAnchor` mutation, `person/collective` toggle, and mutation action are gone; `GET /auth/admin/anchor` remains read-only for display.
- [x] **Source the anchor kind from `brain.yaml`** — `anchor: person | team | organization` resolves at startup and projects into `auth_brain_anchor` (`team`/`organization` → `collective`); brain definitions provide compatibility defaults and generated instance configs declare the flavor explicitly.
- [x] **Resolve the displayed anchor/member name from the CMS profile** — `profileEntityId` points at CMS content, Admin responses resolve its current name with auth `displayName` only as fallback, and the console deep-links profiles to `/cms`.
- [ ] **Unify the anchor-kind vocabulary on `professional | team | collective`** _(2026-07-19)_ — the shipped code uses `anchor: person | team | organization` (config) and `person | collective` (`AUTH_BRAIN_ANCHOR_KINDS`), a third spelling of the same axis the `anchor-profile` schema already names `professional | team | collective`. Rename config and the auth enum to the profile schema's vocabulary (the canonical one), keeping the binary behavior: `professional` personal, `team`/`collective` impersonal. Optionally rename `collective → organization` in the same pass. Provide a bounded read-compat for the persisted `person`/`collective` rows.

### Direction: access is runtime state, with a libSQL backup destination (multi-user decision 14)

`multi-user.md` decision 14 makes `auth.db` the single request-time source of truth for access; `brain.yaml` allowlists are retained but demoted to an idempotent boot-time seed (headless bootstrap + GitOps), not a request-time fallback. This is a post-merge follow-on — it does not expand the current branch — but the storage/durability shape is owned here:

- [ ] **Store the interface allowlist in `auth.db` and read only the DB at request time.** Persist `interface:userId` grants (today's config `admins`/`trusted`/`anchors`) as runtime rows; permission lookup reads them alone; the admin API/console gets allowlist CRUD. Non-login channels remain supported — the row is an allowlist keyed by raw provider id, not a session.
- [ ] **Seed config allowlists into the DB on boot, idempotently.** Apply `brain.yaml` `admins`/`trusted`/`anchors` to the DB at startup with seed-if-absent semantics so console edits are not overwritten on the next boot. This is what seats the first admin on a headless (no-web/passkey) brain and preserves GitOps reproducibility, without reintroducing a request-time config path.
- [ ] **Add a libSQL backup destination for `auth.db`.** Configure a sync/backup target (embedded replica → remote primary, or scheduled encrypted snapshots) for durability and point-in-time recovery. The target is a private durable store and **never git** — the "`auth.db` never syncs through git" rule is unchanged.
- [ ] **Sequence and keep the bridge.** Land the DB allowlist + single-read-path lookup + console CRUD + seed loader; migrate config grants into the seed path; only then stop reading config allowlists at request time. Retain the current request-time `brain.yaml` allowlist (incl. the `admins: ["discord:…"]` provisioner seed) until that path exists, so no non-login channel loses its way in mid-migration.

## Consumers to satisfy

- **Multi-user auth**: real `usr_<uuid>` subjects, roles, active/suspended status, multiple Admins, one person/collective Anchor subject, and last-Admin protection.
- **MCP OAuth**: per-session permissions from the authenticated user instead of global Admin authority.
- **Chat / hosted Discord**: explicit `discord:<id>` to user lookup for routing and attribution, without storing those bindings in content.
- **Conversation memory**: optional canonical identity enrichment from private runtime identity bindings.
- **CMS passkey login**: a valid authenticated browser session to gate release of the shared content PAT (see `plugins/cms/src/plugin.ts`, where the GitHub OAuth and passkey-gated PAT login methods already consume `auth-service`). No per-editor commit attribution — that is a Sveltia limitation, not an auth-DB feature.
- **A2A peer trust**: the peer-trust records (domain, pinned key fingerprint, granted inbound level) that directory approval writes per [a2a-request-signing.md](./a2a-request-signing.md) decision 6 — trust grants must live on this runtime plane, never in git-synced content.
- **Admin console People section / future CLI**: user, role, passkey, identity, and representation management.

## Core decisions

1. **Use libSQL + Drizzle, matching the repo's existing pattern.**
   - Default local path: `./data/auth/auth.db`.
   - Keep the parent directory private (`0700`) and database files private (`0600`) where the platform supports it.
   - Follow the precedent in `shell/entity-service` and `shell/job-queue` (`@libsql/client` + `drizzle-orm/libsql`, migrations via `drizzle-kit`). Do not introduce `bun:sqlite` or a second DB stack.
2. **The auth DB owns auth truth.**
   - Users, roles, identities, passkeys, sessions, OAuth grants, refresh tokens, setup tokens, and auth audit live here.
   - Content entities may reference safe public/person labels later, but never become the source of auth truth.
3. **`usr_<uuid>` replaces `single-operator`.**
   - Fresh setup creates the first active admin user.
   - Existing stores migrate lazily and revoke old `single-operator` refresh tokens.
4. **Identity binding is explicit.**
   - No display-name matching or inferred cross-platform linking.
   - Admins attach identities such as Discord ids, emails, OAuth subjects, DIDs, or MCP subjects.
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
  role: "admin" | "trusted" | "public";
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
- `setup_tokens`: token hash/id, purpose, target user id, expiry, consumed timestamp, and the bounded pre-normalization delivery-hash compatibility column.
- `setup_token_deliveries`: setup-token hash, recipient hash, delivery timestamp, and optional provider delivery id, uniquely keyed per token and recipient.

### A2A peer trust

- `a2a_peer_trust`: normalized peer domain, pinned key fingerprint, granted inbound level (`public` or `trusted`), and timestamps. Admin-level peer grants are forbidden.

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
  - enforce last-active-Admin protection
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
  role: "admin" | "trusted" | "public";
  status: "active" | "invited" | "suspended";
  permissionLevel: "admin" | "trusted" | "public";
  canonicalId?: string;
}
```

Suggested APIs:

- `resolveSession(request): Promise<AuthPrincipal | undefined>`
- `resolveBearerToken(request): Promise<AuthPrincipal | undefined>`
- `resolveIdentityAccess(type, subject, issuer?): Promise<{ state: "resolved"; principal: AuthPrincipal } | { state: "denied" } | { state: "unbound" }>`
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
5. If unauthenticated or interface-local only, call `resolveIdentityAccess()`.
6. Use the resolved principal, deny a `denied` binding, and fall back to existing `PermissionService` rules only for `unbound`.

This preserves existing `brain.yaml` rules while making auth users authoritative when present.

## Canonical identity and conversation attribution

The auth DB becomes the private canonical identity backend. Do not add a separate `./data/identity/canonical-identities.json` store unless this DB plan is explicitly postponed.

- `CanonicalIdentityService` should query `AuthService.resolveActorPrincipal()` through the private auth-principal channel or use a small read-only identity index.
- `canonicalId` comes from `auth_users.canonical_id` when set, otherwise a safe runtime-only user id may be used inside runtime stores.
- Git-backed derived memory should store only safe canonical labels when configured; raw actor ids and account ids stay runtime-private.
- Existing actor/source metadata remains valid and should be preserved by chat interfaces.

## Migration strategy

### Fresh installs

1. DB starts empty.
2. First setup creates `usr_<uuid>` with role `admin`, status `active`, and `canonical_id = user:<id-suffix>` generated from the user id; that person's subject becomes the personal Anchor.
3. Passkey registration binds the credential to that user.
4. Sessions, auth codes, access tokens, and refresh tokens use `sub = usr_<uuid>`.

### Existing installs

Run an idempotent migration on auth-service startup:

1. Create/open `auth.db` and record migration version.
2. Import the current JWK signing key.
3. Import OAuth clients.
4. If passkeys or sessions use `single-operator` and no users exist, create the first active admin user.
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

**Status: implemented.** Users, identities, first-Admin/passkey setup, passkey credentials/challenges, legacy subject rebinding, and transactional anchor invariants use the runtime database.

- Add `auth_users`, `auth_identities`, passkey credential/challenge tables.
- First setup creates an admin user and, for a personal brain, binds that person's Anchor identity.
- New passkeys bind to user ids.
- Migrate `single-operator` passkeys.
- Add atomic last-active-Admin and personal-Anchor protection.

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

Validation: trusted users cannot call admin-only tools; suspended users are denied; MCP session ids cannot be reused by another user or retain a superseded role; legacy rule fallback still works.

### Phase 5 — Management surface

**Status: implemented, including the People client completed in phase 7.** User, role, status, identity, passkey, session-revocation, and user-specific passkey-registration operations are available through a same-origin Admin-session API and remain deliberately absent from model tools.

- Add an authenticated, Admin-authorized API/console and optional local CLI wrappers for user/identity/passkey management.
- Require explicit Admin interaction and confirmation for role, status, identity, and credential mutations.
- Do not expose auth-user records or management mutations as agent tools.
- Add audit events for every management mutation.

Validation: Admins can create/promote/suspend users; trusted users cannot manage users; the last active Admin and a personal Anchor cannot be demoted or suspended.

### Phase 6 — Consumers

**Status: implemented.** `CanonicalIdentityService` resolves actors asynchronously through the private auth service; linked Discord messages carry canonical user attribution into active and passive conversations; OAuth-authenticated MCP and authenticated web chat propagate verified principals; agent-invoked and confirmed tools, tool lifecycle events, and tool-enqueued jobs retain the authenticated requester. A discriminated `ActorRef` now separates local users, opaque external identities, agents, and services; legacy flattened actor metadata is read-compatible but no longer written.

- Keep `CanonicalIdentityService` wired to auth DB identity lookup without storing raw provider subjects outside auth storage.
- Wire chat/hosted Discord routing to identity lookup where needed.
- Add conversation/job/tool attribution from `AuthPrincipal`.

Validation: linked Discord user maps to a brain user; conversation metadata can include user/canonical attribution without content-stored account bindings.

### Phase 7 — Auth-session terminology and admin console

**Status: implemented; bounded legacy-cookie compatibility remains active.**

- [x] Approve the console design. The end state is captured per anchor kind: [person](../design/admin-console-person-mockup.html), [team](../design/admin-console-team-mockup.html), and [organization](../design/admin-console-org-mockup.html).
- [x] Rename `operator_sessions` to `auth_sessions` in migration 5 while preserving every active session row.
- [x] Rename `OperatorSession*`, `getOperatorSession`, and related service APIs to `AuthSession*` or `BrowserSession*`; no deprecated wrappers remain in the private workspace API.
- [x] Move `brains_operator_session` to `brains_auth_session`, dual-read the legacy cookie during a bounded compatibility window, and clear both cookies on logout.
  - `bun run auth-session:compat-check` enforces zero deprecated source consumers and blocks early removal of the legacy cookie reader.
  - `shell/auth-service/auth-session-compat.json` records the cookie and Drizzle-migration introduction releases plus the minimum supported upgrade version. The release workflow stamps introduction versions after the auth-service package is versioned.
  - Remove either the legacy cookie reader or pre-Drizzle database bridge only when the recorded minimum supported upgrade version is at least that compatibility path's introduction version.
- [x] Rename `OperatorSetupRequired` and user-facing operator setup/login copy to generic passkey/authenticated-session language.
- [x] Keep `single-operator` only as an immutable historical migration alias.
- [x] Make dashboard permission resolution use `resolveSession()` and the principal's actual role instead of treating any session as Admin.
- [x] Add the `/admin` React console with People as its first section, Admin-only roster administration, authenticated self-service representation consent, canonical `Admin`/`Trusted`/`Public` role labels plus a separate Anchor facet, route-derived console navigation, and a ⌘K Admin door.

Validation: existing sessions survive migration; trusted sessions stay trusted in the dashboard; only Admins can use People administration; no user-facing role copy says Owner or Operator.

### Phase 8 — Person subjects and canonical identity claims

**Status: complete.** The generated schema stores normalized person claims and independent evidence; the bounded bridge preserves legacy claim ids while backfilling migration evidence. Agent assertions cannot authenticate, while provider/admin verification remains separate. Stable person backfill, consent-bearing agent/person links, promotion, targeted registration, existing-user linking, self-service consent, `/admin` People-section linked-agent state, and the approved-agent entry point are implemented. Agent-carried human DID assertions import as non-authenticating evidence, exact claims on the selected person reuse claim ids, and cross-person conflicts roll back for reconciliation. Before promotion, the private Admin-only reconciliation endpoint compares exact claim hashes without returning subjects or hashes: one independently verified person is safely preselected, asserted-only ownership never selects automatically, and cross-person ownership is named in a blocking review state for explicit correction through People administration. Product behavior and promotion UX are specified in [Multi-user and permissions](./multi-user.md#phase-6--person-centered-identity-and-agent-promotion).

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
