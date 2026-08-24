# Plan: Studio consolidation

## Status

**Proposed.** Rename the CMS to Studio, convert the admin console into
admin-gated Studio workspaces, invert the Studio gate so the shell admits any
active session while every capability gates itself, fold the account surface
into Studio as the one view admitted to everyone, and delete `plugins/admin`.
The Dashboard is repurposed: its operator-facing content moves into a Studio
Overview workspace, and the surface itself becomes the brain's public card.
Chat does not move. Auth-service remains the sole owner of account and
administration APIs; Studio owns their presentation, not their security
contracts. This work is based on the completed `work/react-renderer-consolidation`
stack so the Studio and Dashboard changes use the unified React renderer rather
than recreating work on Preact. Design mockups for the Overview workspace and
the card:
[`../studio-consolidation-mockups.html`](../studio-consolidation-mockups.html)
(decided 2026-08-19).

**Progress:** Phases 1–5 are implemented on `work/studio-consolidation`; Phase
6 is next. A 2026-08-23 review confirmed the rename is cleanly mechanical and
the capability-parity inventory holds. Its Phase 2 follow-ups (redundant Admin
asserts, fetch-all audit pagination, and raw ISO timestamps) and Phase 3 entry
conditions (shared form-control vocabulary and shared `queryInteger`) landed
with Phase 3. Phase 4 keeps People and Peers source-owned by `plugins/admin`;
neither Admin nor Studio depends on the other, and registration crosses only
the shared workspace message contract. Phase 5 admits every active session to
the Studio shell, enforces Trusted/Admin capability boundaries per route
family, defaults workspace floors to Trusted before source callbacks, and
makes active-session visibility explicit on console descriptors. The
2026-08-24 Dashboard decision keeps its existing chrome with exactly three
public tabs: Overview, Knowledge, and Network.

## Goal

One operator surface, honestly named, with one gating model. `@brains/cms`
stopped being a content editor when it grew the workspace registry: four
plugins (directory-sync, content-pipeline, site-builder, unified-inbox)
already register declarative operator workspaces into it, each with its own
access handler, data provider, and actions. Meanwhile the admin console is a
second hand-rolled React app (people, invitations, peers, audit) duplicating
the same scaffolding — TanStack Query client, api/queries modules,
console-theme — behind a separate door, the account panel is a third app in
the same package, and launch intents bounce between surfaces with
query-string handoffs (`admin-peer-invite`, `account-settings` in
`plugins/cms/ui-react/src/App.tsx`).

End state:

- `plugins/studio` / `@brains/studio`, plugin id `studio`, route `/studio`
  with permanent redirects from the old `/cms`, `/account`, and `/admin`
  paths. Redirects preserve deep paths and query state where a direct mapping
  exists; `/admin` falls back to the neutral Studio home.
- The Studio shell is chrome: it admits any active session and renders only
  the views the actor is admitted to. Capabilities gate themselves — the
  entity editor family at trusted, admin workspaces at admin, account at any
  active session.
- The admin console's four views become built-in, admin-gated Studio
  workspaces; the admin door, shell routes, client API wrappers, and React app
  are gone. The authoritative `/auth/admin/*` JSON endpoints remain in
  auth-service.
- Account (profile, passkeys, sessions, plugin-settings forms) becomes a
  Studio view admitted to every active session — a lazy client chunk, because
  WebAuthn ceremonies cannot be declarative. No separate door. Its browser
  code continues to call auth-service's `/auth/account/*` endpoints.
- `plugins/admin` is deleted; the canonical roster loses its `admin` and
  `account` UI-plugin entries. Auth-service keeps account/admin schemas,
  operations, same-origin checks, invariants, audit, and HTTP routes.
- Studio gains an **Overview** workspace — the operator home: what needs
  you, what the brain did on its own, system and network state. It absorbs
  the Dashboard's trusted/admin widget content.
- The Dashboard becomes the **brain's card** — the public, outward face for
  visitors, agents, and peers, keeping the existing dashboard chrome
  (masthead, tab bar, cards) with exactly three tabs: **Overview** (what
  this is — identity and ownership, ways to connect, what it holds, its
  skills), **Knowledge** (the knowledge map), and **Network** (the agent
  proximity map). Public-visibility data only; no operator content.
- Console strip: Dashboard / Chat / Studio — Dashboard being the only
  surface that also serves the logged-out world.

## Non-goals

- Moving web-chat into Studio. Chat is an interface with a live message
  stream, aligned with the Chat SDK provider family
  ([`brain-web-chat-sdk-adapter.md`](./brain-web-chat-sdk-adapter.md)); the
  operator-console composition stays navigational per
  [`operator-console-pwa.md`](./operator-console-pwa.md). Studio features that
  need chat call the chat surface; chat does not move house. The Dashboard
  likewise stays a separate surface — only its operator content moves.
- Weakening what any capability requires. The gate inversion moves the
  trusted floor from the route perimeter into the capability families; no
  data or action becomes reachable at a lower rank than today. The only
  intentional access change is that a sub-trusted session sees the Studio
  shell (containing only Account) instead of a 403.
- Preserving CMS-named authoring aliases. This is an intentional clean
  cutover while the authoring API is still pre-stable: all in-repo consumers,
  fixtures, declarations, and documentation move to Studio names together.
- Moving auth authority into Studio. Account and administration APIs remain
  owned by `shell/auth-service`; Studio providers call the service directly
  on the server, while the Account client keeps using `/auth/account/*`.
- Making account declarative. It stays a real client app inside the Studio
  bundle; only its home and door change.

## Gating model

Today the Studio routes have one choke point — `resolveRequestAccess` in
`editor-routes.ts` — whose trusted floor protects every API route and the
shell. Registrant `accessHandler`s are written assuming that floor exists
beneath them. The inversion keeps principal resolution centralized but replaces
one implicit perimeter with an explicit route-family matrix:

| Route family                                                      | Admission                                                                                 |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Legacy redirects (`/cms`, later `/account` and `/admin`)          | Public redirect only; no data                                                             |
| Studio entry asset and lazy chunks                                | Public static assets; bounded asset names and no filesystem traversal                     |
| Studio shell                                                      | Active session; anonymous callers redirect to login                                       |
| Entity catalog, schemas, lists, CRUD, uploads, assist, and agents | Active Trusted or Admin principal, followed by existing visibility/action policy          |
| Repository sync status                                            | Active Admin principal; this remains stricter than the editor family                      |
| Workspace discovery, reads, and actions                           | Active session plus the workspace's declared floor, then its source-owned `accessHandler` |
| Account browser APIs                                              | Remain `/auth/account/*` in auth-service and require an active session                    |
| Administration browser APIs                                       | Remain `/auth/admin/*` in auth-service and require Admin                                  |

- The shared `/studio/api/types` navigation response is active-session
  admitted because it carries workspace discovery: Public-rank actors receive
  an empty entity catalog plus only explicitly lower-floor workspace
  descriptors. Every dedicated entity endpoint still requires Trusted.
- Workspace floors are enforced by the registry **before** calling
  `accessHandler`, `entityTypes`, `badgeProvider`, `dataProvider`, or
  `actionHandler`. The floor defaults to `trusted`, so existing registrants
  retain today's perimeter. Admin workspaces declare `admin` and keep their
  source-owned `assertStudioWorkspaceAdmin` checks as defense in depth. Account
  explicitly declares the lower active-session floor.
- The route-enumeration test asserts the complete matrix, not a blanket
  `/studio` rule: an active public-rank principal receives `403` from every
  editor endpoint and Admin sync status, cannot invoke a Trusted/Admin
  workspace provider, and can reach only the shell and Account. Static assets
  and redirects are the only anonymous non-data exceptions.
- Session presence and permission rank remain separate. The console-surface,
  endpoint, and interaction descriptors gain an additive
  `requiresActiveSession` facet. Dashboard rendering passes whether a verified
  session exists, so anonymous Public callers do not see Studio while an active
  public-rank person does. Permission rank alone cannot represent that
  distinction.
- A brain whose config still uses the `cms` member or `plugins.cms` does not get
  a permanent runtime alias. Phase 1 extends `brain config:migrate` to rewrite
  `cms` → `studio` in `add`, `remove`, and plugin configuration, rejecting
  conflicting dual keys. Startup then fails with an actionable migration error
  if an unmigrated key remains.

Sub-trusted sessions are real: invitations only grant `trusted` or `admin`
(`invitation-service.ts`), but the role mutation path accepts `public` — the
demotion/offboarding state. Such a person must keep reaching their sessions
and passkeys; under this model that is exactly the Account view.

## Dashboard purpose: the brain's card

Today the Dashboard mixes audiences: it is the only anonymous-capable
console surface, yet most of its widgets are operator instruments gated
trusted or admin. The split resolves along the audience line:

- **Studio Overview** (operator home, trusted+): needs-attention items with
  launch links into the owning workspaces, a while-you-were-away delta feed,
  and system/network state cards. This is where the Dashboard's trusted and
  admin widget content re-homes, expressed through the same semantic
  protocol that already unifies dashboard widgets and studio workspaces.
  Glance-and-launch only: any affordance that changes something is a launch
  into the workspace that owns it.
- **Dashboard = the card** (public): the brain presenting itself to people,
  agents, and peer brains, in the dashboard's existing chrome with three
  fixed tabs (decided 2026-08-20). **Overview** answers "what is this":
  whose brain it is (grown from what the anchor knows, and belongs to
  them), the contact doors — chat, site, mail, MCP, atproto — typed by
  audience, what it holds, and its skill entities. **Knowledge** is the
  corpus-calibrated knowledge map (`docs/rizom-knowledge-map-mockup.html`
  is the reference visualization; skills are its moss marks). **Network**
  is the agent proximity map with honest agent data. Public visibility
  only; a signed-in operator gets a Studio door, not more data here.

The design reference for both is
[`../studio-consolidation-mockups.html`](../studio-consolidation-mockups.html),
which reuses the existing knowledge-map and proximity-map visualizations
verbatim (data, mark language, and animation vocabulary lifted from their
source mockups).

## The two protocol gaps

Workspace action controls carry a pre-bound input (`OperatorActionControl`
renders a button plus static or prepared confirmation), and query controls are
select-only. There is no free-text field in the workspace protocol, so
invite-person and person-edit flows are not expressible today. The account
settings contract already has most of the field vocabulary this needs
(`AccountSettingsControl`: text/url/number/checkbox, with `secret` totality).
Phase 3 extends the workspace protocol additively with schema-driven action
forms. Form actions require object input schemas, a total declared field map,
`select` rendering for declared enums, password treatment for secret inputs,
and server-side schema parsing before prepare or execute.

Invitation actions expose the second gap: create/resend can return a one-time
setup URL and manual-delivery state, while the current host discards successful
action output and merely refetches. Phase 3 therefore adds a bounded,
schema-backed post-action result presentation. Fields are declared total,
explicitly marked copyable/sensitive where appropriate, never persisted by the
host, cleared on navigation/refetch, and visible only to the actor who invoked
the action. Raw unknown output is never rendered.

Both extensions are published-protocol surface. They follow the stable operator
contract's additive-only, conformance-evidence discipline in the
[authoring ledger](../public-release/AUTHORING_API_0.2.md), including packed
consumer coverage and release-surface review before code-quality review.

## Implementation prerequisites

- Base this work on the completed `work/react-renderer-consolidation` stack, or
  wait until that stack merges and rebase onto `main`. Do not implement Studio
  against the old Preact host and then port it.
- Freeze an admin-capability parity inventory before deleting UI. At minimum it
  covers invitation create/cancel/resend/manual confirmation, user role/status/
  delete, passkey registration/revocation, session revocation, and peer linking.
  Every capability must have exactly one owning UI at each phase boundary or an
  explicit retirement decision.
- Keep `/auth/admin/*` and `/auth/account/*` route, schema, authorization,
  same-origin, invariant, and audit ownership in auth-service throughout.
- Add this plan to the Interfaces section of `docs/roadmap.md` before the first
  implementation commit.

## Phases

Each phase is a releasable vertical slice; tests land before or with the code
they cover, inside the phase.

### Phase 1 — Rename cms → studio

- Tests first: console-strip derivation expects a `studio` door with label
  "Studio"; redirect tests cover `/cms` plus deep entity/workspace paths and
  query preservation; every packed operator fixture compiles and runs after
  moving to `defineStudioWorkspace`; and golden export tests reject CMS-named
  authoring exports.
- Rename directory, package name, plugin id, route default, endpoints and
  interactions labels; register the legacy `/cms` route as a redirect.
- Internal identifier sweep across the private packages: `Cms*` types,
  `cms-namespace`, `cms-workspace-runtime`, the `cms:register-workspace`
  message, `cmsWorkspacePath`, the `interfaceType: "cms"` literal. Before
  renaming any literal that reaches storage, grep the audit-event and
  operation-context write paths for it; if a stored value depends on the old
  literal, keep the stored form stable behind an adapter at the read side and
  record that in the phase commit.
- Published surface: replace `defineCmsWorkspace` and the Cms-named workspace
  types with `defineStudioWorkspace` and Studio-named types. Update every
  consumer, the machine-readable export ledger, generated declarations, golden
  export checks, runtime fixtures, and operator capability inventory. Add a
  release changeset that calls out the pre-stable breaking rename.
- Update `packages/brain-cli` dependency and `build:ui` filters, the
  canonical-brain bundle member/roster entry, visual-regression scripts, and
  CMS wording in `docs/feature-overview.md`,
  [`operator-console-pwa.md`](./operator-console-pwa.md), and
  [`external-plugin-authoring.md`](../external-plugin-authoring.md).
- Extend `brain config:migrate` to rewrite `cms` member selections,
  `plugins.cms`, and an exact retired `/cms` Studio mount to `studio` and
  `/studio`, preserving comments and rejecting conflicting dual configuration.
  Runtime resolution keeps no permanent `cms` plugin-id alias; its failure
  names the migration command.

### Phase 2 — Audit workspace (walking skeleton for admin-in-Studio)

Audit is read-only — table, filters, url-query detail — so it proves the
whole admin-in-Studio path without waiting on the protocol extension, and it
runs under the current trusted perimeter (the gate inversion lands later and
does not block it).

- Tests first: registry admits the audit workspace for admin actors only;
  view conformance and packed evidence per the existing built-in workspace
  conventions; a trusted actor's nav omits it.
- Register the workspace as a built-in in the Studio package (the renamed
  `registerBuiltInStudioWorkspace` runtime path all registrants use), with an
  Admin-only `accessHandler`, source-owned Admin assertion, and a server-side
  data provider calling the active auth service. When Phase 5 adds floors, this
  workspace also declares `admin`. It does not fetch its own HTTP API.
- Remove `AuditView` and the admin client's audit query/wrapper; keep the
  auth-service-owned `/auth/admin/audit` endpoint. Remove the Audit tab from
  the shrinking admin shell; the admin door remains until Phase 6.

Review follow-ups (2026-08-23), to land before Phase 3's workspace copies the
same shapes:

- Drop the hand-rolled admin re-assertions in the audit workspace's
  `authorize` and `load` hooks. The runtime already refuses sub-admin actors
  from `definition.permission` before either hook runs
  (`studio-workspace-runtime` admission); keep at most one assert with a
  comment naming it belt-and-braces, and delete the pseudo-actor adapter.
- Push filtering, offset/limit, and the action-count aggregation into the
  audit store query. `audit.list()` is an unbounded full-table scan, and the
  workspace currently loads every event per request to serve a 25-row page —
  the pagination UX implies growth that the implementation cannot survive.
- Render timestamps with a shared workspace date formatter (Intl medium
  style, as the old `formatDate` did) instead of raw `toISOString()` in
  table cells. Audit is the first workspace to need one: establish the shared
  helper rather than inlining a format each workspace will re-invent.

### Phase 3 — Schema-driven action forms + invitations workspace

- Tests first: contract tests for object-schema action forms, total field maps,
  enum selects, non-echoing secret controls, schema rejection before callbacks,
  and bounded typed result presentation; host-renderer tests cover create,
  cancel, resend/retry, manual delivery confirmation, and one-time setup-link
  copy; packed conformance evidence is updated.
- Extend the protocol additively with an action-form control whose host renders
  text/url/number/checkbox/password fields and enum selects, then submits
  through the existing action binding with static or prepared confirmation.
  Extend successful actions with optional schema-backed result presentation;
  do not render arbitrary action output.
- Reuse, don't re-declare, the field vocabulary (2026-08-23 review): the form
  control set is the account-settings vocabulary plus `select`, defined once
  as a zod enum with the TS unions derived via `z.output` — not parallel
  literal unions in the contract, the runtime source types, and the runtime
  boundary schema. The field-definition shape ({label, control, secret})
  shares one base with `AccountSettingsFieldDefinition`. Type-level totality
  (a mapped required field map, as account-settings does) is preferred over
  `Partial` plus a runtime totality check; keep the runtime check either way.
- Extract the `queryInteger` query-preprocessing helper to a shared module
  before this phase adds a third copy — it is already duplicated verbatim
  between `plugins/unified-inbox/src/schemas.ts` and
  `plugins/studio/src/audit-workspace.ts`.
- First consumer: Invitations workspace. Preserve the complete existing
  lifecycle: create, failed-delivery retry/resend, cancellation with prepared
  confirmation, manual-delivery confirmation, and ephemeral setup-link display
  and copy. The data provider reads auth-service directly and every mutation
  passes the authenticated Admin actor to auth-service.
- Remove `InvitationsView`, `AddPersonDialog` entry points owned by that view,
  and their admin-client wrappers only after parity tests pass. Keep all
  `/auth/admin/*` endpoints. If People still exposes Add Person during this
  phase, remove that duplicate trigger so Invitations has one UI owner.

### Phase 4 — People and peers workspaces

- Tests first per workspace, plus one parity test mapping every action in the
  frozen admin-capability inventory to exactly one Studio control.
- People: roster table, URL-query person detail, Anchor summary/stats, and the
  full existing account-administration set: role/status changes, suspended-user
  deletion, passkey setup/revocation, own/other session revocation as currently
  authorized, and connected-channel presentation. Last-Admin, personal-Anchor,
  suspended-user, confirmation, and actor-attribution invariants remain in
  auth-service.
- Peers: peer listing, peer-first invitation, and person-peer linking. The
  `admin-peer-invite` launch intent becomes an in-Studio workspace URL with
  query state rather than a cross-surface query-string bounce.
- Remove `Roster`, `PersonDetail`, `OverviewView`, `AnchorPanel`, and remaining
  `AddPersonDialog` code plus admin-client wrappers only after parity passes.
  Keep auth-service's anchor/users/channels/reconciliation/mutations endpoints.

### Phase 5 — Gate inversion

No new capability ships; the floor moves. Sliced separately so its test
surface is pure gating.

- Tests first: enumerate the exact route matrix from the Gating model. Public
  static assets and legacy redirects remain data-free anonymous exceptions;
  the shell requires an active session; active public-rank principals receive
  `403` from dedicated editor APIs and sync status while navigation returns an
  empty entity catalog; Trusted principals still receive `403` from sync
  status; and denied workspace providers are never called.
- Registry contract tests prove that the default floor is `trusted`, the floor
  runs before every provider callback, and a `() => true` handler cannot admit
  a sub-trusted actor without an explicit lower floor.
- Registration contract grows the permission floor (default `trusted`) —
  additive on the published definition surface, with ledger, frozen-fixture,
  packed-conformance, and changeset coverage.
- `resolveRequestAccess` becomes active-session principal resolution. Trusted
  assertions move to the entity/assist/upload/agent family boundaries;
  repository sync status keeps its nested Admin assertion; workspace admission
  goes through the floor-enforcing registry.
- Extend console-surface, endpoint, and interaction descriptors with the
  additive active-session facet. Anonymous Dashboard output omits Studio;
  active public-rank output includes it. Shell nav derives from workspace
  admission and is empty for that actor at this phase (`/account` still serves
  them until Phase 6).

### Phase 6 — Account into Studio; dissolve plugins/admin

- Tests first: the Account view requires an active session at its explicit
  lower floor; `/auth/account/*` retains its existing auth-service admission,
  same-origin, subject-derivation, passkey, and session tests; `/account`
  redirects to the Studio Account view; `/admin` redirects to neutral Studio
  home; and the moved Account app tests run against their new home.
- Move only the Account React presentation into Studio as a lazy chunk with
  WebAuthn ceremonies. It continues to call `/auth/account/*`; no auth JSON
  endpoint moves packages or paths.
- Make lazy delivery real: enable deterministic code splitting, emit an asset
  manifest or bounded chunk names, serve only generated Studio assets from a
  traversal-safe prefix route, copy every entry/chunk/map into the bundled
  `@rizom/brain` output, and cover direct and packaged loading. Static chunks
  remain data-free public routes.
- Declare Account as the one active-session-floor view. The
  `account-settings` launch intent becomes in-Studio navigation instead of a
  cross-surface bounce.
- Run the frozen admin-capability parity test and delete `plugins/admin` only
  when no capability or client-only mutation wrapper remains. Canonical roster:
  drop `admin` and `account`; keep auth-service. Console strip: drop their
  entries so it becomes Dashboard / Chat / Studio. Update `build:ui` and
  release-bundle filters.
- Preserve `/auth/admin/*` and `/auth/account/*` contracts and run full gates.

### Phase 7 — Studio Overview workspace

- Tests first: overview workspace admission at the trusted floor; view
  conformance for the needs-attention list (tones, launch links), the delta
  feed, and the system/network cards; badge derivation for the strip-level
  "n need you" state.
- Register Overview as a built-in Studio workspace and the shell's default
  landing view. Its content is the operator-facing widget material: needs
  attention (failed jobs, expiring invitations), while-you-were-away deltas,
  system and network state.
- Registrant plugins whose dashboard widgets are trusted/admin-gated
  (unified-inbox, site-builder, content-pipeline) re-home that content to
  Overview through their existing semantic definitions; the dashboard stops
  rendering non-public widgets.

### Phase 8 — Dashboard becomes the card

- Tests first: the dashboard route serves the card to anonymous callers;
  every datum on it derives from public-visibility scope; the tab set is
  exactly Overview/Knowledge/Network; the operator door renders only for a
  session that passes the Studio gate.
- Rebuild the dashboard page as the three-tab card per the mockup, keeping
  the existing masthead/tabs/cards chrome: Overview with the what-is-this,
  ways-to-connect, what-I-hold, and skills cards plus the colophon;
  Knowledge with the knowledge map; Network with the proximity map. The
  knowledge-map and proximity-map renderers move from their mockups into
  the dashboard package as real components fed by entity, topic, skill, and
  agent-directory data.
- The widget-group tabs (knowledge/publishing/network/system) retire with
  their operator content; the public widget protocol remains for Overview
  cards so plugins can contribute public data points.

## Ordering rationale

The React renderer consolidation lands first (or this branch remains explicitly
stacked on it), so Studio never implements a second host against Preact. Rename
then lands before any admin workspace so new code is born under Studio names
and nothing renames twice. Audit converts before the protocol extension because
it is the only view with no form or result-presentation dependency — it proves
built-in registration, Admin gating, and nav hiding end to end while protocol
work is still unstarted. Invitations then prove the complete form/result path,
including one-time setup output, before People and peers consume it.

The gate inversion waits until admin views are already workspaces so its diff
is the explicit floor move, and lands one phase before its only lower-floor
consumer (Account). The admin app shrinks view by view, with the parity inventory
ensuring exactly one UI owns every capability at each boundary. The Dashboard
split comes last and in dependency order: Overview must exist (Phase 7) before
the Dashboard stops rendering operator widgets (Phase 8), so no operator
capability is ever without a home.

## Risks

- The gate inversion's hazard is a route missing its family assertion once
  the perimeter floor drops, or repository sync status accidentally inheriting
  the Trusted editor floor. The exact route-matrix test in Phase 5 is the guard,
  and the floor-enforcing registry runs before every provider callback.
- The action-form/result extensions and the registration floor touch published
  protocol surface. All are additive and require export-ledger updates,
  canonical Studio fixtures, packed conformance, changesets, and release-surface
  review before code-quality review.
- Deleting `plugins/admin` could silently drop a mutation or move authorization
  into the presentation package. The frozen capability-parity test prevents the
  former; keeping every auth route and invariant in auth-service prevents the
  latter.
- A lazy Account import without emitted/served/copied chunks produces a shell
  that works until Account is opened. Phase 6 tests source and bundled chunk
  loading and constrains the asset prefix to generated filenames.
- Permission rank cannot distinguish anonymous Public from an active demoted
  person. The additive active-session facet and anonymous/active-public surface
  tests prevent Studio from becoming either undiscoverable to the latter or
  advertised to the former.
- Persisted `"cms"` literals (audit events, operation context) may pin the old
  interface-type string; Phase 1's storage grep decides adapter-at-read versus
  clean rename, and the decision lands in that phase, not later.
- Live config and bookmarks may reference `/cms`, `/account`, `/admin`, the
  `cms` member id, or `plugins.cms`. Redirects cover URLs; `brain config:migrate`
  covers config without a permanent runtime alias and rejects ambiguous dual
  keys.
- The card is anonymous-facing, so every datum it renders is a disclosure
  decision: topic names, skill names, agent names, and counts all become
  public. Phase 8's public-scope test is the guard, and anything the owner
  does not want on the card must be excluded by visibility, not by styling.
