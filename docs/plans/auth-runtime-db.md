# Plan: Auth runtime database

## Status

Implementation is in final hardening on `feature/auth-runtime-db`. The role-aware four-section `/admin` console, Admin-only audit viewer, labeled standalone-grant management, access-neutral external-peer associations, compatibility-safe session terminology migration, generated Drizzle auth schema, normalized identity evidence, and decision 14's DB-backed exact-principal bootstrap/recovery path are implemented. The bounded legacy-cookie reader and pre-Drizzle database bridge remain active until their automated release gate permits removal. Decision 15's connected delivery-channel binding and the clean file-store cutover are implemented. Automated provider delivery/resend remains follow-on work. Legacy JSON/JWK files are optional manual backups and are never read by `AuthService`.

A high-effort multi-agent review (2026-07-16) surfaced privilege-escalation and boot-integrity defects introduced by multi-user capability. All confirmed P0 findings are now fixed with regression coverage; remaining lower-priority findings are tracked below. This plan refines the broader [Operator runtime database](./operator-runtime-db.md) boundary for auth-specific state.

## Goal

Create one private runtime database for users, credentials, OAuth state, identity bindings, permissions, and auth audit so multi-user auth, hosted Discord routing, conversation attribution, and CMS commit attribution all share the same source of truth.

The database is runtime state. It must never live under `brain-data`, be exported as markdown, or sync through the content git repo.

## Source of truth

This plan owns the auth-specific schema, auth storage APIs, clean JSON/JWK cutover, and `usr_<uuid>` subjects. Broader runtime storage location, deploy persistence, and backup/restore policy belong to [Operator runtime database](./operator-runtime-db.md). Product behavior, permissions, user-management UX, and attribution phases belong to [Multi-User & Permissions](./multi-user.md).

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
- Clean auth-file cutover: only `auth.db` is runtime truth; legacy JSON/JWK files remain untouched and require one-time re-onboarding rather than automatic import.
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

High-effort multi-agent review of the full `main...HEAD` branch diff (8 finder angles, per-candidate adversarial verification). 17 findings confirmed against the code. The dominant theme: **this branch makes non-admin users possible for the first time (person promotion → invited user → passkey login), but several surfaces still equate "has a session cookie" with "is an Admin," turning previously-safe single-operator gates into privilege escalations.** A second cluster concerned the now-removed legacy JSON→DB import layer, where repeated imports could brick startup or resurrect revoked state.

Each item is `file:line — problem → fix`. Verified severity in brackets.

### P0 — Privilege escalation (fix before merge)

- [x] **CMS editor accepted any session** [fixed] — the editor shell and every editor API route now resolve the active principal and require `permissionLevel === "admin"`; trusted-session denial is covered.
- [x] **Sveltia token endpoint released the content-repo PAT to any session** [fixed] — passkey CMS shell/login gates and `/auth/cms-token` resolve the active principal and require Admin permission; non-Admin token requests return 403.
- [x] **MCP trusted client-supplied `_meta.userId`** [fixed] — tool registration derives user identity only from the server-verified auth subject. Unauthenticated metadata receives the non-user `mcp-user` sentinel, with spoofing coverage.

### P0 — Boot crash-loop / integrity (legacy imports removed)

The file-import findings below were first mitigated with one-shot guards, then eliminated by the 2026-07-22 clean-cutover decision. `AuthService` never reads legacy JSON/JWK files; existing operators re-onboard once.

- [x] **Unknown legacy subjects caused startup failure** [removed] — there is no file-import relationship lookup during startup.
- [x] **Legacy grant FK failures blocked startup** [removed] — authorization codes and refresh tokens begin in `auth.db`; legacy files are never inserted.
- [x] **`AuthRuntimeDatabase.start()` first-init race** [fixed] — startup caches and reuses one in-flight promise, publishes the active client only after migration succeeds, and closes only the failed local client. Concurrent-start coverage verifies one initialization path.
- [x] **Revoked A2A peer trust resurrected on restart** [removed] — peer trust is read only from `auth.db`, so a stale JSON file cannot restore a revoked grant.

### P1 — Correctness / data loss

- [x] **Passkey `excludeCredentials` leaked other users' credential ids** [fixed] — both runtime and compatibility stores scope registration exclusions to the target subject; multi-user coverage verifies only that person's passkeys are returned.
- [x] **Conversation-memory recall loss for legacy participants** [fixed] — legacy summary/decision/action actor references now retain deduplicated opaque `ActorRef` aliases derived from historical actor/source ids, and retrieval matches those aliases without restoring raw provider subjects.
- [x] **Action-item / decision attribution was lost for label-less actors** [fixed] — attribution matching now consistently falls back to the stable `actorRefKey`, matching the prompt speaker label without exposing or depending on raw legacy ids.
- [x] **Already-delivered setup link was invalidated on restart** [fixed] — hidden setup URL retrieval now refuses to rotate while an active delivered token exists. Restart coverage keeps the delivered link valid and hash-only.
- [x] **Per-recipient setup-delivery dedupe collapsed** [fixed] — `setup_token_deliveries` retains one hash-only dedupe row per token and recipient, including provider delivery ids when available. The generated migration backfills existing database rows; legacy setup-state files are not imported.

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
- [x] **People administration is a management surface miscast as a dashboard tab** [fixed] — administration now lives in the standalone four-section `@brains/admin` React console at `/admin`; the monitoring dashboard no longer embeds People mutations, and the unreleased self-service representation view is removed.
- [x] **Duplicated migration/hash scaffolding** [fixed] — the handwritten migration runners and later file-import layer are removed; generated Drizzle migrations are the only runtime schema path. Persisted hex and base64url SHA-256 keys use pinned shared utilities, preventing store-specific encoding drift.

### Refactoring follow-ups (2026-07-18 post-merge review)

Non-blocking cleanup surfaced by the merge-readiness pass over the six hardening/People-console commits. None gate the merge; ranked by payoff.

- [x] **Finish the `http-responses.ts` migration** [fixed] — `requireSameOriginJson(request)` now owns the same-origin and JSON-content guard responses for admin reconciliation, admin mutations, representation consent, and future private mutation routes.
- [x] **Extract shared error-to-response helpers** [fixed] — `errorMessage(error, fallback)` now centralizes safe thrown-error projection across admin, representation, and top-level auth request handling without exposing unknown thrown values.
- [x] **Split `plugins/admin/ui-react/src/App.tsx`** [fixed] — the People container is isolated from reusable roster/detail components, dialogs, modal framing, shared view types, and pure formatting. Decision 15 separately removes the superseded consent/promotion components.
- [x] **Centralize SPA mutation feedback** [fixed] — a tested `runWithFeedback` utility, `useMutationFeedback` hook, and safe `messageOf(error, fallback)` projection now own mutation, representation-consent, clipboard, and reconciliation feedback without exposing unknown thrown values.

**`user-store.ts` decomposition (2026-07-22 review).** At ~904 loc `AuthUserStore` carries ~5 responsibilities (anchor/first-admin bootstrap, user/person CRUD, role/status invariants, targeted-setup completion, identity/evidence). The length is a missing-seam symptom, not verbose code. Ranked by payoff:

- [x] **De-duplicate `updateUserRole` / `updateUserStatus`** [fixed] — both methods delegate to one `applyGuardedUserMutation` path for personal-Anchor and last-active-Admin checks. Mixed concurrent role/status coverage verifies that only one removal succeeds and an active Admin remains.
- [x] **Extract `AuthIdentityStore`** [cohesion split] — the identity/evidence/claims cluster (`ensureIdentity`, `attachIdentity`, `list/detach/resolveIdentity*`, plus the `identityRecordFromEvidence` / `normalizeIdentityKey` / `hashIdentityKey` helpers) now lives in its own bounded store over `authIdentities` + `authIdentityEvidence`. `AuthService` composes the user and identity stores independently, while each store keeps its own narrow user lookup; `user-store.ts` is reduced to the user/person, Anchor, invariant, and still-to-move targeted-setup responsibilities.
- [x] **Relocate targeted-setup completion to the setup domain** [altitude] — `TargetedSetupService` now owns delivery validation, atomic user activation, identity verification, and token consumption beside `setup-flow.ts` / `setup-state-store.ts`. `AuthService` composes it directly, leaving `AuthUserStore` independent of setup tokens, delivery records, and identity evidence.

Sequencing: setup-delivery binding is committed and green, so these decomposition items are now unblocked.

**`auth-service.ts` must come down from ~1812 loc (2026-07-22 review).** 1812 loc is not defensible as "it's the facade" — a composition root wires stores and delegates; it does not inline session/login orchestration, bearer resolution, identity reconciliation, setup delivery, and a whole migration importer. The size is inlined responsibility, and the target end state is a thin wiring + dispatch root (a few hundred loc) over domain services. Work, highest payoff first:

- [x] **Drop the legacy file→DB import entirely (clean cutover)** [implemented 2026-07-22] — the seven JSON stores, JWK readers, `LegacyAuthImportStore`, import orchestration, and compatibility tests are removed. Generated migration `0007_numerous_namorita.sql` drops the obsolete import-marker table. DB-backed auth never shipped, so existing file-store installs re-onboard once: re-register passkeys, re-approve MCP clients, and re-login. `clean-cutover.test.ts` verifies malformed legacy files are ignored, remain unchanged, and cannot populate `auth.db`.
- [x] **Extract domain services from the remaining orchestration** [the actual decomposition] — `AuthPrincipalService`, `IdentityReconciliationService`, `AuthUserManagementService`, `PasskeySetupCoordinator`, and `AuthAdministrationService` now own the former session/bearer, reconciliation, guarded-user, setup, and Admin orchestration. `AuthRuntime` owns database-backed composition and lifecycle. `AuthService` is the stable high-level compatibility facade rather than the implementation owner.
- [x] **Flatten `handleRequest` into a route table** [altitude] — `AuthRequestRouter` declares method/path handlers and CORS metadata over the map-backed `AuthRouteTable`. Exact dispatch is constant-time, wildcard methods cover private Admin endpoints, and generated `OPTIONS` routes avoid a growing conditional chain in `AuthService.handleRequest`.

`runtime-schema.ts` (~1095 loc) is genuinely fine — 20 pure `sqliteTable` definitions, zero logic; length is inherent to the table count, and a split would be arbitrary. It is the one large auth file the size rule does not indict.

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

- **File-store refresh tokens and access tokens are not imported** — **not a bug.** The clean cutover deliberately forces one-time re-authentication and OAuth re-consent.
- **File-store passkeys are not imported** — **intended re-onboarding**, not silent data loss: DB-backed auth never shipped, legacy files remain untouched as optional manual backups, and the setup flow creates a new `usr_<uuid>` Admin.
- **Drizzle `.notNull()` vs nullable `ALTER` on `person_id`** (`runtime-schema.ts:164`) — **refuted.** Migration 6 backfills every row and all insert paths set `person_id`; no NULL row is constructible.

### Completed: Admin permission + Anchor identity (multi-user decision 12)

`multi-user.md` decision 12 (adopted 2026-07-18) splits **Anchor** (the brain's owner/subject identity) from **Admin** (the permission role). The migration is complete:

- [x] **Canonical role is `admin`** — `AUTH_USER_ROLES`, `permissionLevel`, endpoint gates, entity policy, interface configuration, evaluation fixtures, and console copy use only `admin | trusted | public`. There is no runtime role/config alias for `anchor`; generated migration `0002_superb_firebrand.sql` performs the bounded historical row conversion.
- [x] **`AuthPrincipal.isAnchor` is independent** — interfaces authorize only on `admin`, while authenticated/configured callers propagate `isAnchor` through chat and model instructions solely for identity/voice.
- [x] **Anchor kind and subject are persisted** — `auth_brain_anchor` stores one person or collective subject. A personal Anchor must remain an active Admin; a collective is administered by any active Admin, and no user has `isAnchor`.
- [x] **`profileEntityId` remains nullable migration state** — the Anchor uses its CMS profile reference; decision 15 stops creating local member profiles and sources optional member display profiles from external peers.

### Correction: anchor kind is configuration, not a console mutation (multi-user decision 13)

`multi-user.md` decision 13 corrects the shipped in-console Anchor editor: the Anchor kind is declared in `brain.yaml` and the console is read-only over kind and Anchor profile. The runtime still projects the config-declared kind into the `auth_brain_anchor` singleton so `isAnchor` resolution and audit remain unchanged:

- [x] **Remove the console anchor write path** — the `updateBrainAnchor` mutation, `person/collective` toggle, and mutation action are gone; `GET /auth/admin/anchor` remains read-only for display.
- [x] **Source the Anchor kind from `brain.yaml`** — the shipped `person | team | organization` values resolve at startup and project into the binary persisted ownership behavior.
- [x] **Resolve the displayed Anchor name from the CMS profile** — `profileEntityId` points at CMS content and the console deep-links the brain's own profile to `/cms`.
- [x] **Retain the stable configuration vocabulary `person | team | organization`** — these values describe the Anchor subject clearly and remain backward compatible without aliases or migration machinery. Profile/UI flavor maps `person` to professional presentation and `organization` to collective presentation; that display vocabulary does not replace the config contract.
- [ ] **Stop synthesizing local member profiles** — a linked external brain may supply a read-only published profile; a member without an external brain has no profile for now and uses only the auth display name.

### Direction: access is runtime state, with explicit bootstrap and recovery (multi-user decision 14)

`multi-user.md` decision 14 makes `auth.db` the single request-time source of truth. `brain.yaml` is bootstrap/recovery input, not a request-time fallback or live GitOps policy:

- [x] **Persist interface principals in `auth.db`.** Generated migration `0005_round_kat_farrell.sql` stores exact standalone grants by normalized SHA-256 key and projects active rows into runtime permission lookup. Raw config subjects are not persisted.
- [x] **Keep permission and Anchor facets independent.** `admins`/`trusted` seed role grants; `anchors` seed separate Anchor bindings only. Anchor status never grants permission.
- [x] **Make connected accounts authoritative.** An unconnected channel uses its standalone grant. Once connected to a user, the user's current role/status and Anchor facet win; missing or suspended connected users are denied and cannot fall through to a stale grant.
- [x] **Seed every explicit declaration once.** Web and headless brains seed declared entries behind a persisted singleton marker. A config with no declarations seeds nothing. Later startup loads DB state without overwriting it.
- [x] **Add access-only reinitialization.** `brain auth reinitialize-access --yes` deliberately reapplies config, preserves users, identities, passkeys, external-peer links, keys, clients, and audit history, revokes active sessions/refresh tokens, and appends an audit event. It never runs automatically. `reset-passkeys` remains separate.
- [x] **Remove request-time exact-config fallback.** `PermissionService` starts with a boot bridge, then auth-service registration atomically replaces exact Admin/trusted/Anchor sets with the DB projection before interfaces run. Pattern rules and shared-space selectors remain intentional contextual config policy; static MCP token auth remains a deprecated transport-level Admin fallback with no Anchor identity.
- [x] **Add standalone-grant Admin CRUD.** The non-model-visible Overview panel creates, updates, lists, and revokes labeled exact grants. Subjects are normalized and hashed on write, and neither raw subjects nor hashes appear in persisted labels, responses, or audits. Every mutation refreshes the shell's in-memory DB projection immediately; connected accounts remain authoritative.
- [ ] **Add a private libSQL backup destination.** Use an embedded replica/remote primary or scheduled encrypted snapshots for durability and point-in-time recovery; never git.

### Correction: people link to peer brains, not representative agents (multi-user decision 15)

The unreleased representation implementation has been replaced by the target peer model:

- [x] **Add person-to-external-peer associations.** A local account and an external brain are independent facets. The peer remains a distinct actor and never inherits person roles, claims, or attribution.
- [x] **Use a clean pre-release schema correction.** The representation schema never shipped outside this feature branch, so generated Drizzle migrations create `person_external_peers` and remove the obsolete table without a historical data-copy transform or dual-read path.
- [x] **Remove representation APIs and UI.** `/auth/representations`, My agents, consent mutations, and represented-person projection are absent.
- [x] **Separate Sign-in from Connected channels.** Passkeys are sign-in credentials. Verified email and Discord are Admin-visible connected channels; raw lookup hashes and protocol internals remain hidden.
- [x] **Bind setup delivery explicitly.** Generated migration `0006_magical_maximus.sql` lets a targeted setup token reference an asserted person-owned email or Discord claim and its hashed delivery record. Successful single-use claim atomically verifies that channel, activates the invited user, consumes the token, and records a redacted audit event; wrong-user, suspended, undelivered, expired, and replayed claims fail closed. Retried links reuse the newest eligible confirmed claim instead of falling back to an unbound token.
- [x] **Build the four-section console contract.** Overview, Members/People, Invitations, and Audit have dedicated read models, including an Admin-only audit-list endpoint. No generic Advanced UI is present.

## Consumers to satisfy

- **Multi-user auth**: real `usr_<uuid>` subjects, roles, active/suspended status, multiple Admins, one person/collective Anchor subject, and last-Admin protection.
- **MCP OAuth**: per-session permissions from the authenticated user instead of global Admin authority.
- **Chat / hosted Discord**: explicit `discord:<id>` to user lookup for routing and attribution, without storing those bindings in content.
- **Conversation memory**: optional canonical identity enrichment from private runtime identity bindings.
- **CMS passkey login**: a valid authenticated Admin browser session gates release of the shared content PAT (see `plugins/cms/src/plugin.ts`, where the GitHub OAuth and passkey-gated PAT login methods already consume `auth-service`). No per-editor commit attribution — that is a Sveltia limitation, not an auth-DB feature.
- **A2A peer trust**: the peer-trust records (domain, pinned key fingerprint, granted inbound level) that directory approval writes per the shipped A2A request-signing work — trust grants must live on this runtime plane, never in git-synced content.
- **Admin console / future CLI**: Overview, member access, invitations, passkeys, connected channels, optional external-peer links, session revocation, and audit inspection.

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
   - Existing file-store installs re-onboard once; pre-Drizzle database rows use the bounded schema bridge.
4. **Identity binding is explicit.**
   - No display-name matching or inferred cross-platform linking.
   - Claiming a user-targeted setup link through verified email or Discord is an explicit binding ceremony; otherwise bindings require an authorized Admin/provider flow.
   - Connected channel identities resolve to the owning account before standalone principal grants.
5. **Avoid raw account ids where lookup hashes are enough.**
   - Store a normalized identity key hash for lookup.
   - Store type/issuer/label metadata for management UI.
   - Store raw provider tokens or subjects only when a concrete protocol requires them, and keep them runtime-private.
6. **Role resolution is deny-by-default for authenticated or connected invalid users.**
   - A valid token/session or connected channel whose user is missing or suspended is denied.
   - Unconnected interface-local callers may use only their standalone DB principal grant. There is no request-time exact-config fallback.

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

Delivery model: the auth DB does not store user emails on `auth_users`. A verified email or Discord channel stores its private deliverable address on the corresponding person claim as `delivery_subject`. The Admin API may return the full human-facing verified email/handle under **Connected channels**, but never lookup hashes, tokens, or raw protocol-only subjects. A setup token records the intended delivery claim/channel so successful claim can bind that channel to the target user. CMS commit attribution continues using configured `directory-sync` author data.

### Credentials and grants

- `passkey_credentials`: credential id, user id, public key, counter, transports JSON, device type, backup state, timestamps.
- `webauthn_challenges`: challenge hash, optional user id, kind, expiry, consumed timestamp. Registration challenges bind a user; discoverable-credential authentication challenges do not know the user until verification.
- `auth_sessions`: session token hash, user id, expiry, revoked timestamp. The historical table name is supported only by the pre-Drizzle upgrade bridge.
- `oauth_clients`: client id, optional secret hash, registered metadata JSON, timestamps.
- `oauth_auth_codes`: code hash, client id, user id, redirect URI, PKCE challenge, scope, expiry, consumed timestamp.
- `oauth_refresh_tokens`: token hash, client id, user id, scope, expiry, revoked/replaced metadata.
- `oauth_signing_keys`: key id, purpose (`oauth` or `a2a`), private JWK, active/retired status, timestamps. At most one active key per purpose.
- `setup_tokens`: token hash/id, purpose, target user id, optional delivery-claim/channel reference, expiry, consumed timestamp, and the bounded pre-normalization delivery-hash compatibility column.
- `setup_token_deliveries`: setup-token hash, recipient hash, delivery timestamp, and optional provider delivery id, uniquely keyed per token and recipient.
- `interface_principal_grants`: interface type, normalized principal-key hash, `admin | trusted` role, provenance/timestamps, and revocation state.
- `interface_anchor_bindings`: interface type plus principal-key hash for independent `isAnchor` identity; no permission column.

### External peers and A2A trust

- `person_external_peers`: person id, external brain id/domain/DID reference, verification state, creator, and timestamps. This association grants no role and does not rewrite the peer actor.
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

1. Verify the session/token/signature or normalize the interface principal.
2. Resolve a connected auth account first.
3. If the connected account is unresolved, inactive, or suspended, deny; never fall through.
4. If the connected account is active, use its current role.
5. If no account is connected, resolve the standalone interface-principal grant from `auth.db`.
6. Resolve `isAnchor` independently; it never changes permission.

The current request-time `brain.yaml` rule path remains only as a migration bridge. Final request processing reads DB state alone.

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

**Clean cutover — no file→DB import (decided 2026-07-22).** DB-backed auth never shipped, so there is no released install with a seamless-migration promise to honor. Existing installs start from an empty `auth.db` and re-onboard once: re-register passkeys, re-approve MCP/OAuth clients, and re-login. The signing key regenerates, so any outstanding tokens re-auth regardless. This supersedes the earlier idempotent-import design and is why the legacy import layer is deleted from `auth-service.ts` (see the size item under _Refactoring follow-ups_).

Operators with old JSON auth files may keep them as a manual backup; nothing reads them automatically.

## Phased implementation

### Phase 1 — DB foundation and schema

**Status: implemented.** Local lifecycle, generated Drizzle migrations, release-gated legacy upgrade bridge, permissions, explicit declaration-safe schema types, and temp-DB tests exist.

- Add auth DB open/close lifecycle and migrations.
- Add repositories and tests against a temp SQLite DB.
- Keep legacy JSON/JWK files untouched but outside runtime reads.

Validation: migrations are idempotent; file permissions are private; DB opens in local and test environments.

### Phase 2 — Users and passkeys

**Status: implemented.** Users, identities, first-Admin/passkey setup, passkey credentials/challenges, and transactional Anchor invariants use the runtime database.

- Add `auth_users`, `auth_identities`, passkey credential/challenge tables.
- First setup creates an admin user and, for a personal brain, binds that person's Anchor identity.
- New passkeys bind to user ids.
- Require one-time passkey re-registration for file-store installs.
- Add atomic last-active-Admin and personal-Anchor protection.

Validation: fresh setup, re-onboarding, and login all produce `usr_<uuid>` subjects.

### Phase 3 — OAuth/session stores

**Status: implemented.** OAuth/session/setup/signing stores use the runtime database with no legacy file readers.

- Move clients, auth codes, sessions, refresh tokens, setup tokens, and signing keys into DB-backed stores.
- Leave old file-store refresh tokens unreadable and force one-time re-authentication.
- Add user-status checks for sessions and bearer tokens.
- Revoke a user's sessions/refresh tokens when role/status/identity changes require it.

Validation: OAuth code flow, refresh rotation, logout, setup-token flow, and client registration work from DB stores.

### Phase 4 — Permission integration

**Status: implemented.** Principal resolution and MCP/Discord integration deny invalid authenticated identities and enforce current per-user permissions.

- Return `AuthPrincipal` from bearer/session verification.
- Make HTTP MCP create per-session servers at the user's permission level.
- Bind each MCP session id to its authenticated user and permission level; reject cross-user reuse and invalidate the session when the user's role changes.
- Add identity lookup before rule fallback for Discord/MCP/chat interfaces.
- Keep static `MCP_AUTH_TOKEN` as a deprecated Admin-only fallback; it never establishes Anchor identity.

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

**Status: base console implemented; bounded legacy-cookie compatibility remains active; decision 15's redesign is planned.**

- [x] Capture the end-state console design per Anchor profile flavor: [professional](../design/admin-console-person-mockup.html), [team](../design/admin-console-team-mockup.html), and [collective](../design/admin-console-org-mockup.html).
- [x] Rename `operator_sessions` to `auth_sessions` in migration 5 while preserving every active session row.
- [x] Rename `OperatorSession*`, `getOperatorSession`, and related service APIs to `AuthSession*` or `BrowserSession*`; no deprecated wrappers remain in the private workspace API.
- [x] Move `brains_operator_session` to `brains_auth_session`, dual-read the legacy cookie during a bounded compatibility window, and clear both cookies on logout.
  - `bun run auth-session:compat-check` enforces zero deprecated source consumers and blocks early removal of the legacy cookie reader.
  - `shell/auth-service/auth-session-compat.json` records the cookie and Drizzle-migration introduction releases plus the minimum supported upgrade version. The release workflow stamps introduction versions after the auth-service package is versioned.
  - Remove either the legacy cookie reader or pre-Drizzle database bridge only when the recorded minimum supported upgrade version is at least that compatibility path's introduction version.
- [x] Rename `OperatorSetupRequired` and user-facing operator setup/login copy to generic passkey/authenticated-session language.
- [x] Keep `single-operator` only as a bounded API compatibility alias; never write it to runtime state.
- [x] Make dashboard permission resolution use `resolveSession()` and the principal's actual role instead of treating any session as Admin.
- [x] Add the `/admin` React console, Admin-only roster administration, canonical role labels plus a separate Anchor facet, route-derived console navigation, and a ⌘K Admin door.
- [x] Replace current navigation with Overview, Members/People, Invitations, and Audit.
- [x] Remove My agents/representation consent, add peer associations, show passkeys under Sign-in and verified email/Discord under Connected channels, and omit generic Advanced details.
- [x] Add the Admin audit-list endpoint and viewer.

Validation: existing sessions survive migration; trusted sessions stay trusted in the dashboard; only Admins can use administration; no user-facing role copy says Owner or Operator; Anchor content does not repeat above the roster.

### Phase 8 — Person subjects, connected channels, and external peers

**Status: person backfill, normalized claims, the clean pre-release peer-association correction, and targeted delivery-channel binding are complete. Automated provider delivery and invitation lifecycle UX remain follow-on work.**

- Preserve stable runtime people, user links, user ids, passkeys, sessions, roles, statuses, claims, evidence, and historical link ids.
- Keep canonical provider claims person-owned while retaining user authentication bindings and assurance.
- [x] Add external-peer associations that never grant a role, inherit person identity, or rewrite actor attribution.
- [x] Replace the unreleased representation table directly; no released rows require conversion.
- [x] Remove representation endpoints/UI after adding the peer association.
- [x] Record setup delivery-claim context and bind verified email/Discord on successful single-use claim without exposing raw destinations in tokens, responses, or audit metadata.
- Keep raw delivery subjects private except for explicit Admin-only connected-channel display.

Validation: migrations preserve released users and credentials and are restart-idempotent; peer association never changes actor attribution. Connected-account precedence and suspension fallback blocking remain part of decision 14.

## Security notes

- Hash bearer/session/refresh/setup tokens before storage.
- Prefer identity-key hashes over raw account ids for lookup.
- Store OAuth provider tokens only if a future flow truly needs them; encrypt or isolate them if added.
- Role downgrades, suspension, and identity detach should revoke affected sessions and refresh tokens.
- Never auto-link identities by display name or email similarity. A targeted setup link claimed through its delivery channel is explicit proof of control and may bind that channel.
- Reject changes that leave zero active Admins or deactivate the professional Anchor.
- Back up auth state through the private libSQL sync/snapshot destination defined by decision 14; WAL is not a substitute for point-in-time backup.

## Resolved decisions

1. **DB stack**: libSQL + Drizzle, following `shell/entity-service` and `shell/job-queue`. No `bun:sqlite`, no second stack.
2. **User emails**: not stored on `auth_users`. Deliverable addresses live on person-owned `person_identity_claims.delivery_subject` for verified email (and other delivery-capable) identities. Configured setup emails keep the existing recipient-hash pattern; CMS commits keep the existing `directory-sync` author config.
3. **`canonical_id`**: generated `user:<id-suffix>` on user creation. Administratively renameable later when a People management surface lands; field is a nullable string so rename is a column update with no migration.
4. **OAuth clients**: migrate in the same phase as grants (Phase 3). Avoids a JSON/SQL hybrid with weak referential integrity.
5. **Backup/restore**: configure a private libSQL sync/backup destination or encrypted snapshots for point-in-time recovery. Never place auth state in git or `brain-data`; config is only bootstrap/recovery input.

## Related plans

- [Multi-user and permissions](./multi-user.md)
- [Operator runtime database](./operator-runtime-db.md)
