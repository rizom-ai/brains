# Plan: Public dashboard-widget and CMS-workspace authoring

## Status

**Approved as a `0.2.x` additive milestone (scope decided 2026-08-10; Phase 0
contract decisions accepted 2026-08-12; completeness revision accepted
2026-08-14).** Phase 1 public schemas, definition bindings, inference checks,
and ledger curation shipped in PR #123. Phase 2 encrypted account-settings
persistence, Account forms, and runtime-owned `forAccounts` supervision shipped
in PR #132. Phase 3 Dashboard execution and host rendering shipped in
`f25b2017d` and is available in the `0.2.0-alpha.293` release line:
request-scoped widget callbacks receive the canonical caller, secret-redacted
settings, visibility-scoped entities, typed jobs, and cancellation.

Before CMS implementation begins, the 2026-08-14 revision requires the public
semantic contract to express every current first-party Dashboard widget and CMS
workspace. The protocol remains host-rendered and admits no author React,
Preact, HTML, CSS, script, renderer-name, or private-component escape hatch.
CMS hosting, complete built-in conformance, packed standalone evidence,
documentation alignment, and release nomination remain.

Scope: this plan does **not** gate `v0.2.0`. Stable nomination proceeds on the
current frozen surface. The authoring additions continue through the `0.2.x`
line. The completeness revision may replace private internal renderer paths,
but it does not add a compatibility promise for those unpublished internals;
the published definition contract remains additive unless the capability audit
proves otherwise.

`docs/feature-overview.md` no longer implies external plugins can already
provide these capabilities; that correction shipped with this scope decision.

A 2026-08-15 review against the code corrected two things: the non-goal
forbidding publication of the UI library contradicted the Milestone B decision
in [`npm-package-boundaries.md`](./npm-package-boundaries.md), and is now stated
as the boundary it was meant to hold — components are not an
operator-authoring input whatever their package's publication status; and Phase
4 was resliced vertically so each step converts real surfaces end to end rather
than building the whole protocol before anything renders. A proposed fifth CMS
entry was rejected by repository evidence: `995d4910a` retired the Email Triage
workspace, and the current CMS test explicitly rejects its legacy renderer.

### Phase 0 refinement record (drafted 2026-08-11)

The source-first service target now lives at
`packages/brain-cli/test/fixtures/public-authoring/operator-surface/`; the
interface-owned IMAP lifecycle target lives beside it at
`account-settings-interface/`. They began as proposal fixtures: Phase 0 checks
enforced package shape and public-only source without compiling or exporting
them. Phase 1 now compiles
both fixtures against local public entries and classifies the accepted helpers
in the stable ledger; packing and runtime behavior remain later-phase evidence.
`PORTS.md` beside the operator fixture records the historical Directory Sync,
Site, Email Triage, and Publishing sketches. Unified Inbox replaced Email
Triage as the shipping triage workspace in `995d4910a`; the complete current
widget/workspace inventory must supersede that historical sketch during Phase 4.

Owner review accepted the five findings below before Phase 1:

1. **Account settings cannot remain service-only if IMAP is the proof.** The
   Email package that owns IMAP is a message interface under the accepted
   connected-channel architecture. Moving mailbox polling into a service would
   be a boundary regression. The recommended revision is one shared
   `defineAccountSettings()` definition exported from both the service and
   interface family entries, attachable to service, generic-interface, and
   message-interface definitions. A supervised daemon can bind to that
   definition with `forAccounts`; the runtime owns one task per configured
   principal, with that principal's ID and parsed settings, and replaces/cancels it
   on secret rotation or removal. A one-time
   enumeration is not enough, and authors should not manage account task maps.
2. **Operator callbacks need parsed service config/state.** Directory Sync,
   Site, and Email Triage all load snapshots and run operations through
   package-owned state. The public callback context should add inferred
   `config` and `state`; it should not expose registries or runtime services.
3. **The semantic view needs two demonstrated additions.** Email Triage needs
   declarative local table filters and conditional typed row actions. Site
   needs a narrow caller-policy query for a referenced entity action plus
   runtime-owned entity links. Neither addition permits raw routes, components,
   scripts, or unrestricted permission access.
4. **Widgets and workspaces are independent capabilities.** A Dashboard widget
   does not reference, own, discover, or implicitly link to a CMS workspace.
   Both may be declared by the same service, but registration, data, actions,
   permissions, lifecycle, and host navigation remain separate.
5. **Publishing was initially held specialized.** Its dynamic
   provider-discovered entity coverage, dynamic editor targets,
   content-hash-bound prepared confirmation, and caller-filtered queue-position
   mapping exposed capabilities absent from the first vocabulary. The
   2026-08-14 completeness revision supersedes the proposed permanent exception:
   those capabilities must now be represented through typed semantic contracts
   before the operator surface is complete.

Account settings belong under the principal's Account surface, not CMS. Secret
fields are encrypted at rest and write-only in host forms. Runtime code can
prevent automatic serialization/logging and provide bounded errors, but plugin
callbacks are a trusted code boundary: a package authorized to consume a
plaintext credential could intentionally reveal it, so the plan must not claim
sandbox-level containment.

Phase 0 exited on 2026-08-12. Its checked fixture vocabulary was the Phase 1
contract target and remains historical evidence rather than the final
completeness boundary.

### 2026-08-14 completeness revision

Owner review accepted these requirements before Phase 4:

1. Dashboard widgets and CMS workspaces remain independent declarations.
2. Every current first-party widget and workspace must be expressible through
   the same public semantic authoring contract. There are no permanent private
   renderer exceptions.
3. Rendering remains host-owned. The contract is a closed, typed semantic
   vocabulary rather than a DOM-like tree or author browser bundle.
4. One shared protocol has typed Dashboard and CMS profiles. Common primitives
   share schemas and normalization; each host profile permits only behavior its
   surface can support.
5. Server-driven filters, sorting, paging, selection, and deep links use a
   declared Zod query schema. The host owns canonical URL state and reruns the
   server loader with parsed query values.
6. Widget, workspace, and action definitions stay immutable at module scope.
   Validated execution results and caller-filtered catalogs are dynamic.
7. Dynamic catalogs contain typed entity/action definition objects, not opaque
   string commands or unknown RPC payloads.
8. Workspace actions remain typed workspace-scoped capabilities, distinct from
   tools and jobs. Static and prepared confirmations are host-owned; prepared
   proofs bind caller, capability, normalized input, relevant content revision,
   expiry, and single use.
9. Dashboard may admit anonymous public callers. CMS always requires an
   authenticated canonical caller. Declarative permissions are floors and
   optional policy callbacks may only narrow them.
10. Dashboard and CMS callbacks receive no account fields declared `secret`.
    Full principal settings remain confined to the account-bound `forAccounts`
    lifecycle that owns the connected account.
11. Callback capabilities remain narrow and definition-driven. Hosts own
    routes, internal links, navigation, registration, and lifecycle.
12. If Dashboard or CMS is absent, nothing happens: no registration, callback,
    failure, or diagnostic. A present host still fails loudly for an invalid or
    unsupported declaration.
13. The implementation is completed and validated in an isolated worktree.
    Main receives no transitional dual-renderer or compatibility-shim state.

The exact primitive set is not chosen speculatively. Phase 4 derives it from a
checked capability inventory and proves every inventory entry through running
conformance evidence before the implementation is eligible to merge.

## Goal

An author in a standalone package can contribute a dashboard widget and a CMS
workspace using domain schemas, typed entity/job references, canonical caller
facts, and plain render data. Author source does not mention plugin IDs,
registries, messaging channels, renderer names, package metadata, process
roles, internal UI components, or lifecycle timing.

The minimum useful outcome is:

- per-account plugin settings with schema-validated fields, encrypted secrets,
  a host-rendered form, principal-scoped injection, and interface-owned
  per-account task supervision (the IMAP-connection case end to end);
- one independently declared dashboard widget with schema-validated data,
  placement, permission, and digest/attention state;
- one CMS workspace with schema-validated data, entity coverage, canonical
  caller access, typed actions, and a runtime-owned URL;
- one shared JSON-native semantic protocol with typed Dashboard and CMS
  profiles, capable of representing every current first-party operator surface;
- one supplemental standalone golden service package that compiles, packs,
  installs, boots, renders, authorizes, acts, restarts, and shuts down outside
  the monorepo; plus one focused interface fixture that proves account-settings
  connection lifecycle in the family that owns IMAP.

## Audited gap

| Capability       | Current built-in path                                                                                      | Why it is not a public authoring contract                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Account settings | Deployment-owned `brain.yaml`/environment config; Account owns profile, passkeys, and sessions             | No package-declared per-principal schema, encrypted plugin secret store, form, or callback binding  |
| Dashboard widget | Private `context.dashboard.registerWidget()` and `DashboardWidgetRegistration`                             | Requires private context/types, string `rendererName`, registration timing, and optional UI objects |
| CMS workspace    | Private `registerCmsWorkspace()` over `cms:register-workspace` messaging                                   | Requires private messaging/types, author-supplied plugin ID, and a first-party renderer allowlist   |
| Dashboard UI     | UI-library component (`@rizom/brain-ui`) plus optional raw client style/script strings                     | Direct UI dependency and unstable rendering implementation                                          |
| CMS UI           | Hard-coded React branches for four first-party renderer names                                              | External code cannot provide a renderer and the names describe built-in products                    |
| Lifecycle        | Dashboard registration coordinates through the all-plugins-registered event; CMS has no unregister message | Authors would need runtime ordering knowledge and CMS cleanup is incomplete                         |
| Security/data    | Dashboard providers receive no canonical caller; CMS handlers receive a private actor                      | No shared public principal-scoped data/action contract                                              |

The current stable ledger exports no widget/workspace helper or type. The six
golden packages contain no operator-surface proof. This is an API omission, not
merely a documentation omission.

## Contract decisions

### 1. Extend the service family; do not add another plugin family

Dashboard and CMS contributions are server-side data/action capabilities that
naturally depend on service config, setup state, entities, and durable jobs.
Add them to `defineServicePlugin()` rather than creating another root package
kind or exposing runtime service classes.

Provisional author vocabulary:

- `defineDashboardWidget()`;
- `defineCmsWorkspace()`;
- `defineWorkspaceAction()`;
- `dashboardWidgets` on `defineServicePlugin()`;
- `cmsWorkspaces` on `defineServicePlugin()`; and
- blessed `z` from `@rizom/brain/services`.

Widget, workspace, and action contracts are declared and frozen at module
scope; their loaders/actions bind once inside the corresponding typed service
factory after setup. This mirrors `defineJob().handle()`: stable definition
identity and import-time validation remain separate from executors that need
inferred service config/state/account-settings types. The bindings are collected
once per plugin instance, never per request. Widgets and workspaces remain
independent definitions and factories.

The exact field names freeze only after the golden source is reviewed by Jo and
Niels. There will still be one preferred declarative operator path and one
service-family import. `defineAccountSettings()` is the deliberate exception:
it is one shared definition contract re-exported through the service and
interface family entries because principal-owned configuration can support
capabilities in either family without creating a new plugin family.

### 2. Expose complete semantic presentation, not private UI

Do not export React/Preact implementation components, `rendererName`, arbitrary
component values, raw HTML/CSS, or client scripts through the operator
authoring contract. The UI library ships separately as `@rizom/brain-ui` under
the Milestone B decision in [`npm-package-boundaries.md`](./npm-package-boundaries.md);
that publication is a site- and theme-authoring surface and does not make
components a legal operator-authoring input. The operator contract admits no
component value regardless of whether its package is published.
Both hosts consume one JSON-native semantic protocol with typed
`DashboardView` and `CmsWorkspaceView` profiles.

The protocol is a closed discriminated union of audited semantic primitives.
The existing stats, key-values, notices, lists, tables, links, and typed action
controls remain its base. Phase 4 adds only primitives demonstrated by the
complete built-in inventory, including the structures needed for relational
visualization, matrices, operational pipelines, host-managed query controls,
paging, master/detail presentation, dynamic typed catalogs, and prepared
confirmation. Semantic layout may express bounded intent such as density,
span, grouping, or split presentation; it does not recreate CSS or a generic
DOM tree.

Text is escaped by the host. Links are validated. Action controls carry
schema-validated payloads and definition references; authors do not construct
route URLs or action IDs. Dashboard and CMS own responsive markup, theme
integration, loading/error states, and browser behavior. Unsupported profile
content is rejected rather than ignored. Future author-supplied browser code
would require a separate architecture decision and cannot satisfy any
completeness criterion in this plan.

### 3. Declare each schema once

Each widget declares one data schema. Its loader returns schema input; digest
and view callbacks receive parsed schema output.

Each workspace declares one data schema and, when it is server-interactive, one
query schema. Each action declares its input and output schemas. The runtime
validates:

1. canonical query state before invoking a loader;
2. provider output before serialization;
3. dynamic typed capability catalogs before discovery or rendering;
4. action input before preparation or execution;
5. prepared confirmation proofs before final execution;
6. action output before returning it to the browser; and
7. the generated host-profile view before rendering.

The same schema drives callback inference, runtime validation, generated
declarations, and fixture assertions. Authors write no parallel interfaces or
casts.

### 4. Reuse canonical caller facts and principal-scoped data access

Workspace loaders/actions and authenticated widget loaders receive one
canonical caller shape shared with authenticated interface routes:

- actor ID and optional display name;
- resolved permission level; and
- Anchor status.

A truly public dashboard request receives `caller: null`; its entity reads are
restricted to public visibility. Each host resolves the browser session before
constructing the callback context. Authors never accept raw identity headers or
construct permission facts.

Every definition declares a minimum permission. An optional authorization
callback may only narrow that admission; it cannot elevate a caller below the
minimum. Entity access supplied to loaders/actions is automatically scoped to
the caller. The public context exposes typed `get`, `list`, and `search` by
entity-definition reference, with no unrestricted visibility override.

### 5. Use definition references within each capability

Author source references imported definitions, not stringly scoped names:

- workspace entity coverage uses entity definitions;
- workspace views reference workspace-action definitions;
- caller-filtered dynamic catalogs contain immutable entity/action definitions;
  and
- actions enqueue imported `defineJob()` definitions through a typed job
  context.

Dashboard widgets and CMS workspaces remain independent declarations. Neither
definition references, owns, discovers, or implicitly links to the other. If a
host later offers general navigation between installed surfaces, that is
host-owned navigation metadata rather than a widget/workspace authoring
contract.

The runtime resolves owning packages, scoped IDs, action routes, and execution
types within each capability.

### 6. Keep host presence optional

A service remains valid when Dashboard, CMS, or both are not composed. An
absent host causes no registration, callback execution, failure, or diagnostic.
A composed host rejects invalid or unsupported declarations with bounded,
actionable errors rather than silently degrading them.

Stable `0.2` will not add a required-host negotiation field. If a future package
cannot function without an operator host, that requirement should be a separate
capability/dependency decision rather than an author-controlled boot-order
switch.

### 7. Keep runtime and worker ownership private

The declarative service adapter registers operator contributions only in the
web runtime. Worker processes retain the same service jobs but do not register
widgets/workspaces or execute their providers. Author callbacks receive an
`AbortSignal`; the runtime owns cancellation, registration order, rollback,
unregistration, and shutdown.

Account settings still fail finalization without auth-service and its encryption
key because their durable secret contract cannot operate without that backend.
Dashboard and CMS declarations are inert when their respective host is absent.
When a host is composed, it either accepts the validated registration or
produces a bounded package/service/capability failure.

### 8. Per-account plugin settings are part of this contract

Settings remain part of this scope, but the accepted IMAP ownership proof means
the definition is not service-only. One `defineAccountSettings()` contract is
re-exported by the service and interface family entries. A service, generic
interface, or message interface may attach one schema of per-principal settings
(for example a user's
IMAP host, username, and password), with individual fields markable as
`secret`. This is distinct from instance config in `brain.yaml` — instance
config is deployment-owned; account settings belong to one authenticated
principal.

The runtime owns everything except the schema and the consuming callbacks:

- storage keyed by installed package, definition ID, and actor ID, with secret
  fields encrypted at rest;
- the settings surface itself, rendered as a host-owned Account form from the
  settings schema and bounded field metadata; it is not an `OperatorView` form;
- write-only secret semantics: the form shows whether a secret is set and
  accepts replacement, but never echoes the stored value;
- validation on save against the declared schema, with actionable errors;
- deletion of all settings and secrets when the account is removed; and
- strict injection boundaries: parsed settings reach only server-side plugin
  callbacks for that principal — never agent or model context, never browser
  responses, never logs.

Two of those boundaries are held by the types rather than by review. Every
schema field must carry a field declaration, so marking a credential `secret`
is a decision the author makes rather than an entry they can forget. The
settings value an operator callback receives omits every `secret` field:
widget, workspace, and action data can reach browser-facing results, so reading
a secret there is a compile error. Full principal settings remain confined to
the server-side `forAccounts` lifecycle callback that owns the connected
account.

For background work that acts on behalf of configured users (an IMAP listener
polling each connected mailbox), a supervised interface/message-interface
daemon binds to the account-settings definition with `forAccounts`. The runtime
starts one callback per principal with valid settings, the principal ID, parsed
settings, and an account-scoped abort signal, then replaces or cancels that task
when settings change or are removed. Request-scoped service callbacks receive
only the current principal's parsed settings; broad enumeration is not exposed
to ordinary
widget/workspace/action callbacks. Authors never touch identity storage,
enumerate users without settings, or manage per-account task maps.

## Proposed golden author experience

The supplemental operator package should be
`packages/brain-cli/test/fixtures/public-authoring/operator-surface`, published
in the fixture graph as `@fixture/reading-operator`. It remains a service-family
package and imports only `@rizom/brain/services` plus ordinary fixture package
dependencies. The IMAP ownership proof is a second supplemental fixture,
`account-settings-interface`, importing only `@rizom/brain/interfaces` plus its
ordinary transport dependency. It exists to prove the shared account-settings
contract and runtime-owned per-account connection reconciliation in the correct
package family rather than pretending a reading service owns inbound mail.

The source-first draft should read approximately like the following. This is a
shape sketch, not a frozen TypeScript snippet; the checked fixture becomes the
only copyable form.

```text
import bookmark and readingDigest definitions
import compileReadingDigest job definition
import defineCmsWorkspace, defineDashboardWidget,
       defineServicePlugin, defineWorkspaceAction, z
       from @rizom/brain/services

define refreshDigest action contract with input/output schemas

define readingWorkspace contract:
  local id, label, priority, trusted permission
  covered entities by definition reference
  one data schema
  expose refreshDigest action
  return a table/list OperatorView with typed row actions

define readingWidget contract:
  local id, title, group, placement, trusted permission
  one data schema
  derive digest and needs-attention from parsed data
  return status/list OperatorView

default export defineServicePlugin:
  one config schema
  dashboardWidgets binds readingWidget's loader using caller-scoped entities
  cmsWorkspaces binds readingWorkspace's loader and refreshDigest executor
```

The author must not write any of the following in that source:

- `pluginId` or package version;
- `rendererName`;
- registration/unregistration calls;
- dashboard/CMS messaging channels;
- all-plugins-ready listeners;
- dashboard/CMS route URLs;
- React/Preact/private UI imports;
- raw browser script/style strings;
- manually scoped action, entity, job, widget, or workspace names; or
- process-role branches.

The root reader Brain composes the new package with `use()` and adds it to the
existing reader bundle. Dashboard and CMS remain ordinary independently
composed host plugins; the contribution package does not embed or instantiate
them.

## Public contract shape

### Dashboard widget definition

The golden source should drive final generics, but the definition needs these
domain fields:

- local `id`;
- `title` and optional `description`;
- domain `group`;
- `placement`: primary, secondary, or sidebar;
- optional priority;
- minimum permission;
- data schema;
- async data loader receiving caller, typed entities/jobs, and signal;
- optional digest/attention derivation from parsed data; and
- `DashboardView` derivation from parsed data.

The definition contains no CMS workspace reference or management URL. Runtime
metadata—package ID, globally scoped widget ID, renderer selection, host assets,
and lifecycle token—is not accepted from authors.

### CMS workspace definition

The definition needs:

- local `id`;
- label and optional description;
- optional priority;
- minimum permission plus optional narrowing authorization;
- static coverage plus optional caller-filtered catalogs of typed entity/action
  definitions;
- data schema and optional query schema;
- async loader receiving parsed query state, caller, typed entities/jobs, and
  signal;
- immutable workspace-action definitions and typed catalog references; and
- `CmsWorkspaceView` derivation from parsed data and typed action references.

The CMS host parses and canonicalizes query state, owns URL updates, and reruns
the loader for server-side filters, sorting, paging, or selection. The runtime
owns plugin identity, URL/path generation, browser session trust, CSRF
protection, action routing, and host registration.

### Workspace action definition

Each action needs:

- local name;
- label;
- input and output schemas;
- optional minimum permission no lower than the workspace permission;
- optional static confirmation or prepared-confirmation binding; and
- execution receiving parsed input, canonical caller, typed entities/jobs, and
  signal.

Prepared confirmation returns a bounded semantic preview and a proof bound to
the caller, package/workspace/action, normalized input, relevant content
revision, expiry, and single use. The host verifies that proof before final
execution; a browser `confirmed: true` flag is never authority.

Actions are scoped beneath the workspace and package. They are not MCP tools and
do not become agent-visible unless the author separately declares a tool.

### Semantic view protocol

The public protocol is deeply JSON-native and contains no component type.
Shared primitive schemas normalize into typed Dashboard and CMS profiles.
Definition references in author callbacks become serializable scoped
capability/link descriptors before leaving the server.

The renderers must specify and test:

- deterministic block and layout ordering;
- stable empty/loading/error rendering;
- escaped text and validated links;
- bounded digest lines and non-negative attention counts;
- stable identity for rows, nodes, edges, pages, details, and dynamic catalog
  entries;
- host-owned query controls and canonical URL behavior;
- action labels, payloads, permission, availability, and confirmation behavior;
- equivalent semantic behavior for every inventoried built-in surface;
- responsive behavior in Dashboard and CMS; and
- theme-token use without requiring author CSS.

Do not freeze an open-ended JSON component tree. Every primitive must be
justified by the checked completeness inventory, represented in the public
fixture, and supported by the applicable host profile.

## Runtime adaptation

### Shared declarative adapters

Extend the internal declarative service plugin to normalize widget/workspace
definitions after setup state is ready. Add one family-neutral account-settings
adapter used by declarative service, generic-interface, and message-interface
definitions. The adapters may reuse current Dashboard, CMS, Account, and auth
internals, but public callbacks never receive those internals.

Registration order:

1. parse merged service config;
2. complete service setup;
3. collect and validate local widget/workspace/action definitions;
4. wait for runtime plugin finalization internally;
5. register CMS workspaces and Dashboard widgets independently with their
   respective hosts;
6. expose readiness only after required host-side registration attempts settle;
7. on failure, unregister acquired contributions in reverse order; and
8. unregister all contributions during shutdown.

Use emitted lifecycle/finalization signals, not sleeps. Iteration is bounded and
uses explicit `for...of` traversal.

### Account host

Add one authenticated package-settings list/form surface under Account. The
host derives controls from the declared schema plus bounded field metadata,
loads and writes settings only for the current principal, and shows secret
presence without returning secret values. The server owns CSRF/session checks,
encrypted persistence, validation errors, replacement semantics, account
removal cleanup, and task-reconciliation signals. Packages do not contribute
Account UI components, routes, or scripts.

For `forAccounts` daemons, the runtime aggregates task health without exposing
principal IDs or settings in public health details. One principal's failed
connection does not cancel healthy principals; required/optional daemon policy
still determines aggregate readiness.

### Dashboard host

Extend the shipped declarative renderer from the base `OperatorView` blocks to
the complete `DashboardView` profile. Normalize definitions into the host with
runtime-owned package identity and no author-selected renderer or asset.
Dashboard data loading continues to pass the canonical caller and combined
request/lifecycle abort signal.

Every current first-party Dashboard widget is a conformance case. In the
isolated implementation worktree, replace its private renderer registration
with the same definition/normalization path used by external authoring. Remove
the obsolete private component/script/style registration path before merge;
there is no transitional dual-renderer state on main.

### CMS host

Add the complete `CmsWorkspaceView` renderer to the CMS React app. The server
response carries only validated data, normalized semantic views, canonical
query descriptors, and allowed typed action descriptors.

Add lifecycle-complete CMS unregistration. Scope workspace keys by installed
package plus local workspace ID so unrelated external packages cannot collide.
Routes may use a runtime-safe scoped segment while displaying the local label.
In the isolated implementation worktree, replace all four current private CMS
renderer branches — Publishing, Site, Directory Sync, and Unified Inbox — with
the same public definition/normalization path and remove the renderer-name
allowlist before merge.

### Typed entity and job access

Implement one principal-scoped operator context shared by widget loaders,
workspace loaders, and actions:

- entity `get`, `list`, and `search` take entity definitions;
- runtime visibility is derived from caller permission/Anchor facts;
- query options allow narrowing but never widening visibility;
- job enqueue takes an imported job definition and inferred schema input;
- job ownership resolves through the existing definition binding; and
- worker execution, retry, deadlines, and progress remain unchanged.

Do not expose entity services, job queues, shell objects, database handles, or
host registries.

## Security requirements

- Dashboard resolves the optional session before constructing a provider
  context; unauthenticated public access receives `caller: null`.
- CMS requires an authenticated session and passes only its canonical caller.
- Minimum permission is checked before loaders, view derivation, digest
  derivation, or actions execute.
- Optional authorization can only narrow minimum permission.
- Entity reads are principal-scoped and visibility-safe.
- Provider/action output is schema-validated before serialization.
- Action input is schema-validated and bound to the workspace that rendered it.
- Static confirmation is host-rendered; prepared confirmation proofs are
  caller-, capability-, input-, revision-, expiry-, and single-use-bound.
- Existing CMS CSRF/session protections remain mandatory.
- Query state is schema-validated and canonicalized before loader execution.
- Operator text is escaped; no stable raw HTML, script, or style fields exist.
- Links reject unsafe protocols and cannot forge CMS action routes.
- Errors returned to browsers are bounded and do not include secrets or stacks.
- Shutdown and aborted requests cancel in-flight external callbacks.

## Error standard

Every author-correctable failure identifies:

1. installed package and local definition ID;
2. widget/workspace/action ID;
3. failing field or schema path; and
4. corrective action.

Focused tests cover:

- duplicate local IDs;
- a widget definition attempting to declare a CMS workspace reference or
  management URL;
- a view referencing an undeclared action;
- invalid data/action/view output;
- action permission lower than its workspace;
- unsafe links;
- host registration failure;
- absent Dashboard/CMS host producing no observable operator work;
- unsupported content for a present host profile;
- stale, replayed, expired, or caller-mismatched confirmation proofs; and
- cleanup failure without hiding the original registration error.

Unrelated packages may use the same local widget/workspace IDs because runtime
scoping prevents global collisions.

## Delivery phases

### Phase 0: source-first API validation

1. Add the supplemental standalone `operator-surface` golden package source,
   manifest, strict TypeScript config, and README section before runtime helpers
   exist.
2. Keep the source domain-led and free of all forbidden runtime vocabulary.
3. Draft the smallest `OperatorView` blocks needed by the example.
4. Port the then-current Directory Sync, Site, Publishing overview, and Email
   Triage workspaces as source sketches on the same API. This historical audit
   identified the initial missing capabilities but did not cover the later
   Unified Inbox workspace or the complete Dashboard inventory; Phase 4 now
   owns the superseding completeness audit.
5. Release scope is already decided: a `0.2.x` additive milestone, not a
   `v0.2.0` nomination gate.

Exit: the golden source and built-in ports stand unchanged as the target API,
with every unportable operation named.

### Phase 1: public schemas and inference

1. Add schema-first definition contracts and `define*` identity/validation
   helpers under `@brains/plugins` internals.
2. Curate only approved helpers/types through `@rizom/brain/services`.
3. Add the shared inferred `accountSettings` field to service, generic
   interface, and message-interface definitions; extend `defineServicePlugin()`
   with `dashboardWidgets` and `cmsWorkspaces` callbacks that bind module-scope
   definitions to inferred config/state/account-settings types.
4. Prove config/setup-state, schema input/output, caller, entity, job, action,
   current-principal settings, account-bound daemon callback, and view
   inference without casts. Supervision behavior remains Phase 2.
5. Add every export to `export-ledger.json`; stable classification requires the
   approved consumer fixture.
6. Verify generated declarations contain no private workspace, UI, shell,
   database, or queue types.

Exit: the golden package typechecks against generated local declarations.

### Phase 2: account settings runtime

**Shipped in PR #132.** The implementation uses one app-scoped
account-settings registry, an auth-DB backend with AES-GCM authenticated
encryption keyed by the deployment-provided
`ACCOUNT_SETTINGS_ENCRYPTION_KEY`, redacted Account form descriptors, and
runtime-owned per-principal daemon reconciliation. The runtime fails
finalization when a package declares account settings without the auth
backend/key rather than silently dropping the capability.

Settings ship first: they are the thinnest slice through every novel layer —
per-principal storage, secret handling, the schema-derived form, and
caller-scoped injection — they carry the highest-risk contract (secrets at
rest), and they deliver standalone value with no presentation dependency: a
user can connect an IMAP mailbox before any widget or workspace exists. The
later capabilities reuse the form renderer and principal-scoped context proven
here.

1. Implement per-principal settings storage keyed by installed package,
   definition ID, and actor ID, with secret fields encrypted at rest.
2. Render the host settings form from the declared schema, with write-only
   secret semantics.
3. Validate on save and retain principal-scoped lookup for the later
   Dashboard/CMS request hosts; Phase 2 injects full values only into the
   server-side `forAccounts` callback for that principal.
4. Implement runtime-owned per-account supervision for interface/message-
   interface daemons bound with `forAccounts`; additions, removals, and
   replacements reconcile without restart and without author-owned task maps.
5. Delete settings and secrets with account removal.
6. Prove isolation: no cross-principal request reads, no automatic secrets in
   agent context, browser responses, or logs.

Branch evidence: focused service/interface fixtures store, validate, isolate,
and reconcile per-account settings; the interface-owned lifecycle proves
encrypted-at-rest, write-only secret handling. Packed standalone evidence
remains Phase 5, and request-scoped service injection remains host-owned work in
Phases 3–4.

### Phase 3: dashboard runtime

**Shipped in `f25b2017d` and released in the `0.2.0-alpha.293` line.**

1. Runtime-owned finalization registers declarative widgets only after service
   setup, rolls back partial acquisition, unregisters in reverse order, and
   aborts in-flight providers during shutdown.
2. The Dashboard route resolves the optional session and passes the canonical
   caller plus the request signal; the adapter combines request and service
   lifecycle cancellation.
3. Provider data, digest/attention output, semantic views, links, bounds, and
   row identities are validated before rendering or serialization.
4. One host-owned renderer covers every Dashboard placement without exposing
   built-in renderer names, components, scripts, styles, or private assets.
5. Entity reads derive visibility from the canonical caller, settings are
   secret-redacted, jobs resolve through typed definitions, and minimum
   permission is checked before provider execution.
6. Focused evidence covers authenticated caller propagation, public/trusted/
   admin filtering, safe escaped HTML, safe links, missing-host inert behavior,
   host rejection rollback, cancellation, shutdown cleanup, and execution-only
   worker exclusion.

Exit: an in-tree declarative service renders through the running Dashboard
without private imports or author lifecycle code. Packed standalone evidence is
intentionally Phase 5 so the Dashboard and CMS capabilities are exercised in
one isolated consumer.

### Phase 4: complete semantic protocol and CMS runtime

Implementation occurs in one isolated worktree based on this plan. No partial
renderer transition lands on main: main sees one merge, after slice 4g.

Inside the worktree the work is sliced vertically. Each slice after 4a converts
real surfaces end to end — definition, normalization, host rendering, and proof
— and extends the closed vocabulary only by what those surfaces demand.
Converted surfaces run through the public path from the slice that converts
them; unconverted ones keep their private renderer until their turn.

**4a — Inventory.** Replace the historical four-workspace sketch with a checked
inventory of every current operator surface.

- Dashboard entries: Agent Network, Agent Proximity, Skills, SWOT, Open Action
  Items, Conversation Memory Coverage, Recent Decisions, Recent Conversation
  Memory, Topics, Knowledge Map, Top Wishes, Publication Pipeline, Email
  Triage, Site Health, and Inbox.
- CMS entries: Directory Sync, Site, Publishing, and Unified Inbox. The retired
  Email Triage renderer is a negative compatibility test, not a current
  workspace.
- For each entry record its information, interactions, query behavior, dynamic
  catalogs, authorization, confirmation, navigation, responsive semantics, and
  accessibility behavior. Visual implementation details do not become author
  fields.

Exit: every entry has a recorded capability profile and the slice assignment
below.

**4b — Walking skeleton.** Take the public reading fixture's Dashboard widget
and CMS workspace through the public definition and normalization path. Add
package-scoped CMS registration/unregistration and the base
`CmsWorkspaceView` React renderer while preserving authenticated actor
derivation and CSRF.

Exit: the public widget and workspace render, act, unregister, and restart
through supported host behavior using only the shipped base vocabulary.

**4c — Collections, composition, and host launches.** Extend row annotations,
tabs, local filters, matrix presentation, semantic grouping, and typed
host-owned launch intents. Convert Skills, SWOT, Agent Network, Open Action
Items, Conversation Memory Coverage, Recent Decisions, Recent Conversation
Memory, Topics, Top Wishes, Publication Pipeline, Email Triage, Site Health,
and Inbox.

Exit: every non-spatial Dashboard widget uses the public path; no converted
widget supplies a component, script, stylesheet, renderer name, or raw internal
route.

**4d — Spatial presentation.** Add only the normalized Cartesian/radial map,
zone, cluster, relationship, legend, selection, and accessible-detail semantics
demonstrated by Knowledge Map and Agent Proximity. Convert both widgets.

Exit: every Dashboard widget uses the public path, including the two spatial
surfaces, without author SVG, CSS, or browser script.

**4e — Operational CMS foundations.** Convert Directory Sync and Site. Add the
semantic grouping, directional flow, meter, active-progress, conditional typed
action, typed entity link, and host-owned static-confirmation behavior those
workspaces demonstrate.

Exit: both operational workspaces render and act through the public CMS path
with equivalent information, authorization, feedback, and responsive reading
order.

**4f — Server state, dynamic catalogs, and prepared confirmation.** Convert
Unified Inbox and Publishing. Add typed canonical query state for server
filtering, sorting, paging, append/reset, selection, dynamic facets, and deep
links; caller-filtered catalogs of immutable typed entity/action/launch
definitions; master/detail behavior; destination-scoped reordering; and
host-owned prepared confirmation with stale-content, replay, caller,
capability, input, revision, and expiry checks.

Exit: both dynamic workspaces render, query, navigate, confirm, and act through
typed public contracts without opaque commands, entity-type strings, or
resolved author hrefs.

**4g — Close out the private paths.** With every inventoried surface converted,
remove private Dashboard component/asset registration and CMS renderer-name
branching, then prove the cross-cutting properties against the whole converted
set:

1. denied callers cannot discover workspace coverage, fetch data, prepare
   confirmations, or execute actions;
2. workers never register or invoke operator callbacks;
3. absent Dashboard/CMS hosts produce no registration, callback, failure, or
   diagnostic, while present hosts fail loudly on invalid content.

Exit: all current built-ins and the public fixture run through one semantic
contract; CMS lists, loads, queries, renders, confirms, acts, unregisters, and
restarts through public HTTP behavior; no private renderer exception remains.

### Phase 5: packed integration evidence

Add `packages/brain-cli/test/public-authoring-operator-packed.test.ts` and an
isolated consumer containing both supplemental fixtures. The test must:

1. build and pack local Brain plus every fixture dependency;
2. install the consumer outside the monorepo;
3. start the app with Account, Dashboard, and CMS enabled;
4. create reading entities through public tools;
5. exercise an anonymous public request plus authenticated trusted and admin
   actors through supported app flows;
6. save settings for two test principals, prove encrypted persistence and
   write-only secret responses, rotate one secret, and remove the other;
7. observe one account-bound interface task per configured principal, task
   replacement on rotation, cancellation on removal, and no secret-bearing
   health/log output;
8. assert widget visibility, validated data, digest, attention, placement, and
   at least one extended Dashboard-profile primitive;
9. assert the widget has no CMS workspace coupling or management URL;
10. assert workspace descriptors and dynamic catalogs do not leak to denied
    actors;
11. load the workspace through canonical typed query state, page or select its
    server-side data, and execute a typed action;
12. prepare and complete a revision-bound confirmation, then reject stale,
    replayed, expired, unauthorized, or caller-mismatched proofs without
    invoking final execution;
13. reject invalid query/action/view/catalog data with bounded diagnostics;
14. enqueue a referenced durable job and observe its result through public
    status behavior;
15. restart and prove definitions and settings re-register once without
    duplicates;
16. shut down and prove providers/actions/account tasks stop and registrations
    are removed;
17. start a worker and prove operator providers never register or execute; and
18. boot without Account/Dashboard/CMS and prove the definitions remain healthy
    while producing no registration, callback, failure, or diagnostic for the
    absent hosts.

Use readiness signals and bounded polling with diagnostics. The matrix is
hermetic; no provider credential or model call is needed.

### Phase 6: documentation alignment

1. Publish the Phase 4 completeness inventory and link every current built-in
   conformance case to checked source and runtime evidence.
2. Update `docs/external-plugin-authoring.md` with the golden source flow and
   the host-profile semantic boundary.
3. Update `docs/plugin-quick-reference.md`, `docs/plugin-system.md`, and the
   golden README.
4. Keep the current built-in-only notice in `docs/feature-overview.md` until
   packed evidence passes; then replace it with the proven external contract
   and stable authoring documentation.
5. Update the stable symbol ledger and migration guide.
6. Make every TypeScript documentation example originate from or compile with
   checked fixture source.

Exit: docs, fixture source, declarations, and runtime behavior describe one
contract.

### Phase 7: additive `0.2.x` release gates

For the `0.2.x` release that ships this contract:

1. run focused shell/plugins, Dashboard, CMS, app, and brain-cli typechecks,
   lint, and tests;
2. run architecture and public-package-boundary checks;
3. run all existing public-authoring packed suites plus the operator suite;
4. complete authorization/error diagnostics and the documentation inventory;
5. run the full acceptance sweep and personal/team evals;
6. add a changeset only after the contract is accepted;
7. obtain explicit approval before any merge that triggers alpha publication;
8. nominate and publish an exact Brain patch prerelease through the reviewed
   release lane;
9. preserve the original six fixtures' stable `>=0.2.0 <0.3.0` lower bound,
   while setting both supplemental fixtures' lower bounds to the first version
   containing this contract;
10. rerun the exact registry matrix against the nominated candidate with all
    eight fixtures; and
11. perform no prerelease exit, stable publication, dist-tag mutation, or
    workflow dispatch without separate explicit authorization.

No Site SDK change or publication is implied unless implementation discovers a
real cross-package contract need; the recommended design intentionally avoids
one.

## Validation matrix

| Layer              | Required evidence                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| Definition helpers | IDs, duplicate references, schema/query inference, permission monotonicity, immutable definitions           |
| Account settings   | schema/form inference, encrypted secrets, write-only reads, per-account supervision, removal                |
| Service adapter    | config/state inference, registration order, rollback, cleanup, silent host absence, worker exclusion        |
| Semantic protocol  | complete built-in inventory, host profiles, closed primitives, typed catalogs, no private renderer escapes  |
| Dashboard          | caller filtering, data/view validation, digest/attention, placement, graphs/matrices, escaped safe output   |
| CMS                | descriptor privacy, query canonicalization, actions, prepared confirmation, CSRF, unregister/restart        |
| Entity access      | typed definitions, list/search/get inference, visibility narrowing, denied reads                            |
| Job access         | cross-package typed enqueue, durable execution, validated result, no execution in UI callback               |
| Package boundary   | one public family import per fixture, clean declarations, tarball install, no private/UI leaks              |
| Documentation      | source-backed examples, host-profile boundary, symbol ledger completeness                                   |
| Runtime            | packed app behavior, account isolation, readiness, restart, shutdown, silent host absence, bounded failures |

## Acceptance criteria

1. The supplemental service and interface golden packages are approved as the
   operator-surface and account-lifecycle references.
2. Author source imports one public family entry point and no `@brains/*`, UI
   library, React/Preact, direct Zod, manifest, or runtime class.
3. Authors declare no plugin/package identity, renderer names, routes,
   registration, messaging, or process behavior.
4. Widget/workspace/action contracts are declared once at module scope and bind
   their inferred executors once per plugin instance after setup.
5. Widget/workspace query state and data are parsed before loader, digest, or
   view execution.
6. Action input/output is parsed around preparation/execution, prepared proofs
   are caller/capability/input/revision/expiry/single-use bound, and permission
   is monotonic.
7. Canonical caller facts come from authenticated host sessions, while truly
   public dashboard requests receive a null caller and public-only entity
   scope.
8. Entity reads are definition-based and principal-scoped.
9. Job enqueue is definition-based and crosses the existing durable worker
   boundary.
10. Workspace view-to-action relationships and dynamic catalogs use immutable
    definition references, while widgets and workspaces have no
    cross-definition relationship.
11. One JSON-native semantic protocol with typed Dashboard/CMS profiles renders
    without author-supplied scripts, styles, components, or renderer names.
12. Dashboard visibility and CMS descriptor/data/action access are proven for
    public, trusted, and admin actors.
13. Package scoping prevents cross-package ID collisions; duplicate local IDs
    produce actionable diagnostics.
14. Registration order, rollback, unregistration, restart, and shutdown are
    runtime-owned.
15. Contributions are web-only; absent hosts cause no registration, callback,
    failure, or diagnostic.
16. Generated declarations contain no private workspace, UI, shell, database,
    queue, or effect types.
17. Packed local and exact-registry consumers exercise both capabilities
    outside the monorepo.
18. Every stable export is classified in the ledger and every documentation
    example is fixture-backed or compile-checked.
19. The feature overview remains explicit about built-in-only support until
    packed external evidence passes, then links to the shipped public contract.
20. No stable release action occurs without the existing explicit nomination
    and authorization gates.
21. Per-account settings store schema-validated values with encrypted secrets;
    the form is host-rendered and write-only for secrets; current-principal
    settings and interface-owned account-bound daemon callbacks remain
    server-side; settings are isolated per principal and deleted with the
    account.
22. Every settings schema field carries a field declaration, and a compile-check
    proves a widget, workspace, or action cannot read a field declared `secret`.
23. Account-settings declarations fail without auth-service and its encryption
    key; Dashboard and CMS declarations remain healthy and produce no
    observable operator work when their respective host is absent.
24. Every Dashboard widget and CMS workspace listed in the Phase 4 inventory
    runs through the public definition and semantic normalization path with
    equivalent information, interaction, authorization, and accessibility
    behavior.
25. No private component/asset registration, CMS renderer-name allowlist,
    generic DOM/CSS escape hatch, opaque action command, or permanent built-in
    renderer exception remains.

## Risks and mitigations

- **The semantic protocol becomes a second UI framework.** Keep a closed,
  discriminated vocabulary justified by the complete checked inventory; reject
  generic DOM, CSS, arbitrary layout, and author browser-code escape hatches.
- **Private renderer paths survive beside the public contract.** Make every
  current built-in a running conformance case and remove private component,
  asset, and renderer-name dispatch before the implementation branch merges.
- **Dashboard data leaks across permissions.** Authenticate first, pass the
  canonical caller, scope entity reads, and execute providers only after
  minimum permission checks.
- **Dynamic CMS actions become an untyped RPC surface.** Require immutable typed
  definitions in caller-filtered catalogs, input/output schemas, workspace
  binding, CSRF, permission checks, prepared-proof validation, and bounded
  errors.
- **Operator callbacks accidentally execute in workers.** Derive web-only
  inventory from declarative fields and assert worker exclusion in packed
  tests.
- **Registration timing leaks back to authors.** Collect definitions and wait on
  runtime finalization internally; reject author-facing ready-event hooks.
- **Rich UI pressure recreates a component escape hatch.** Extend only audited
  host-rendered semantic primitives; do not route authors to `@rizom/brain-ui`
  components or use a later custom-UI promise to waive a current completeness
  case.
- **The feature delays `0.2` indefinitely.** Scope is already fixed outside
  `v0.2.0`; Phase 0 approval covers only the API shape. Stable `v0.2.0` ships on
  the frozen surface and this lands additively afterward rather than gating
  nomination or waiting for `0.3`.

## Explicit non-goals

- admitting `@rizom/brain-ui` (formerly `@brains/ui-library`) components as an
  operator-authoring input — its separate publication is decided in
  [`npm-package-boundaries.md`](./npm-package-boundaries.md) and grants the
  operator contract nothing;
- arbitrary external React/Preact component loading;
- raw HTML, CSS, or JavaScript injection in stable operator definitions;
- replacing the Dashboard or CMS host packages;
- exposing their registries or messaging protocols;
- making workspace actions agent-visible automatically;
- running operator providers in workers;
- preserving private renderer names as public compatibility aliases; or
- author-controlled package IDs, scoped capability names, routes, or lifecycle
  ordering.

## Related work

- [Public authoring API `0.2`](./public-authoring-api-0.2.md)
- [NPM package boundaries and public UI decision](./npm-package-boundaries.md)
- [External package authoring](../external-plugin-authoring.md)
- [Golden public-authoring packages](../../packages/brain-cli/test/fixtures/public-authoring/README.md)
