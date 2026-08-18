# Plan: Studio consolidation

## Status

**Proposed.** Rename the CMS to Studio, convert the admin console into
admin-gated Studio workspaces, invert the Studio gate so the shell admits any
active session while every capability gates itself, fold the account surface
into Studio as the one view admitted to everyone, and delete `plugins/admin`.
Chat and Dashboard do not move.

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
  with permanent redirects from the old `/cms` and `/account` paths.
- The Studio shell is chrome: it admits any active session and renders only
  the views the actor is admitted to. Capabilities gate themselves — the
  entity editor family at trusted, admin workspaces at admin, account at any
  active session.
- The admin console's four views become built-in, admin-gated Studio
  workspaces; the admin door, routes, JSON endpoints, and React app are gone.
- Account (profile, passkeys, sessions, plugin-settings forms) becomes a
  Studio view admitted to every active session — a lazy client chunk, because
  WebAuthn ceremonies cannot be declarative. No separate door.
- `plugins/admin` is deleted; the canonical roster loses its `admin` and
  `account` entries.
- Console strip: Dashboard / Chat / Studio.

## Non-goals

- Moving web-chat or Dashboard into Studio. Chat is an interface with a live
  message stream, aligned with the Chat SDK provider family
  ([`brain-web-chat-sdk-adapter.md`](./brain-web-chat-sdk-adapter.md)); the
  operator-console composition stays navigational per
  [`operator-console-pwa.md`](./operator-console-pwa.md). Studio features that
  need chat call the chat surface; chat does not move house.
- Weakening what any capability requires. The gate inversion moves the
  trusted floor from the route perimeter into the capability families; no
  data or action becomes reachable at a lower rank than today. The only
  intentional access change is that a sub-trusted session sees the Studio
  shell (containing only Account) instead of a 403.
- Breaking the published authoring surface. `@rizom/brain`'s services entry
  re-exports `defineCmsWorkspace` and the `CmsWorkspaceDefinition/View/
ViewBlock` types; those stay as deprecated aliases through the `0.2.x`
  additive line. Everything else renamed here is `"private": true` in-repo.
- Making account declarative. It stays a real client app inside the Studio
  bundle; only its home and door change.

## Gating model

Today the Studio routes have one choke point — `resolveRequestAccess` in
`editor-routes.ts` — whose trusted floor protects every API route and the
shell. Registrant `accessHandler`s are written assuming that floor exists
beneath them. The inversion keeps the choke point but moves the floor:

- Request → shell route: active session required (unauthenticated → `/login`
  redirect, as today) → chrome renders; nav derives from the registry's
  per-actor admission. A demoted (public-rank) person sees a shell containing
  only Account.
- Entity editor family (lists, schemas, CRUD, sync status, uploads, assist)
  → one trusted assertion at the family boundary; behavior identical to
  today.
- Workspace family → the registry enforces a declared permission floor
  **before** calling the workspace's `accessHandler`. The floor defaults to
  `trusted`, so every existing registrant keeps today's semantics with zero
  changes and a handler that is effectively `() => true` can never admit a
  sub-trusted actor by accident. Only a workspace that explicitly declares a
  lower floor ever sees a sub-trusted actor. Admin workspaces declare floor
  `admin` (equivalently, keep `assertCmsWorkspaceAdmin` semantics in the
  handler — the floor makes the registry fail closed either way).
- Account family → active session only; the single view with a declared
  sub-trusted floor.
- Failure branch: a route missing its family assertion would expose data to
  demoted users — guarded by a route-enumeration test asserting every
  `/studio` endpoint × a public-rank principal → 403, except the account
  family and the shell itself.
- Failure branch: a brain whose deploy config still keys plugin config by
  `cms` fails resolution at startup — the id rename is a deploy-time config
  migration, called out in Phase 1. No in-repo `brain.yaml` keys `cms`,
  `admin`, or `account` today.

Sub-trusted sessions are real: invitations only grant `trusted` or `admin`
(`invitation-service.ts`), but the role mutation path accepts `public` — the
demotion/offboarding state. Such a person must keep reaching their sessions
and passkeys; under this model that is exactly the account view.

## The one real protocol gap

Workspace action controls carry a pre-bound input (`OperatorActionControl`
renders a button plus static or prepared confirmation), and query controls are
select-only. There is no free-text field in the workspace protocol, so
invite-person and person-edit flows are not expressible today. The account
settings contract already has the field vocabulary this needs
(`AccountSettingsControl`: text/url/number/checkbox, with `secret` totality).
Phase 3 extends the workspace protocol additively with schema-driven action
forms reusing that vocabulary. This is published-protocol surface: the
extension follows the same additive-only, conformance-evidence discipline as
the [`public-operator-surface-authoring.md`](./public-operator-surface-authoring.md)
phases, and release-surface checks apply.

## Phases

Each phase is a releasable vertical slice; tests land before or with the code
they cover, inside the phase.

### Phase 1 — Rename cms → studio

- Tests first: console-strip derivation expects a `studio` door with label
  "Studio"; redirect test for `/cms` → `/studio` (permanent, path- and
  query-preserving); alias test asserting `defineCmsWorkspace` and
  `defineStudioWorkspace` are the same function through the `@rizom/brain`
  services entry.
- Rename directory, package name, plugin id, route default, endpoints and
  interactions labels; register the legacy `/cms` route as a redirect.
- Internal identifier sweep across the private packages: `Cms*` types,
  `cms-namespace`, `cms-workspace-runtime`, the `cms:register-workspace`
  message, `cmsWorkspacePath`, the `interfaceType: "cms"` literal. Before
  renaming any literal that reaches storage, grep the audit-event and
  operation-context write paths for it; if a stored value depends on the old
  literal, keep the stored form stable behind an adapter at the read side and
  record that in the phase commit.
- Published surface: `defineStudioWorkspace` plus Studio-named types become
  the canonical exports; the Cms-named exports remain as deprecated aliases.
- Update `packages/brain-cli` dependency and `build:ui` filters, the
  canonical-brain roster entry, and CMS wording in `docs/feature-overview.md`,
  [`operator-console-pwa.md`](./operator-console-pwa.md), and
  [`public-operator-surface-authoring.md`](./public-operator-surface-authoring.md).
- Deploy note: the live brain's config must rename any `cms:` plugin-config
  key to `studio:` when this ships.

### Phase 2 — Audit workspace (walking skeleton for admin-in-Studio)

Audit is read-only — table, filters, url-query detail — so it proves the
whole admin-in-Studio path without waiting on the protocol extension, and it
runs under the current trusted perimeter (the gate inversion lands later and
does not block it).

- Tests first: registry admits the audit workspace for admin actors only;
  view conformance and packed evidence per the existing built-in workspace
  conventions; a trusted actor's nav omits it.
- Register the workspace as a built-in in the Studio package (the
  `registerBuiltInCmsWorkspace` runtime path all registrants use), with
  admin-only admission and a data provider on auth-service's audit API.
- Remove `AuditView` and its JSON endpoint from the admin app; the admin door
  remains until Phase 6.

### Phase 3 — Schema-driven action forms + invitations workspace

- Tests first: contract tests for the new action-form control (fields derived
  from the action's zod input schema plus a declared field map; totality so a
  secret field can never render as an echoing text input); host-renderer tests
  in the declarative workspace; conformance evidence updated.
- Extend the protocol additively: an action control variant whose host renders
  input fields (text/url/number/checkbox, select from enum) and submits
  through the existing action binding with static or prepared confirmation.
- First consumer: invitations workspace — create-invitation form, revoke with
  prepared confirmation. Remove `InvitationsView` and its endpoints from the
  admin app.

### Phase 4 — People and peers workspaces

- Tests first per workspace, same conformance discipline.
- People: roster table, url-query person detail, role and access actions via
  action forms, with the old `OverviewView` stats folded in as a stats block.
- Peers: peer listing and invite flow. The `admin-peer-invite` launch intent
  stops bouncing across surfaces with query params and becomes an in-Studio
  workspace URL with query state.
- Remove `Roster`, `PersonDetail`, `OverviewView`, `AnchorPanel`,
  `AddPersonDialog`, and their endpoints from the admin app.

### Phase 5 — Gate inversion

No new capability ships; the floor moves. Sliced separately so its test
surface is pure gating.

- Tests first: the route-enumeration test (every `/studio` route × public-rank
  principal → 403, shell excepted); registry contract tests that the default
  floor is `trusted`, that the floor is enforced before `accessHandler` runs,
  and that a `() => true` handler cannot admit a sub-trusted actor without a
  declared lower floor.
- Registration contract grows the permission floor (default `trusted`) —
  additive on the published definition surface, same discipline as Phase 3.
- `resolveRequestAccess` floor drops to active-session; the trusted assertion
  moves to the entity-editor family boundary; workspace admission goes
  through the floor-enforcing registry.
- Shell renders for sub-trusted sessions: nav derives from admission, which
  at this phase yields an empty workspace list for them (`/account` still
  serves them until Phase 6).

### Phase 6 — Account into Studio; dissolve plugins/admin

- Tests first: account family endpoints assert active-session (extending the
  Phase 5 enumeration test's exception list); account view admission at the
  sub-trusted floor; redirect test for `/account` → the Studio account view;
  the moved account app tests run against their new home.
- Move the account panel (JSON endpoints under the Studio API, React views as
  a lazy chunk with the WebAuthn ceremonies) into the Studio package; declare
  it as the one sub-trusted-floor view.
- The `account-settings` launch intent becomes in-Studio navigation instead
  of a cross-surface bounce.
- Delete `plugins/admin`. Canonical roster: drop the `admin` and `account`
  entries. Console strip: drop the admin and account surface entries — the
  strip becomes Dashboard / Chat / Studio. Register the legacy `/account`
  route as a permanent redirect. Update `build:ui` filters.
- Full gates.

## Ordering rationale

Rename first so every admin workspace is born under Studio names and nothing
renames twice. Audit converts before the protocol extension because it is the
only view with no form dependency — it proves built-in registration, admin
gating, and nav hiding end to end while the protocol work is still unstarted.
The gate inversion waits until the admin views are already workspaces so its
diff is purely the floor move, and lands one phase before its only consumer
(account) so the enumeration test exists before any sub-trusted actor can
reach the shell's API surface with expectations. The admin app shrinks view
by view, so at every phase boundary exactly one surface owns each capability
and the release train can ship the slice.

## Risks

- The gate inversion's hazard is a route missing its family assertion once
  the perimeter floor drops; the enumeration test in Phase 5 is the guard,
  and the floor-enforcing registry removes the matching hazard for
  registrant `accessHandler`s written against the old perimeter.
- The action-form extension and the registration floor both touch published
  protocol surface; both are additive, and both get the release-surface
  review (no out-of-band publishes, additive-only contract, conformance
  evidence) before code-quality review.
- Persisted `"cms"` literals (audit events, operation context) may pin the old
  interface-type string; Phase 1's storage grep decides adapter-at-read versus
  clean rename, and the decision lands in that phase, not later.
- The live brain's deploy config and any external bookmarks reference `/cms`,
  `/account`, and the `cms` config key; the redirects cover URLs, the deploy
  note covers config.
