# Plan: Multi-User & Permissions

## Status

Core multi-user access is complete. The current implementation includes the standalone `@brains/admin` console at `/admin`, role-aware dashboard access, compatibility-safe auth-session terminology migration, real users, per-principal MCP permissions, canonical conversation/tool/job attribution, and a non-model-visible Admin API with config-derived, CMS-profiled Anchor ownership. Decisions 14 and 15 define the post-merge corrections: DB-only runtime access with explicit recovery, a four-section Admin information architecture, connected delivery channels, and external peer brains without person-representation semantics. Storage details are consolidated in [Auth runtime database](./auth-runtime-db.md).

## Goal

Add a real user model so a brain can support multiple people across OAuth/passkeys, MCP, Discord, A2A, and future interfaces without breaking the current single-Admin/self-hosted path.

The first version should stay small: coarse permission levels, explicit Admin-managed users, no SaaS account system, and no route-wide dashboard/CMS lock-down. Shared-space trust for Relay/team spaces and central entity action policy enforcement have both landed.

## Source of truth

This plan owns product/runtime behavior: roles, permission resolution, MCP per-session authorization, Admin management and Anchor display UX, onboarding flow, and attribution. It treats the auth database as an implementation dependency rather than redefining its schema. Auth tables, migrations, and storage APIs live in [Auth runtime database](./auth-runtime-db.md); runtime storage-root/deploy persistence policy lives in [Operator runtime database](./operator-runtime-db.md). How this human-subject track relates to brain-subject identity (A2A signing, ATProto DIDs) is positioned in [Identity & trust architecture](./identity-and-trust.md); the `a2a`/`did` identity types below are the reserved hook for that doc's cross-subject linking follow-on.

## Current baseline

- Permission levels are `public`, `trusted`, and `admin`; Anchor identity is exposed independently through `isAnchor`. Active connected users are authoritative before standalone channel grants. Request-time config fallback remains only until decision 14's DB principal-grant migration lands.
- Passkeys, sessions, OAuth grants, signing keys, identity bindings, peer trust, and audit events live in private `auth.db` runtime storage outside `brain-data`.
- Fresh setup and migrated installations use durable `usr_<uuid>` subjects; legacy files remain immutable migration backups.
- HTTP MCP binds each authenticated session to the current user's permission level and rejects cross-user reuse or stale roles.
- Discord, OAuth-authenticated MCP, and authenticated web chat propagate canonical runtime principals into conversations.
- Message attribution uses a discriminated `ActorRef`: resolved users carry `userId`, unresolved external actors carry an opaque source-scoped hash, and agents/services carry explicit IDs. New writes use only this structure; legacy flattened actor metadata is normalized on read.
- Agent-invoked and confirmed tools, tool lifecycle events, and tool-enqueued jobs retain authenticated requester attribution.
- A same-origin Admin-session API manages users, identities, roles, status, passkeys, and user grants with explicit action confirmation; Anchor ownership is read-only runtime projection from configuration, and administration remains intentionally absent from model tools.
- The standalone admin console is implemented by `@brains/admin` at `/admin`. Its agreed end state is Overview, Members/People, Invitations, and Audit; the shipped self-service representation view is superseded by decision 15 and will be removed when external peer links replace representation records.
- `@rizom/ops` fleet/user deployment tooling remains separate from this runtime auth-user model.

## Core decisions

1. **Auth users are runtime auth state, not content.**
   - User auth records, roles, identity bindings, and passkey bindings live under runtime auth storage.
   - They are not synced/exported with `brain-data`.
   - An optional external-peer profile may be associated later, but it is never auth truth and no local member profile is synthesized.
2. **Keep coarse permission levels for v1.**
   - `admin` = highest human authority for administration and restricted workflows.
   - `trusted` = trusted-user authority for safe collaborative write workflows.
   - `public` = unauthenticated or minimal access.
   - Full RBAC is explicitly out of scope for the first multi-user slice.
3. **Connected-user lookup precedes standalone principal grants.**
   - If an interface caller maps to an auth user, use that user's current role/status.
   - If no account is connected, use the standalone channel grant stored in `auth.db`.
   - `admins`, `anchors`, and `trusted` have clean, independent seed semantics; decision 14 removes request-time config fallback.
4. **Real user ids replace `single-operator` as the canonical subject.**
   - Fresh setups use `usr_<uuid>` as the passkey/session/OAuth subject.
   - Existing `single-operator` installs migrate lazily to a real user id.
   - `single-operator` remains only a compatibility/migration alias, not new canonical state.
5. **First passkey setup creates the first admin, who is the anchor on a personal brain.**
   - First setup creates one active **`admin`** user, binds the passkey to that user, and configures that person's subject as the personal Anchor.
   - On a **personal** brain that first admin is also the **anchor/owner** (admin _is_ anchor). On a **collective** brain the anchor is the team/org; the first admin runs it but is not the anchor.
   - The data model supports multiple active admins from the start.
6. **Multiple Admins are allowed, but the last active Admin is protected.**
   - Admins can promote other users to `admin`.
   - The system atomically rejects demoting, suspending, or deleting the last active Admin. A personal Anchor must also remain an active Admin.
   - ~~User-facing copy must use **Anchor**, never Owner or Operator, for this role.~~ **Superseded by decision 12:** the permission role is **Admin**; **Anchor** now names the brain's owner/subject, not the role.
7. **Per-request/session permissions must replace global HTTP MCP Admin authority.**
   - OAuth-authenticated MCP should use the token subject's user role.
   - Static `MCP_AUTH_TOKEN` can continue to grant Admin permission as a deprecated fallback, but never establishes Anchor identity.
8. **Do not reshuffle existing tool visibility in the plumbing phase.**
   - Multi-user v1 makes roles enforceable.
   - A later tool-permission audit decides which existing Admin tools can safely become trusted.
9. **Admin-managed onboarding first; invitations later.**
   - Admins create users and explicitly attach identities.
   - Email/self-signup/invite delivery is deferred until real workflows need it.
10. **Auth-user administration is not agent-visible.**
    - User, identity, role, status, and user-specific credential management stay outside the model tool surface.
    - Use a dedicated authenticated admin surface or local CLI with explicit Admin confirmation.
    - This reduces prompt-injection and accidental privilege-management risk even for Admin sessions.
11. **Administration is its own console surface — an admin console, not a dashboard tab.**
    - User administration is a _mutating management_ surface, structurally like CMS (`/cms`), not a read-mostly monitoring widget. It belongs beside the dashboard, chat, and CMS as a peer console surface, wearing `@brains/console-theme` and reachable by the cross-surface ⌘K jump — not special-cased into the dashboard SSR page.
    - **Scope it as an admin console at `/admin`, not a single-purpose `/people` surface.** The final primary sections are Overview, Members/People, Invitations, and Audit (decision 15).
    - **`auth` stays `auth`; `admin` is the surface, not the service.** `shell/auth-service` remains a tightly-scoped, security-critical auth domain — it does **not** become an "admin-service." The admin console federates over service admin APIs: `/auth/admin/*` for user/identity/role management today, other services' admin APIs later (operator runtime, ops).
    - It is a React SPA like CMS and chat, not the dashboard's SSR + progressive-enhancement vanilla JS. The surface is app-shaped: dialog-driven mutations, explicit confirmations, live refresh, invitations, and audit inspection.
    - `shell/auth-service` remains the sole owner of the admin HTTP endpoints, schema, permission policy, last-Admin invariant, and audit. The surface is a thin same-origin client over `/auth/admin/*` and **imports auth-service's exported role/mutation contract types** rather than re-declaring the role list or mutation-action names.
    - The dashboard stays pure monitoring: no People tab, no inline admin script, no hand-rolled Admin-visibility branch.
    - **Console integration lives here now.** Console unification shipped and its plan retired, so the surface remains a registered web route, appears in the shared route-derived console strip and Admin-gated ⌘K jump, and uses the shared `instrument` climate.
    - **Current state:** the standalone `@brains/admin` React package and configurable `/admin` route are implemented. The four-section target and removal of the shipped representation UI remain follow-on work under decision 15.
12. **`Anchor` is the owner (an identity), `Admin` is the permission role.** _(Adopted 2026-07-18 and implemented; supersedes the "Anchor is the role" naming in decision 6.)_
    - **Anchor = the brain's owner/subject — professional, team, or collective.** It is an _identity/profile_ concept, not an authenticator: a team or collective never logs in, so "anchor" names what the brain belongs to and speaks as, not a login.
    - **Admin = the human permission role** that administers the brain. The permission levels are **`admin` / `trusted` / `public`**; the former Anchor role has been removed. Admins work in the `/admin` console (decision 11), so role and surface line up.
    - **`admin`, not `operator`.** `operator` is already the _infrastructure_ operator (`operator-runtime-db.md`, `@rizom/ops`) and `single-operator` is the retired legacy subject decision 4 is migrating away from; reusing `operator` for a role recollides both. `admin` matches the console.
    - **The owner subject is not itself an authenticator.** Humans authenticate and hold roles. On a professional brain, the one human Anchor also has an auth account; team and collective Anchors are profile subjects that never sign in.
    - **Anchor kinds on one axis: `professional | team | collective`. No nesting.** _(Vocabulary unified 2026-07-19 to match the shipped `anchor-profile` schema; supersedes the earlier `person | team | organization` config naming.)_ Ownership behavior is **binary**: `professional` is personal; `team` and `collective` are impersonal. Team and collective differ only in profile flavor and console vocabulary, not mechanics. A brain has exactly one Anchor and Anchors never nest.
    - **Ownership rule.** A professional Anchor is the **sole Anchor and an active Admin**, but additional Admins are allowed. Team and collective Anchors are run by any active Admin; no individual is the Anchor, and the last-active-Admin invariant is the protection.
    - **`isAnchor` is identity, not permission.** Because ownership grants nothing an Admin lacks, interfaces authorize on the `admin` role only and never gate on ownership. The resolved principal carries independent `permissionLevel` and `isAnchor` facets. Chat and other interfaces read `isAnchor` only for identity/voice ("this is your brain"), never for access.
    - **Migration is bounded and clean.** Generated Drizzle migration `0002_superb_firebrand.sql` converts historical persisted role rows once and backfills the personal Anchor. Runtime roles and configuration accept only `admin | trusted | public`; no deprecated `anchor` role/config alias remains.
13. **Anchor kind is configuration; profile is CMS content; the console is read-only over both.** _(Adopted 2026-07-19; corrects the shipped in-console anchor editor from decision 12.)_
    - **The anchor kind is declared in `brain.yaml`, not chosen in the console.** Config carries `anchor: professional | team | collective`. Ownership is personal for `professional`, impersonal for `team`/`collective` (see decision 12). `team` and `collective` differ only in **profile flavor and console vocabulary** — Members vs People, "run together" vs "administered on its behalf," a title/department column. This honors the felt difference in _language_ while refusing it in _structure_: the moment the label affected who-can-do-what or how brains relate, it would stop being a skin and become the RBAC/nesting line decision 12 already drew.
    - **The Anchor profile is CMS content, not edited in the console.** Name, tagline, bio, mission, and brand live in `/cms`; `/admin` renders a read-only reference and an **Edit in CMS →** deep-link.
    - **Member profiles are external, not provisioned locally.** A member with a linked external brain may expose that brain's profile read-only. A member without a brain has no profile for now; `/admin` shows only the local auth display name and access information. It does not create a CMS profile for them.
    - **Name authority.** The Anchor's CMS profile name and an external brain's published profile name are authoritative where present. The auth `displayName` is the fallback for a member without a profile.
    - **The console never mutates ownership.** It renders whichever kind config declares and whatever profile the CMS holds. The runtime still reads the config kind at startup and projects it into the `auth_brain_anchor` singleton so `isAnchor` resolution and audit are unchanged — but the **source of truth for the kind is `brain.yaml`**, and changing it is a config edit + redeploy, not a console action. This is consistent with decision 3: identity/ownership that a caller cannot self-serve is declared in config, not managed at runtime.
    - **Supersedes the shipped in-console anchor write path.** The `updateBrainAnchor` mutation, the `person/collective` toggle in `AnchorPanel`, the `GET/POST /auth/admin/anchor` write handler, and the `updateBrainAnchor` entry in `AUTH_ADMIN_MUTATION_ACTIONS` are removed. Reading the resolved anchor for display is retained; writing it from the console is not.
    - **Design of record:** [professional](../design/admin-console-person-mockup.html), [team](../design/admin-console-team-mockup.html), and [collective](../design/admin-console-org-mockup.html) mockups. Each uses the same four-section Admin shell and renders its config-declared Anchor kind read-only.
14. **Access is DB runtime state with a single read path; `brain.yaml` allowlists are bootstrap and recovery input, never a request-time fallback.** _(Direction adopted 2026-07-19; clarified 2026-07-21. Post-merge follow-on.)_
    - **The DB is the runtime source of truth.** Runtime permission lookup reads DB rows only. Interface principals such as `discord:123` remain usable without a browser session, but their grants are stored in `auth.db` by normalized hashed key; raw delivery subjects are retained only where a protocol needs them.
    - **Permission and Anchor identity are separate rows/facets.** `admins` and `trusted` seed permission grants. `anchors` seeds only `isAnchor`; it never grants Admin access. A professional Anchor must also receive an explicit Admin grant, but authorization comes from that grant.
    - **Connected accounts are authoritative.** Before a channel identity is connected, its standalone DB grant applies. Once connected to an auth account, the account's current role and status win; a suspended account is denied on every connected channel even if an old bootstrap entry named that channel as Admin.
    - **Every explicit config entry seeds on first initialization.** Web and headless brains both apply declared `admins`/`trusted`/`anchors` seed-if-absent. A web brain with no declarations seeds nothing and uses passkey setup. Ordinary restarts never overwrite later DB or `/admin` changes.
    - **Recovery is explicit.** A local `brain auth reinitialize-access --yes` command reapplies the current config deliberately, preserves users, identities, passkeys, external-peer links, and audit history, and revokes active sessions. Reinitialization never happens as a side effect of startup or deploy. The existing `reset-passkeys` command remains separate.
    - **Durability is a libSQL backup destination, not git.** `auth.db` gets a private sync/backup target (embedded replica → remote primary, or scheduled encrypted snapshots). Point-in-time recovery comes from that durable store; config remains a bootstrap/recovery template, not live GitOps authorization.
    - **Sequencing keeps a bridge.** Build DB principal grants, account precedence, console CRUD, seed loading, and explicit recovery before removing request-time config reads. Keep the current request-time allowlist until the DB path is complete so non-login channels never lose access mid-migration.
15. **The Admin console manages people and peer brains; it does not model agents as representatives of people.** _(Adopted 2026-07-21; supersedes the Phase 6 representation direction.)_
    - **Four permanent sections:** Overview, Members/People, Invitations, and Audit. Overview owns the read-only Anchor summary, administrator posture, and attention items. The roster never repeats the Anchor panel.
    - **Members are local accounts.** Role, status, passkeys, connected channels, session revocation, and suspension are ordinary person-detail actions. Internal IDs, evidence provenance, raw provider subjects, and per-session metadata stay out of the UI; there is no generic Advanced drawer.
    - **Sign-in and channels are distinct.** Passkeys appear under Sign-in. Verified email and Discord appear under Connected channels, with full human-facing addresses visible to Admins. Claiming a setup link delivered through a channel binds that verified channel to the new account.
    - **External brains are optional peer links.** Local membership and a linked external brain are independent facts and both appear in the person detail. The peer remains a separate actor and never inherits the person's role, identity claims, or attribution.
    - **No representation consent model.** Remove the permanent My agents view and the pending/active agent-person representation workflow. Preserve existing durable rows during migration: active links become person-to-external-peer associations; pending/revoked records remain migration/audit history and do not grant access.
    - **Invitation roles are deliberate.** Add person offers Trusted or Admin only. `invited` remains a status, not a role; the intended role is retained and shown on the invitation. A member without a brain receives a local account and setup delivery but no profile.
    - **Peer-first add is an Admin escalation.** Selecting a known peer or entering a peer URL resolves its published profile and proposed email. The final confirmation names the person, exact destination, role, and setup delivery. A no-brain fallback asks for local display name and email and creates no profile.
    - **Audit is first-class.** Existing audit storage remains authoritative; add an Admin-only read endpoint and plain-language viewer under the permanent Audit tab.

## Terminology contract

- **Admin**, **Trusted**, and **Public** are the only human permission-role names in code contracts and user-facing copy. **Anchor** is reserved for the brain's owner/subject (`professional | team | collective`) — an identity concept, not a role.
- **Operator is not a role.** Existing names such as `operator_sessions`, `OperatorSessionStore`, `getOperatorSession`, `brains_operator_session`, and “Operator access” are legacy single-user terminology and must be migrated to authenticated/browser-session naming.
- Rename the persisted session table to `auth_sessions` in an ordered auth DB migration. Preserve existing sessions during the rename.
- Use `AuthSession`/`BrowserSession` service names; the private workspace API keeps no deprecated session wrappers.
- Move the cookie to `brains_auth_session`; accept the legacy cookie during a bounded compatibility window and clear both names on logout.
- Remove the legacy cookie reader only after CI confirms there are no deprecated source consumers and the recorded minimum supported upgrade version already issues `brains_auth_session`.
- Rename first-setup types and copy from “operator setup” to generic “passkey setup.”
- `single-operator` remains only as a historical migration subject and must not appear in newly created state or user-facing copy.
- The separate “Operator runtime database” plan may retain its infrastructure meaning; it does not define a human auth role.

## Runtime user record

The canonical schema lives in [Auth runtime database](./auth-runtime-db.md). This section is a behavior-oriented summary of the user shape that multi-user features consume. Store records in the runtime auth database, not in git-backed content:

```ts
interface AuthUserRecord {
  id: string; // stable user id, e.g. usr_<uuid>
  displayName: string;
  role: "admin" | "trusted" | "public";
  status: "active" | "invited" | "suspended";
  identities: AuthUserIdentity[];
  createdAt: number;
  updatedAt: number;
}

interface AuthUserIdentity {
  type: "oauth" | "passkey" | "discord" | "mcp" | "a2a" | "email" | "did";
  issuer?: string;
  subject: string;
  label?: string;
  verifiedAt?: number;
}
```

Identity keys should normalize to strings for lookup, for example:

- `oauth:<issuer>:<subject>`
- `passkey:<credential-id>`
- `discord:<snowflake>`
- `email:<lowercase-email>`
- `did:<did>`

Passkey credential public keys are managed by the auth-service credential store; user records/identity rows bind credentials to user ids without exposing them as content.

## Architecture

### New auth-user service

Add `shell/auth-service` user-store support rather than a separate content entity plugin for v1:

- `AuthUserStore`
  - uses the auth runtime DB user/identity tables
  - creates first admin user
  - lists users
  - finds user by id
  - finds user by normalized identity key
  - attaches/detaches identities
  - updates role/status
  - rejects changes that would leave zero active Admins or deactivate the professional Anchor
- `AuthService`
  - creates/reuses first admin user during setup
  - passkey registration stores credential with `subject = user.id`
  - passkey login creates an authenticated browser session with `subject = user.id`
  - OAuth access-token `sub` becomes user id
  - exposes `resolveUserForRequest()` / `resolveBearerUser()` helpers

### Permission resolution

Do not make the existing pure `PermissionService` entity-aware. Add a resolver layer at shell/interface boundaries:

1. Normalize the authenticated subject or interface identity (`usr_<uuid>`, `mcp:<subject>`, `discord:<id>`, etc.).
2. Resolve any connected auth account first.
3. If the connected account is missing, inactive, or suspended, deny; never fall through to a standalone channel grant.
4. If the connected account is active, use its current role.
5. If the channel identity is not connected, resolve its standalone DB principal grant.
6. Resolve `isAnchor` independently; it never changes the permission level.

During migration only, the old request-time `brain.yaml` path remains as a bridge. The final resolver never reads config per request.

### MCP HTTP sessions

Current HTTP MCP sets the whole transport to `anchor` when auth is configured. Multi-user needs per-authenticated-session permission:

- `verifyBearerToken` should return `{ subject, scope, userId, permissionLevel }`.
- `StreamableHTTPServer.authenticate()` should retain verified identity for the request/session.
- When creating a new MCP session, call `mcpTransport.createMcpServer(permissionLevel)` for that session.
- Existing session id should continue with the permission level established at initialize time.
- Static `MCP_AUTH_TOKEN` fallback remains admin-only and deprecated.

### Dashboard visibility

- Widget visibility already uses the same levels as tools (`public` / `trusted` / `admin`) — verified 2026-07-07; no `operator` alias exists in the schema or is needed.
- Dashboard login/logout use authenticated browser sessions carrying a real user id and role; no session is elevated merely because it exists.
- Signed-in masthead must display the user's name and canonical role label, e.g. `Alex · Admin · Sign out`.
- Use role labels consistently in UI: `admin` → **Admin**, `trusted` → **Trusted**, `public` → **Public**. Show Anchor as a separate yes/no ownership facet.
- Remove user-facing “Operator access” and “Operator” session labels.

### Conversations, jobs, and audit attribution

Add user attribution without polluting content frontmatter as the first step:

- Conversation metadata:
  - `userId`
  - `displayName`
  - `permissionLevel`
  - `interfaceIdentity`
- Message metadata for user messages:
  - same user fields where available
- Job metadata:
  - `requestedByUserId`
  - `requestedByInterface`
- Tool context:
  - extend `ToolContext` with optional `actor?: { userId; displayName; permissionLevel }`

Entity mutation audit can be follow-on:

- either append runtime audit events
- or add `createdBy` / `updatedBy` metadata only for entity types that opt in

Avoid writing auth-sensitive identity bindings into content markdown.

## Management surface

### Non-agent administration

Do not register user or user-specific credential administration as model-visible tools. The runtime exposes `GET /auth/admin/users` and `POST /auth/admin/mutations` to active Admin sessions. Mutations require same-origin JSON plus an action-matching `confirmation` value, preserve last-Admin invariants, revoke affected grants, and append actor-attributed audit events. Responses redact identity lookup hashes, raw identity subjects, and passkey public keys. The existing first-passkey bootstrap URL retrieval is a separate setup mechanism, not a general user-management surface.

Supported mutation actions are `createUser`, `updateUserRole`, `updateUserStatus`, `attachIdentity`, `detachIdentity`, `startPasskeyRegistration`, `revokePasskey`, and `revokeUserSessions`.

### Admin console

The administration UX is its own console surface (see decisions 11 and 15), a peer to `/cms` and `/chat`: a React SPA at `/admin` wearing `@brains/console-theme` and consuming same-origin `/auth/admin/*` APIs. Its permanent sections are **Overview**, **Members/People**, **Invitations**, and **Audit**. It has no representation-consent view and is not a dashboard tab.

#### Admin package naming

The console's plugin id (`admin`), route (`/admin`), console/⌘K label ("Admin"), package (`@brains/admin`), and directory (`plugins/admin`) consistently describe the **admin** surface. `people`/`person` remains reserved for the genuine domain concept: the People section, `PersonDetail`, person storage, and the roster.

- [x] **Use console-level Admin names throughout** — export `adminPlugin`/`AdminPlugin` from `@brains/admin`, serve the console through `admin-routes.ts` and `admin-shell.ts`, bundle `admin-app.js`, and consume the renamed package and asset from Relay, Rover, and `@rizom/brain`.

Keep the target UX small and explicit:

- Fresh setup asks for a display name; any temporary fallback must not use `Operator` as a role-like name.
- The shared console masthead shows `Name · Role · sign out`.
- Overview shows the Anchor, active administrators, and attention-required items.
- Members/People shows active local accounts, roles, passkeys, connected email/Discord channels, optional external peer brains, revoke-all-sessions, and suspend/remove actions.
- Invitations owns invited accounts and their intended Trusted/Admin roles; invited rows do not masquerade as active members.
- Audit renders existing actor-attributed security events in plain language.
- **The Anchor is read-only here (decision 13).** The console renders the config-declared kind and CMS-held Anchor profile; it does not set the kind or edit ownership.
- Manual raw identity attachment, internal IDs, evidence provenance, raw subjects, and individual session metadata have no ordinary Admin UI. Keep support APIs private until a concrete product workflow requires them.
- Do not build public signup or route-wide CMS/dashboard lock-down.

### CLI

Add wrappers where useful:

```bash
brain user:list
brain user:create --display-name "Jane" --role trusted
brain user:update-role usr_... --role admin
brain user:suspend usr_...
brain user:attach-identity usr_... --type discord --subject 123456789
```

Keep `brain auth reset-passkeys --yes` as the break-glass reset for passkeys and active OAuth state. Add `brain auth reinitialize-access --yes` as a separate access-only recovery command: reapply config grants/facets, preserve users, identities, passkeys, peer links, and audit, and revoke active sessions.

### Admin-managed onboarding

For v1, onboarding is explicit and Admin managed:

1. An Admin creates a user through the Admin API.
2. An Admin selects the delivery channel and intended role.
3. For passkeys, the Admin requests a short-lived registration URL for that specific user.
4. The user opens the URL and registers a passkey; the credential binds to that user id.

There is no public registration, email invitation, or self-signup in the first slice.

### Adding a person (end state)

Add-a-person is **peer-first**, with a no-brain fallback (see the [professional mockup](../design/admin-console-person-mockup.html) dialog):

1. **Choose a known peer brain** — select a discovered external brain whose professional Anchor profile identifies the proposed person and contact email.
2. **Add a new peer** — paste a brain URL, verify its DID/domain and published Anchor profile, and review the resolved person and delivery address.
3. **No-brain fallback** — enter a local display name and email. Create the invited account without a profile.
4. Select only **Trusted** or **Admin** and confirm the exact person, destination, role, and single-use setup delivery.

The external brain remains a separate peer actor; it does not represent the person or inherit the person's role. Claiming a setup link proves control of the delivery channel, binds that verified email or Discord identity to the account, registers the passkey, and activates the invited user. The local account and external peer link remain separate visible facets.

## Migration strategy

### Fresh installs

1. No passkeys and no users.
2. First `/setup` creates `usr_<uuid>` with role `admin` and configures that person's subject as the personal Anchor.
3. Passkey credential stores `subject = usr_<uuid>`.
4. Authenticated browser sessions and OAuth tokens use `sub = usr_<uuid>`.

### Existing installs with `single-operator`

On startup or first successful login:

1. Detect passkeys or sessions with `subject = "single-operator"`.
2. If no users exist, create first admin user.
3. Rebind passkey credentials from `single-operator` to that user id.
4. Future sessions/tokens use the real user id.
5. Revoke old `single-operator` refresh tokens during migration for safety and force affected OAuth clients through a clean one-time re-auth.

## Phased implementation

### Phase 1 — Real admin user and `single-operator` migration

**Status: implemented.**

This is the safest first slice: real users without trusted-user management yet.

- Add the auth runtime DB foundation / `AuthUserStore` from [Auth runtime database](./auth-runtime-db.md) and tests.
- Create the first active `admin` user during setup and bind the personal Anchor independently.
- Let setup collect an optional display name; use `Anchor` only as a temporary fallback.
- Bind new passkey credentials to `usr_<uuid>` instead of `single-operator`.
- Login sessions and OAuth tokens use user-id `sub`.
- Lazily migrate old `single-operator` passkey credentials/sessions to the first admin user.
- Revoke old `single-operator` refresh tokens during migration.

Validation:

- fresh setup creates user + passkey
- login session subject is user id
- OAuth token `sub` is user id
- old `single-operator` passkey store migrates
- static-token MCP fallback remains unchanged

### Phase 2 — Roles, active-user checks, and MCP per-session permissions

**Status: implemented.**

- Add role/status checks to auth sessions and bearer verification.
- Add identity lookup API on auth service.
- Resolve active user role before permission-rule fallback.
- Add suspended-user denial behavior.
- Make `verifyBearerToken` return `{ subject, scope, userId, permissionLevel }`.
- Carry verified bearer identity through HTTP MCP auth.
- Create per-session MCP servers with user-specific permission level.
- Keep static `MCP_AUTH_TOKEN` fallback as Admin-only and deprecated; it never establishes Anchor identity.

Validation:

- a known trusted user receives trusted tools only
- unknown callers still use `brain.yaml` rules where applicable
- suspended users are denied authentication/session use rather than downgraded to public
- trusted OAuth user cannot call admin-only tools
- Admin OAuth user can call Admin tools
- static token behavior remains backward compatible

### Phase 3 — Non-agent administration API

**Status: backend and admin console (People section, at `/admin`) implemented; CLI wrappers remain optional.**

- Add a same-origin, Admin-session API; do not register model-visible user-management tools.
- Require explicit action confirmation for every mutation.
- Keep local CLI wrappers optional and implement the required People console in phase 5.
- Add attach/detach identity flows.
- Add passkey registration for a specific user through an Admin-generated, short-lived setup URL.
- Support multiple active Admins and one independent person/collective Anchor.
- Reject role/status changes that would leave zero active Admins or deactivate a personal Anchor.

Validation:

- Admin can create a trusted user
- Admin can promote another active user to Admin
- system refuses to demote/suspend the last active Admin or personal Anchor
- trusted user cannot manage users
- identity attach enables login/permission mapping

### Phase 4 — Attribution

**Status: implemented.**

- Extend `ToolContext`, conversation metadata, message metadata, and job metadata with actor fields.
- Update interfaces to pass actor where known.
- Add read-side helpers for audit display.

Validation:

- MCP OAuth conversations/messages include user id
- Discord conversations map to user id when identity is linked
- jobs created by tools carry requested-by user metadata

### Phase 5 — Admin console and terminology migration

**Status: the standalone `/admin` console and bounded legacy-cookie compatibility are implemented; decision 15's four-section redesign remains follow-on work.**

- [x] Capture the revised console design per Anchor kind: [professional](../design/admin-console-person-mockup.html), [team](../design/admin-console-team-mockup.html), and [collective](../design/admin-console-org-mockup.html).
- [x] Add Admin-only roster administration over the existing auth APIs.
- [ ] Replace the shipped roster/My agents navigation with Overview, Members/People, Invitations, and Audit.
- [ ] Remove representation consent and expose external brains only as optional peer links.
- [x] Move People off the dashboard SSR page into the standalone `@brains/admin` React admin console (decision 11), importing auth-service's browser-safe contract types and constants instead of literal role/mutation vocabularies. Dashboard is pure monitoring again.
  - The console is a registered route-derived surface using the `instrument` climate.
  - `GET /api/console/jump` includes an admin surface door for authenticated Admins.
  - The surface consumes `@brains/console-theme`; the shared surface registry recognizes the new consumer.
- [x] Generalize the surface to `/admin` with a configurable `routePath`.
- [ ] Add the permanent Invitations and Audit sections, including an Admin-only audit read endpoint/viewer.
- [x] Support user listing/creation, role and status changes, identity attach/detach, passkey setup/revocation, and user-session revocation with explicit confirmations.
- [x] Resolve the dashboard session to its actual principal and permission level; remove the current any-session-to-Admin elevation.
- [x] Show `Name · Admin|Trusted|Public · Sign out`, with Anchor shown separately in the console masthead.
- [x] Rename legacy operator session/store/cookie/setup identifiers according to the terminology contract, with DB and cookie compatibility migration.
- [x] Update tests, docs, and shared auth UI copy so Operator and Owner are never presented as permission roles.
- [x] Enforce compatibility removal with `bun run auth-session:compat-check` and release metadata in `shell/auth-service/auth-session-compat.json`.

Validation:

- trusted and public sessions never receive Admin dashboard visibility
- only Admins can see or use People management
- existing browser sessions survive the table/code/cookie terminology migration
- dashboard and setup/login copy use Admin/Trusted/Public consistently and show Anchor independently

### Phase 6 — Person-centered identity and external peer links

**Status: person backfill and normalized person-owned identity claims are complete. The shipped agent-person representation layer is superseded by decision 15 and must be migrated to simpler external-peer associations before this phase is final.**

The stable subject model is:

```text
Auth user ─────► Person ─────► optional external peer brain
                   │
                   ├─ Discord channel
                   ├─ email channel
                   └─ passkeys
```

- An auth user is the access/account facet: role, status, passkeys, sessions, and grants.
- A person is the canonical local human subject and owns verified connected-channel claims.
- An external brain is a separate peer actor associated with a person for directory/profile display. It does not represent the person, inherit their permission, or rewrite attribution.
- A peer's published professional Anchor profile may supply a proposed name and email during Admin escalation. The Admin confirms the exact destination and role; setup-link claim verifies and binds the delivery channel.
- A member without an external brain has no profile for now. Their auth display name is the only person label.
- Conflicting verified claims require explicit reconciliation. Never merge by display name or similar email.

Migration and storage boundaries:

- Preserve all existing person, user, session, passkey, identity, claim, and link ids.
- Reinterpret active agent-person links as person-to-external-peer associations without granting access or `onBehalfOf` semantics.
- Preserve pending/revoked representation rows as migration/audit history; they never activate or grant access.
- Remove `/auth/representations`, My agents, representation consent, and represented-person claim projection after the peer-link read/write path is available.
- Keep raw connected-channel delivery subjects private to auth and authorized Admin responses; never expose them to models or public peer cards.

Validation:

- existing durable rows survive the representation-to-peer migration
- a peer remains a distinct actor before and after association
- linking a peer never grants the person's role or rewrites actor attribution
- setup-link claim binds the delivery email or Discord identity to the invited account
- hosted members without a peer have no synthesized profile
- raw provider subjects remain absent from model-visible content

### Phase 7 — Invitation delivery and audit viewer

**Status: planned by decision 15.** Build the permanent Invitations and Audit sections on the existing targeted setup and audit stores:

- email/Discord setup delivery with exact Admin confirmation
- bind the delivery channel when its single-use setup link is claimed
- retain intended Trusted/Admin role separately from invited status
- resend, expiry, cancel, and delivery-state UX
- Admin-only audit read endpoint and plain-language event viewer

## Security notes

- Auth-user records are runtime auth state and should use `0600` file permissions.
- Never store passkey private material; public credential keys stay in passkey store.
- Role changes and identity attach/detach require `admin`.
- Suspended users are denied auth/session use.
- Role downgrades, suspension, and identity detach revoke that user's sessions and refresh tokens immediately.
- Demoting, suspending, or deleting the last active Admin must be rejected; a personal Anchor must remain an active Admin.
- Identity binding must be explicit; do not auto-link two identities just because display names match. Claiming a user-targeted link delivered through a verified email or Discord channel is the explicit binding ceremony.

## Non-goals for first slice

- Fine-grained RBAC
- hosted SaaS account system
- changing existing tool visibility policy during role plumbing
- public registration
- invitation emails
- sharing auth state through `brain-data`
- rewriting CMS auth

## Done when

1. Fresh setup creates a durable auth user instead of `single-operator`.
2. Existing single-operator installs migrate safely.
3. Permission resolution uses connected auth users before standalone DB principal grants and never reads config at request time.
4. MCP OAuth sessions receive per-user permissions.
5. Admins can manage users through a dedicated authenticated admin surface, never through model-visible tools.
6. Multiple active Admins are supported, with atomic last-active-Admin protection.
7. Conversations/jobs can be attributed to users.
8. Auth state remains outside `brain-data`.
9. Dashboard permissions use the authenticated user's actual role; `/admin` provides separate Overview, Members/People, Invitations, and Audit sections; legacy Operator/Owner role terminology is removed with compatibility-safe session migration.
10. External brains remain distinct peer actors linked optionally to local people; no representation consent or inherited person permission remains.
11. Passkeys are shown as Sign-in, verified email/Discord as Connected channels, and setup-link claim binds the delivery channel.
12. Runtime permission reads use DB state only, while explicit config seeds and access-only reinitialization provide bootstrap and recovery.
