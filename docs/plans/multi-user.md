# Plan: Multi-User & Permissions

## Status

Core multi-user access is complete. A person-centered identity and agent-to-user promotion follow-on is approved in phase 6. The current implementation includes the standalone admin console (People is its first section; implemented by `@brains/admin` at `/admin` per decision 11), role-aware dashboard access, compatibility-safe auth-session terminology migration, real users, per-principal MCP permissions, canonical conversation/tool/job attribution, and a non-model-visible Admin API with independent Anchor ownership management. Invitation delivery remains optional. Storage details are consolidated in [Auth runtime database](./auth-runtime-db.md).

## Goal

Add a real user model so a brain can support multiple people across OAuth/passkeys, MCP, Discord, A2A, and future interfaces without breaking the current single-Admin/self-hosted path.

The first version should stay small: coarse permission levels, explicit Admin-managed users, no SaaS account system, and no route-wide dashboard/CMS lock-down. Shared-space trust for Relay/team spaces and central entity action policy enforcement have both landed.

## Source of truth

This plan owns product/runtime behavior: roles, permission resolution, MCP per-session authorization, Admin and Anchor management UX, onboarding flow, and attribution. It treats the auth database as an implementation dependency rather than redefining its schema. Auth tables, migrations, and storage APIs live in [Auth runtime database](./auth-runtime-db.md); runtime storage-root/deploy persistence policy lives in [Operator runtime database](./operator-runtime-db.md). How this human-subject track relates to brain-subject identity (A2A signing, ATProto DIDs) is positioned in [Identity & trust architecture](./identity-and-trust.md); the `a2a`/`did` identity types below are the reserved hook for that doc's cross-subject linking follow-on.

## Current baseline

- Permission levels are `public`, `trusted`, and `admin`; Anchor identity is exposed independently through `isAnchor`. Active auth users are authoritative before configured rule fallback.
- Passkeys, sessions, OAuth grants, signing keys, identity bindings, peer trust, and audit events live in private `auth.db` runtime storage outside `brain-data`.
- Fresh setup and migrated installations use durable `usr_<uuid>` subjects; legacy files remain immutable migration backups.
- HTTP MCP binds each authenticated session to the current user's permission level and rejects cross-user reuse or stale roles.
- Discord, OAuth-authenticated MCP, and authenticated web chat propagate canonical runtime principals into conversations.
- Message attribution uses a discriminated `ActorRef`: resolved users carry `userId`, unresolved external actors carry an opaque source-scoped hash, and agents/services carry explicit IDs. New writes use only this structure; legacy flattened actor metadata is normalized on read.
- Agent-invoked and confirmed tools, tool lifecycle events, and tool-enqueued jobs retain authenticated requester attribution.
- A same-origin Admin-session API manages users, Anchor ownership, identities, roles, status, passkeys, and user grants with explicit action confirmation; administration remains intentionally absent from model tools.
- The standalone admin console (React, implemented by `@brains/admin` at `/admin` with People as its first section) provides Admin-only roster administration and authenticated self-service representation consent. A local CLI remains optional.
- `@rizom/ops` fleet/user deployment tooling remains separate from this runtime auth-user model.

## Core decisions

1. **Auth users are runtime auth state, not content.**
   - User auth records, roles, identity bindings, and passkey bindings live under runtime auth storage.
   - They are not synced/exported with `brain-data`.
   - Optional public/person profile content can link to a user id later, but it is not the source of auth truth.
2. **Keep coarse permission levels for v1.**
   - `admin` = highest human authority for administration and restricted workflows.
   - `trusted` = trusted-user authority for safe collaborative write workflows.
   - `public` = unauthenticated or minimal access.
   - Full RBAC is explicitly out of scope for the first multi-user slice.
3. **User lookup precedes rule fallback.**
   - If an interface caller maps to an auth user, use that user role.
   - If no user matches, fall back to existing `brain.yaml` permission rules.
   - `admins`, `anchors`, and `trusted` have clean, independent configured semantics; no deprecated Anchor-role alias remains.
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
11. **Administration is its own console surface — an admin console, not a dashboard tab. People is its first section.**
    - User administration is a _mutating management_ surface, structurally like CMS (`/cms`), not a read-mostly monitoring widget. It belongs beside the dashboard, chat, and CMS as a peer console surface, wearing `@brains/console-theme` and reachable by the cross-surface ⌘K jump — not special-cased into the dashboard SSR page.
    - **Scope it as an admin console at `/admin`, with People as its first section — not a single-purpose `/people` surface.** The surface is administration, and this plan's own roadmap already names its next sections (invitations, an audit-log viewer). Naming the console generously now means those land as sections, not as a second rename. People renders as the roster/promotion section of that console.
    - **`auth` stays `auth`; `admin` is the surface, not the service.** `shell/auth-service` remains a tightly-scoped, security-critical auth domain — it does **not** become an "admin-service." The admin console federates over service admin APIs: `/auth/admin/*` for user/identity/role management today, other services' admin APIs later (operator runtime, ops). Renaming auth → admin would invite the durable operator/ops concerns that `operator-runtime-db.md` and `@rizom/ops` deliberately keep separate to accrete into a security-critical service; keep that boundary.
    - It is a React SPA like CMS and chat, not the dashboard's SSR + progressive-enhancement vanilla JS. The surface is app-shaped (dialog-driven mutation flows, confirmations, live refresh, the promotion/claim-link flow), so it sits on the React side of the repo's Preact-SSR / React-SPA split.
    - `shell/auth-service` remains the sole owner of the admin HTTP endpoints, schema, permission policy, last-Admin invariant, and audit. The surface is a thin same-origin client over `/auth/admin/*` and **imports auth-service's exported role/mutation contract types** rather than re-declaring the role list or mutation-action names — so the vocabulary cannot drift.
    - The dashboard stays pure monitoring: no People tab, no inline admin script, no hand-rolled Admin-visibility branch.
    - **Console integration lives here now.** Console unification shipped and its plan retired, so the surface-registration work it defined is owned by this decision: register the admin console as a web route so the shared console strip renders its nav link (route-derived nav via `getWebRoutes()`), extend the `GET /api/console/jump` contract with an admin surface door so ⌘K reaches it, and default the surface to the `instrument` climate like the other operator surfaces. The strip, palette, and climate CSS come from `@brains/console-theme` unchanged; its route-derived surface registry adds the Admin consumer.
    - **Current state:** implemented as the standalone `@brains/admin` package (React SPA, runtime plugin id `admin`, own plugin identity outside the dashboard's Preact SSR package) with a configurable `routePath` defaulting to `/admin`. People is the first section in the console shell; future invitations and audit sections can join it without another route rename.
12. **`Anchor` is the owner (an identity), `Admin` is the permission role.** _(Adopted 2026-07-18 and implemented; supersedes the "Anchor is the role" naming in decision 6.)_
    - **Anchor = the brain's owner/subject — a person, team, or organization.** It is an _identity/profile_ concept, not an authenticator: an org never logs in, so "anchor" names _what the brain is anchored to / represents_, not a login. This is already the meaning in the identity code (`agent.ts:83` `anchorDid` = "ATProto anchor DID"; the `anchor-profile` entity = the owner's profile), so this reframe **realigns** those names rather than renaming them — `anchor-profile`/`anchorDid` are now correctly named and stay.
    - **Admin = the human permission role** that administers the brain. The permission levels are **`admin` / `trusted` / `public`**; the former Anchor role has been removed. Admins work in the `/admin` console (decision 11), so role and surface line up.
    - **`admin`, not `operator`.** `operator` is already the _infrastructure_ operator (`operator-runtime-db.md`, `@rizom/ops`) and `single-operator` is the retired legacy subject decision 4 is migrating away from; reusing `operator` for a role recollides both. `admin` matches the console.
    - **The owner subject is not an auth principal.** Humans (users/persons) authenticate and hold roles; the person/team/org that a brain is anchored to is a profile subject that never signs in. See the companion profile-on-subjects model (profile is first-class, subject = person/team/org; members have profiles; a member's own brain is optional and never provisioned) — to be captured as its own design doc.
    - **Two anchor kinds: `person` or `collective`. No nesting.** Team and organization are the _same_ kind — a collective anchor — differing only in profile flavor, not in mechanics; "team" is a label/profile-shape choice, not a separate model. A brain has exactly **one** anchor, so a collective anchor is never nested (no team-within-org): a brain is anchored to a person or to a collective, full stop.
    - **Ownership rule.** A **person** anchor is owned by that one human, who is also its admin — so on a personal brain "admin _is_ anchor" (1:1). A **collective** anchor is owned by the collective and run by **any** admin — ownership is impersonal, there is no designated owner-admin, and the last-active-admin invariant (decision 6) is the only protection. On a collective brain no single user is the anchor; admins act on the collective's behalf.
    - **`isAnchor` is identity, not permission.** Because ownership grants nothing an admin lacks (personal: owner == admin; collective: impersonal), interfaces **authorize on the `admin` role only** and never gate on ownership. The resolved principal carries two independent facets: `permissionLevel: admin | trusted | public` (authorization) and `isAnchor` (identity — true for the person on a personal brain, false for everyone on a collective brain). Chat and other interfaces read `isAnchor` **only** for representation/voice ("this is your brain"), never for access. Migrating existing `anchor` checks is triage: authorization checks → `admin`; any "is this the owner" check → the `isAnchor` facet.
    - **Migration is bounded and clean.** Generated Drizzle migration `0002_superb_firebrand.sql` converts historical persisted role rows once and backfills the personal Anchor. Runtime roles and configuration accept only `admin | trusted | public`; no deprecated `anchor` role/config alias remains.
13. **Anchor kind is configuration; profile is CMS content; the console is read-only over both.** _(Adopted 2026-07-19; corrects the shipped in-console anchor editor from decision 12.)_
    - **The anchor kind is declared in `brain.yaml`, not chosen in the console.** Config carries `anchor: person | team | organization`. These three config labels resolve to the **two** mechanical kinds of decision 12: `person` → person, `team`/`organization` → collective. `team` and `organization` are identical in mechanics (impersonal ownership, run by any admin, last-admin invariant) and differ only in **profile flavor and console vocabulary** — Members vs People, "run together" vs "administered on its behalf," a title/department column for orgs. This honors the felt difference between a team and an org in _language_ while refusing it in _structure_: the moment the label affected who-can-do-what or how brains relate, it would stop being a skin and become the RBAC/nesting line decision 12 already drew.
    - **The profile is CMS content, not edited in the console.** The public profile — name, tagline, bio, mission, brand, and every member's bio/title — is entity content edited in `/cms`. `profileEntityId` is the seam: `/admin` holds the pointer and renders a **read-only reference with an "Edit in CMS →" deep-link**; `/cms` owns the editor. The admin console holds auth only (who exists, their role, their sign-in methods).
    - **Name authority.** The CMS profile name is authoritative for anything public; the auth `displayName` is an internal label/fallback. `/admin` resolves the displayed name from the profile via `profileEntityId` so a CMS rename cannot drift from what the console shows.
    - **The console never mutates ownership.** It renders whichever kind config declares and whatever profile the CMS holds. The runtime still reads the config kind at startup and projects it into the `auth_brain_anchor` singleton so `isAnchor` resolution and audit are unchanged — but the **source of truth for the kind is `brain.yaml`**, and changing it is a config edit + redeploy, not a console action. This is consistent with decision 3: identity/ownership that a caller cannot self-serve is declared in config, not managed at runtime.
    - **Supersedes the shipped in-console anchor write path.** The `updateBrainAnchor` mutation, the `person/collective` toggle in `AnchorPanel`, the `GET/POST /auth/admin/anchor` write handler, and the `updateBrainAnchor` entry in `AUTH_ADMIN_MUTATION_ACTIONS` are removed. Reading the resolved anchor for display is retained; writing it from the console is not.
    - **Design of record:** [person / solo](../design/admin-console-person-mockup.html), [team](../design/admin-console-team-mockup.html), and [organization](../design/admin-console-org-mockup.html) mockups. Each is the same thin auth console rendering a different config-declared kind, with the kind shown read-only (`⚙ kind: … · brain.yaml`) and every profile a CMS deep-link.

## Terminology contract

- **Admin**, **Trusted**, and **Public** are the only human permission-role names in code contracts and user-facing copy. **Anchor** is reserved for the brain's owner/subject (person, team, or organization) — an identity concept, not a role.
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
  - rejects changes that would leave zero active anchors
- `AuthService`
  - creates/reuses first admin user during setup
  - passkey registration stores credential with `subject = user.id`
  - passkey login creates an authenticated browser session with `subject = user.id`
  - OAuth access-token `sub` becomes user id
  - exposes `resolveUserForRequest()` / `resolveBearerUser()` helpers

### Permission resolution

Do not make the existing pure `PermissionService` entity-aware. Instead, add a resolver layer at shell/interface boundaries:

1. Normalize authenticated subject or interface identity (`usr_<uuid>`, `mcp:<subject>`, `discord:<id>`, etc.).
2. Ask `AuthService`/user store for a matching active user.
3. If an authenticated session/bearer subject does not resolve to an active user, deny it rather than falling back.
4. If a known active user is found, use `user.role`.
5. If an unauthenticated or interface-local caller has no matching user, call `PermissionService.determineUserLevel(interfaceType, userId)`.

This keeps existing rule behavior intact for legacy/interface-local callers while making runtime auth users authoritative. A small in-memory identity index can make lookups synchronous after auth-service initialization.

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

### Admin console (People is its first section)

The administration UX is its own console surface (see decision 11), a peer to `/cms` and `/chat` — a React SPA at `/admin` wearing `@brains/console-theme`, a thin same-origin client over `/auth/admin/*` and `/auth/representations`. It is an **admin console**, with People as its first section; invitations and an audit-log viewer can follow as further sections. Roster administration and promotion controls are Admin-only; authenticated non-Admins receive only the self-service representation-consent view. It is **not** a dashboard tab.

#### Admin package naming

The console's plugin id (`admin`), route (`/admin`), console/⌘K label ("Admin"), package (`@brains/admin`), and directory (`plugins/admin`) now consistently describe the **admin** surface. `people`/`person` remains reserved for the genuine domain concept: the People section, `PersonDetail`, `person-agent-store`, and the roster.

- [x] **Use console-level Admin names throughout** — export `adminPlugin`/`AdminPlugin` from `@brains/admin`, serve the console through `admin-routes.ts` and `admin-shell.ts`, bundle `admin-app.js`, and consume the renamed package and asset from Relay, Rover, and `@rizom/brain`.

Keep first UX small and explicit:

- Fresh setup asks for a display name; any temporary fallback must not use `Operator` as a role-like name.
- The shared console masthead shows `Name · Role · sign out`.
- The surface can list users, create trusted users, change role, suspend users, attach/detach identities, generate passkey setup links, and run the agent-promotion/claim-link flow.
- **The anchor is read-only here (decision 13).** The console renders the config-declared kind and the CMS-held profile; it does not set the kind or edit the profile. Profiles appear as a reference with an "Edit in CMS →" deep-link; the anchor kind appears as a read-only `brain.yaml` chip.
- Do not build public signup, email delivery, or route-wide CMS/dashboard lock-down in v1.

#### UX gaps — 2026-07-18 console review

The `@brains/admin` console is functionally complete and correctly gated. The 2026-07-18 review identified three operator-mental-model gaps; their resolutions are tracked below in impact order.

- [x] **Clarify that linked agents are external representatives.** The empty state now explains that the brain's built-in agent is implicit and does not require a representation link, rather than presenting the absent owner-agent row as broken.
- [x] **Demote raw identity attachment to an advanced escape hatch.** Passkey setup remains the primary person-level action; the manual form is behind an Advanced affordance and explicitly labels the resulting claim unverified and non-authenticating.
- [x] **Filter manual identity types to human-facing configured providers.** The shell passes the registered-interface set into the console; the dropdown retains built-in OAuth, conditionally includes configured email/Discord providers, and excludes reserved `a2a`/`did`/`mcp` identities (see [Identity & trust architecture](./identity-and-trust.md)).

### CLI

Add wrappers where useful:

```bash
brain user:list
brain user:create --display-name "Jane" --role trusted
brain user:update-role usr_... --role admin
brain user:suspend usr_...
brain user:attach-identity usr_... --type discord --subject 123456789
```

Keep `brain auth reset-passkeys --yes` as the break-glass reset for all passkeys and active OAuth state. It remains local/destructive and is not a replacement for normal multi-anchor recovery.

### Admin-managed onboarding

For v1, onboarding is explicit and Admin managed:

1. An Admin creates a user through the Admin API.
2. The anchor attaches one or more known identities.
3. For passkeys, the Admin requests a short-lived registration URL for that specific user.
4. The user opens the URL and registers a passkey; the credential binds to that user id.

There is no public registration, email invitation, or self-signup in the first slice.

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
- Keep static `MCP_AUTH_TOKEN` fallback as anchor.

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

**Status: implemented as the standalone admin console (People section, at `/admin`) per decision 11. Bounded legacy-cookie compatibility remains active.**

- [x] Approve the People-section design (now the [admin console mockup — current](../design/admin-console-current-mockup.html)). The decision-13 end state is captured per anchor kind: [person](../design/admin-console-person-mockup.html), [team](../design/admin-console-team-mockup.html), and [organization](../design/admin-console-org-mockup.html).
- [x] Add Admin-only roster administration and authenticated self-service representation consent over the existing auth APIs.
- [x] Move People off the dashboard SSR page into the standalone `@brains/admin` React admin console (decision 11), importing auth-service's browser-safe contract types and constants instead of literal role/mutation vocabularies. Dashboard is pure monitoring again.
  - The console is a registered route-derived surface using the `instrument` climate.
  - `GET /api/console/jump` includes an admin surface door for authenticated Admins.
  - The surface consumes `@brains/console-theme`; the shared surface registry recognizes the new consumer.
- [x] Generalize the surface to `/admin` with People as its first section (decision 11), retaining a configurable `routePath` for deployments and leaving room for invitations and an audit-log viewer.
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

### Phase 6 — Person-centered identity and agent promotion

**Status: complete.** Runtime person backfill, normalized person-owned claims with independent evidence, and consent-bearing agent/person links are implemented. The pre-Drizzle bridge preserves existing person, user, session, link, and claim ids. Agent assertions remain non-authenticating and provider/admin verification is retained as separate evidence. The Admin-authorized API can atomically promote an agent's represented person into an invited user or link an agent to an existing user's person. Targeted passkey registration activates invited users and accepts their representation before creating a session; existing users review pending links in the authenticated **My agents** view in the People section at `/admin`. People lists linked-agent status, and approved Agent Network entries expose both invitation and existing-person linking. Agent-carried represented-person DID assertions flow into private claim/evidence storage: exact claims on the selected person reuse their claim ids, assertions remain non-authenticating, and cross-person conflicts atomically block the link. The promotion dialog now asks the private Admin-only reconciliation endpoint to compare exact hashes without exposing subjects or hashes, preselects only one independently verified person, refuses to infer from asserted-only ownership, and blocks cross-person claims with the affected People records named for explicit administrator correction. The [admin console mockup (current)](../design/admin-console-current-mockup.html) explores the profile, access, representation, and consent states. Promotion runs from an existing agent to an authenticated user; creating an agent for an existing user is a secondary linking flow, not promotion.

Introduce a stable person subject between auth users and agents:

```text
Auth user ─────► Person ◄───── Agent
                   │
                   ├─ profile
                   ├─ Discord identity
                   ├─ email identity
                   └─ DID
```

- An auth user is the access/account facet: role, status, passkeys, sessions, and grants.
- A person is the canonical human subject: durable profile plus private, verified identity claims.
- An agent is a distinct actor that can represent a person and resolve that person's permitted profile and identity claims.
- Canonical identity claims belong to the person. Linking an existing user and agent to the same person reuses claim ids; it never copies Discord ids, email addresses, or profile fields.
- Agent-owned identities such as bot accounts, brain DIDs, domains, and A2A endpoints remain separate from represented-person identities.
- Sensitive canonical subjects remain in private runtime storage. Agent views receive opaque claim references or display handles; delivery adapters resolve raw routing subjects only when authorized. Public Agent Cards include only claims the person explicitly marks public.
- Identity claims carry provenance and assurance. Agent-asserted profile/contact data may seed a person record, but it cannot authenticate a user until independently verified.
- Conflicting verified claims require explicit reconciliation. Never merge by display name, similar email, or agent assertion alone.

Promotion flow:

1. Open an existing agent dossier and choose **Grant represented person access**.
2. Reuse or create the agent's represented person and existing canonical claims.
3. Select the initial `public`, `trusted`, or `admin` role.
4. Create an invited auth-user facet linked to that person.
5. Deliver a targeted setup/claim link through an approved channel.
6. Activate authentication bindings only after passkey or provider verification.

Linking flow for an existing user:

1. Select an agent and an existing person-backed user.
2. Compare the agent's represented-person claims with the user's claims.
3. Reuse exact verified matches, request reconciliation for conflicts, and retain provenance for unverified assertions.
4. Require represented-person consent unless the signed-in user is linking their own agent.
5. Keep agent execution attributed as the agent, with the initiating or represented user retained separately as `onBehalfOf`/delegation provenance.

Storage boundaries:

- Add stable person ids and user-to-person links in private auth runtime storage, backfilling one person for every existing user without changing user ids, sessions, roles, or credentials.
- Move canonical provider identity ownership from user-only bindings to person identity claims through an ordered, row-preserving migration. Keep temporary legacy reads only behind an explicit compatibility gate.
- Keep semantic person profiles entity-driven and markdown-based; runtime person records may reference a profile entity id but do not duplicate profile content.
- Keep representation consent, authentication bindings, and management grants on the runtime plane. Git-synced agent/profile entities cannot grant access.

Management UX:

- Agent dossier: **Grant represented person access** is the primary promotion action.
- People dossier: Profile, Access, and Agent sections show the shared person and linked facets.
- The agent may help collect or edit semantic profile content and prepare a configuration proposal.
- Identity linking, role selection, representation consent, activation, and revocation remain admin-console/API operations (decision 11) and are not model-visible administration.
- An active user can approve their own representation request through a self-service **My Agent** view; anchors manage roster-wide requests from People.

Validation:

- promoting an agent creates an invited user linked to the same person and does not duplicate identity claims
- provider-asserted identities cannot authenticate until verified
- linking an existing user reuses an exact canonical Discord claim
- conflicting Discord claims block automatic linking and require explicit reconciliation
- linking never publishes a private identity or exposes raw provider subjects to the model
- existing users, passkeys, sessions, roles, identity lookup, and browser cookies survive the person migration
- agent actions remain attributed to the agent while retaining initiating-user/delegation provenance

### Phase 7 — Optional invitation delivery

Build delivery convenience on top of the targeted setup/claim mechanism only when real workflows need it:

- invite token lifecycle beyond the existing targeted setup token
- email/Discord delivery hooks
- resend/expiry UX
- self-service claim notifications

## Security notes

- Auth-user records are runtime auth state and should use `0600` file permissions.
- Never store passkey private material; public credential keys stay in passkey store.
- Role changes and identity attach/detach require `admin`.
- Suspended users are denied auth/session use.
- Role downgrades, suspension, and identity detach revoke that user's sessions and refresh tokens immediately.
- Demoting, suspending, or deleting the last active Admin must be rejected; a personal Anchor must remain an active Admin.
- Identity binding must be explicit; do not auto-link two identities just because display names match.

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
3. Permission resolution uses auth users before falling back to rules.
4. MCP OAuth sessions receive per-user permissions.
5. Admins can manage users through a dedicated authenticated admin surface, never through model-visible tools.
6. Multiple active Admins are supported, with atomic last-active-Admin protection.
7. Conversations/jobs can be attributed to users.
8. Auth state remains outside `brain-data`.
9. Dashboard permissions use the authenticated user's actual role, People roster management is Admin-only in the standalone admin console (decision 11), self-service representation consent is available to authenticated users, and legacy Operator/Owner role terminology is removed with compatibility-safe session migration.
10. An agent's represented person can be promoted to an invited auth user without copying canonical identity claims, and existing users can link to agents through the same person subject.
