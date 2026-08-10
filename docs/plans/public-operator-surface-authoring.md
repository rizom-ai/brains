# Plan: Public dashboard-widget and CMS-workspace authoring

## Status

**Approved as a `0.2.x` additive milestone (scope decided 2026-08-10).**
Dashboard widgets and CMS workspaces exist for built-in packages, but external
declarative packages cannot author either capability without importing private
`@brains/*` contracts. No implementation, publication, workflow dispatch, or
stable-release action is authorized by this plan.

Scope: this plan does **not** gate `v0.2.0`. Stable nomination proceeds on the
current frozen surface. The design is purely additive — optional
`defineServicePlugin` fields and new `define*` exports — which the frozen
compatibility rule explicitly permits with an updated ledger and compatibility
fixture; delivery lands in a later `0.2.x` release through the same
golden-source-first process and nomination-style gates. A `0.3` deferral would
only become necessary if implementation discovers a breaking change, which the
design intentionally avoids.

`docs/feature-overview.md` no longer implies external plugins can already
provide these capabilities; that correction shipped with this scope decision.

## Goal

An author in a standalone package can contribute a dashboard widget and a CMS
workspace using domain schemas, typed entity/job references, canonical caller
facts, and plain render data. Author source does not mention plugin IDs,
registries, messaging channels, renderer names, package metadata, process
roles, internal UI components, or lifecycle timing.

The minimum useful outcome is:

- per-account plugin settings with schema-validated fields, encrypted secrets,
  a host-rendered form, principal-scoped injection, and typed
  configured-accounts enumeration (the IMAP-connection case end to end);
- one dashboard widget with schema-validated data, placement, permission,
  digest/attention state, and an optional typed link to a CMS workspace;
- one CMS workspace with schema-validated data, entity coverage, canonical
  caller access, typed actions, and a runtime-owned URL;
- one JSON-native presentation contract rendered by both first-party hosts;
- one supplemental standalone golden service package that compiles, packs,
  installs, boots, renders, authorizes, acts, restarts, and shuts down outside
  the monorepo.

## Audited gap

| Capability       | Current built-in path                                                                                      | Why it is not a public authoring contract                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Dashboard widget | Private `context.dashboard.registerWidget()` and `DashboardWidgetRegistration`                             | Requires private context/types, string `rendererName`, registration timing, and optional UI objects |
| CMS workspace    | Private `registerCmsWorkspace()` over `cms:register-workspace` messaging                                   | Requires private messaging/types, author-supplied plugin ID, and a first-party renderer allowlist   |
| Dashboard UI     | `@brains/ui-library` component plus optional raw client style/script strings                               | Private UI dependency and unstable rendering implementation                                         |
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

The exact field names freeze only after the golden source is reviewed by Jo and
Niels. There will still be one preferred declarative path and one family import.

### 2. Expose semantic presentation, not private UI

Do not export `@brains/ui-library`, React/Preact implementation components,
`rendererName`, arbitrary component values, or raw client scripts as the stable
path. Both hosts consume a small JSON-native `OperatorView` document.

The initial view vocabulary should cover only proven needs:

- status/stat rows;
- notices;
- lists;
- tables;
- links; and
- action controls referencing typed workspace-action definitions.

Text is escaped by the host. Links are validated. Action controls carry
schema-validated payloads and definition references; authors do not construct
route URLs or action IDs. Dashboard and CMS own responsive markup, theme
integration, loading/error states, and browser behavior.

A richer custom-component API may later ship as an exact-version advanced
surface after the separate public UI decision in
[NPM package boundaries](./npm-package-boundaries.md). It is not required to
make the stable schema-driven path useful and must not delay it by publishing
the private UI library as-is.

### 3. Declare each schema once

Each widget declares one data schema. Its loader returns schema input; digest
and view callbacks receive parsed schema output.

Each workspace declares one data schema. Each action declares its input and
output schemas. The runtime validates:

1. provider output before serialization;
2. action input before execution;
3. action output before returning it to the browser; and
4. the generated `OperatorView` before rendering.

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

### 5. Use definition references across capabilities

Author source references imported definitions, not stringly scoped names:

- workspace entity coverage uses entity definitions;
- widget management links reference a workspace definition;
- view actions reference workspace-action definitions; and
- actions enqueue imported `defineJob()` definitions through a typed job
  context.

The runtime resolves owning packages, scoped IDs, routes, and execution types.
A dashboard widget can remain visible when its linked CMS host is absent; the
runtime simply omits the unavailable management link.

### 6. Keep host presence optional

A service remains valid when Dashboard, CMS, or both are not composed. Operator
contributions are inert in an absent host and emit bounded diagnostics at debug
level. Provider callbacks do not execute without the corresponding host.

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

### 8. Per-account plugin settings are part of this contract

A service may declare `accountSettings` on `defineServicePlugin()`: one schema
of per-principal settings (for example a user's IMAP host, username, and
password for a mail integration), with individual fields markable as `secret`.
This is distinct from instance config in `brain.yaml` — instance config is
deployment-owned; account settings belong to one authenticated principal.

The runtime owns everything except the schema and the consuming callbacks:

- storage keyed by installed package, service ID, and actor ID, with secret
  fields encrypted at rest;
- the settings surface itself, rendered from the schema as a host form —
  which is why schema-derived input forms are part of the v1 view vocabulary;
- write-only secret semantics: the form shows whether a secret is set and
  accepts replacement, but never echoes the stored value;
- validation on save against the declared schema, with actionable errors;
- deletion of all settings and secrets when the account is removed; and
- strict injection boundaries: parsed settings reach only server-side plugin
  callbacks for that principal — never agent or model context, never browser
  responses, never logs.

For background work that acts on behalf of configured users (an IMAP listener
polling each connected mailbox), the service receives a typed accounts
enumeration: iterate principals that have valid settings, receiving each
principal's parsed settings server-side. Authors never touch identity storage,
never enumerate users without settings, and never see another principal's
secrets in a per-principal callback.

## Proposed golden author experience

The supplemental package should be
`packages/brain-cli/test/fixtures/public-authoring/operator-surface`, published
in the fixture graph as `@fixture/reading-operator`. It remains a service-family
package and imports only `@rizom/brain/services` plus ordinary fixture package
dependencies.

The source-first draft should read approximately like the following. This is a
shape sketch, not a frozen TypeScript snippet; the checked fixture becomes the
only copyable form.

```text
import bookmark and readingDigest definitions
import compileReadingDigest job definition
import defineCmsWorkspace, defineDashboardWidget,
       defineServicePlugin, defineWorkspaceAction, z
       from @rizom/brain/services

define refreshDigest action with input/output schemas

define readingWorkspace:
  local id, label, priority, trusted permission
  covered entities by definition reference
  one data schema
  load parsed bookmark/digest rows using caller-scoped entities
  expose refreshDigest action
  return a table/list OperatorView with typed row actions

define readingWidget:
  local id, title, group, placement, trusted permission
  one data schema
  load counts using caller-scoped entities
  derive digest and needs-attention from parsed data
  return status/list OperatorView
  link to readingWorkspace by definition reference

default export defineServicePlugin:
  one config schema
  dashboardWidgets returns readingWidget
  cmsWorkspaces returns readingWorkspace
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
- optional digest/attention derivation from parsed data;
- view derivation from parsed data; and
- optional workspace-definition reference.

Runtime metadata—package ID, globally scoped widget ID, renderer selection,
host assets, lifecycle token, and management URL—is not accepted from authors.

### CMS workspace definition

The definition needs:

- local `id`;
- label and optional description;
- optional priority;
- minimum permission plus optional narrowing authorization;
- covered entity definitions, optionally filtered for the canonical caller;
- data schema;
- async loader receiving caller, typed entities/jobs, and signal;
- a record/array of workspace-action definitions; and
- view derivation from parsed data and typed action references.

The runtime owns plugin identity, URL/path generation, browser session trust,
CSRF protection, action routing, and host registration.

### Workspace action definition

Each action needs:

- local name;
- label and optional confirmation text;
- input and output schemas;
- optional minimum permission no lower than the workspace permission; and
- execution receiving parsed input, canonical caller, typed entities/jobs, and
  signal.

Actions are scoped beneath the workspace and package. They are not MCP tools and
do not become agent-visible unless the author separately declares a tool.

### Operator view document

The public view contract is deeply JSON-native and contains no component type.
Definition references in author callbacks are normalized into serializable
scoped action/link descriptors before leaving the server.

The initial renderer must specify and test:

- deterministic block ordering;
- stable empty/loading/error rendering;
- escaped text and validated links;
- bounded digest lines and non-negative attention counts;
- list/table row identity;
- action label, tone, payload, and confirmation behavior;
- responsive behavior in Dashboard and CMS; and
- theme-token use without requiring author CSS.

Do not freeze an open-ended JSON component tree. Add only blocks used by the
reading golden package and at least one real built-in operator surface.

## Runtime adaptation

### Shared declarative adapter

Extend the internal declarative service plugin to normalize widget/workspace
definitions after setup state is ready. The adapter may reuse current Dashboard
and CMS internals, but public callbacks never receive those internals.

Registration order:

1. parse merged service config;
2. complete service setup;
3. collect and validate local widget/workspace/action definitions;
4. wait for runtime plugin finalization internally;
5. register CMS workspaces first so workspace URLs can resolve;
6. register dashboard widgets and any available workspace links;
7. expose readiness only after required host-side registration attempts settle;
8. on failure, unregister acquired contributions in reverse order; and
9. unregister all contributions during shutdown.

Use emitted lifecycle/finalization signals, not sleeps. Iteration is bounded and
uses explicit `for...of` traversal.

### Dashboard host

Add one private generic renderer for public declarative widgets. Normalize the
public definition into the existing registry with runtime-owned plugin ID and
renderer selection. Extend dashboard data loading to pass the canonical caller
and abort signal instead of invoking external providers without principal
context.

Keep current first-party component renderers private. The public adapter does
not expose their names and does not accept the deprecated internal
`needsOperator` spelling.

### CMS host

Add one private generic declarative workspace renderer to the CMS React app.
The server response carries only validated data, normalized `OperatorView`, and
allowed action descriptors.

Add lifecycle-complete CMS unregistration. Scope workspace keys by installed
package plus local workspace ID so unrelated external packages cannot collide.
Routes may use a runtime-safe scoped segment while displaying the local label.
Existing first-party renderer names remain private implementation details and
are not accepted by the public helper.

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
- Existing CMS CSRF/session protections remain mandatory.
- Operator text is escaped; no stable raw HTML, script, or style fields exist.
- Links reject unsafe protocols and cannot forge CMS action routes.
- Errors returned to browsers are bounded and do not include secrets or stacks.
- Shutdown and aborted requests cancel in-flight external callbacks.

## Error standard

Every author-correctable failure identifies:

1. installed package and local service ID;
2. widget/workspace/action ID;
3. failing field or schema path; and
4. corrective action.

Focused tests cover:

- duplicate local IDs;
- a widget referencing a workspace outside the package definition;
- a view referencing an undeclared action;
- invalid data/action/view output;
- action permission lower than its workspace;
- unsafe links;
- host registration failure;
- missing optional Dashboard/CMS host; and
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
4. Port all four built-in workspaces (DirectorySync, Site, Publishing overview,
   EmailTriage) as source sketches on the same API. Each port either expresses
   the workspace's real operations or names the exact missing capability. This
   is the solidity test: the API freezes only when the golden source plus the
   ports prove it, and any block the ports demand — such as a schema-derived
   input form if EmailTriage's operations require user-entered parameters —
   is added here by demonstrated need, not speculation.
5. Release scope is already decided: a `0.2.x` additive milestone, not a
   `v0.2.0` nomination gate.

Exit: the golden source and built-in ports stand unchanged as the target API,
with every unportable operation named.

### Phase 1: public schemas and inference

1. Add schema-first definition contracts and `define*` identity/validation
   helpers under `@brains/plugins` internals.
2. Curate only approved helpers/types through `@rizom/brain/services`.
3. Extend `defineServicePlugin()` with inferred `accountSettings`,
   `dashboardWidgets`, and `cmsWorkspaces` callbacks.
4. Prove config/setup-state, schema input/output, caller, entity, job, action,
   settings, and view inference without casts.
5. Add every export to `export-ledger.json`; stable classification requires the
   approved consumer fixture.
6. Verify generated declarations contain no private workspace, UI, shell,
   database, or queue types.

Exit: the golden package typechecks against generated local declarations.

### Phase 2: account settings runtime

Settings ship first: they are the thinnest slice through every novel layer —
per-principal storage, secret handling, the schema-derived form, and
caller-scoped injection — they carry the highest-risk contract (secrets at
rest), and they deliver standalone value with no presentation dependency: a
user can connect an IMAP mailbox before any widget or workspace exists. The
later capabilities reuse the form renderer and principal-scoped context proven
here.

1. Implement per-principal settings storage keyed by installed package,
   service ID, and actor ID, with secret fields encrypted at rest.
2. Render the host settings form from the declared schema, with write-only
   secret semantics.
3. Validate on save; inject parsed settings into the calling principal's
   server-side callbacks only.
4. Implement the typed configured-accounts enumeration for daemon/worker use.
5. Delete settings and secrets with account removal.
6. Prove isolation: no cross-principal reads, no secrets in agent context,
   browser responses, or logs.

Exit: a packed service stores, validates, injects, and enumerates per-account
settings — the IMAP case works end to end — with secrets provably contained.

### Phase 3: dashboard runtime

1. Add runtime-owned registration/finalization/rollback around declarative
   widgets.
2. Pass canonical caller and signal to providers.
3. Validate data, digest, attention, and view output.
4. Render the generic widget in all supported placements.
5. Prove permission filtering and absence-host behavior.
6. Prove web-only registration and worker exclusion.

Exit: a packed widget renders through the running Dashboard without private
imports or author lifecycle code.

### Phase 4: CMS runtime

1. Add package-scoped declarative workspace registration and unregistration.
2. Add the generic React workspace renderer for `OperatorView`.
3. Preserve authenticated actor derivation and CSRF protection.
4. Validate workspace data and action input/output.
5. Resolve typed entity coverage and workspace links.
6. Prove denied callers cannot discover workspace coverage, fetch data, or run
   actions.

Exit: a packed workspace lists, loads, renders, acts, unregisters, and restarts
through public HTTP behavior.

### Phase 5: packed integration evidence

Add `packages/brain-cli/test/public-authoring-operator-packed.test.ts` and an
isolated consumer. The test must:

1. build and pack local Brain plus every fixture dependency;
2. install the consumer outside the monorepo;
3. start the app with Dashboard and CMS enabled;
4. create reading entities through public tools;
5. exercise an anonymous public request plus authenticated trusted and admin
   actors through supported app flows;
6. assert widget visibility, validated data, digest, attention, placement, and
   workspace link;
7. assert workspace descriptors do not leak to denied actors;
8. load the workspace and execute a typed action;
9. reject invalid/unauthorized actions without invoking the handler;
10. enqueue a referenced durable job and observe its result through public
    status behavior;
11. restart and prove definitions re-register once without duplicates;
12. shut down and prove providers/actions stop and registrations are removed;
13. start a worker and prove operator providers never register or execute; and
14. boot without Dashboard/CMS and prove the service remains healthy.

Use readiness signals and bounded polling with diagnostics. The matrix is
hermetic; no provider credential or model call is needed.

### Phase 6: built-in and documentation alignment

1. Land the Phase 0 built-in ports as running adaptations through the same
   semantic normalization path; any workspace whose Phase 0 port named a
   missing capability keeps its specialized private renderer with that reason
   recorded next to it.
2. Update `docs/external-plugin-authoring.md` with the golden source flow and
   clear stable/advanced UI boundaries.
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
4. complete acceptance-criterion 12 diagnostics and criterion-15 documentation
   inventory;
5. run the full criterion-17 sweep and personal/team evals;
6. add a changeset only after the contract is accepted;
7. obtain explicit approval before any merge that triggers alpha publication;
8. nominate and publish an exact Brain patch prerelease through the reviewed
   release lane;
9. preserve the original six fixtures' stable `>=0.2.0 <0.3.0` lower bound,
   while setting the supplemental operator fixture's lower bound to the first
   version containing this contract;
10. rerun the exact registry matrix against the nominated candidate with all
    seven fixtures; and
11. perform no prerelease exit, stable publication, dist-tag mutation, or
    workflow dispatch without separate explicit authorization.

No Site SDK change or publication is implied unless implementation discovers a
real cross-package contract need; the recommended design intentionally avoids
one.

## Validation matrix

| Layer              | Required evidence                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| Definition helpers | IDs, duplicate references, schema inference, permission monotonicity, immutable definitions        |
| Service adapter    | config/state inference, registration order, rollback, cleanup, host absence, worker exclusion      |
| Dashboard          | caller filtering, data/view validation, digest/attention, placement, escaped output, safe links    |
| CMS                | descriptor privacy, caller access, data/action validation, CSRF, scoped routes, unregister/restart |
| Entity access      | typed definitions, list/search/get inference, visibility narrowing, denied reads                   |
| Job access         | cross-package typed enqueue, durable execution, validated result, no execution in UI callback      |
| Package boundary   | one public family import, clean declarations, tarball install, no private/UI leaks                 |
| Documentation      | source-backed examples, stable/advanced distinction, symbol ledger completeness                    |
| Runtime            | packed app behavior, readiness, restart, shutdown, host absence, bounded diagnostics               |

## Acceptance criteria

1. The supplemental golden package is approved as the primary operator-surface
   reference.
2. Author source imports one public family entry point and no `@brains/*`, UI
   library, React/Preact, direct Zod, manifest, or runtime class.
3. Authors declare no plugin/package identity, renderer names, routes,
   registration, messaging, or process behavior.
4. Widget/workspace/action schemas are declared once and infer every callback.
5. Widget and workspace data is parsed before digest/view rendering.
6. Action input/output is parsed around execution and permission is monotonic.
7. Canonical caller facts come from authenticated host sessions, while truly
   public dashboard requests receive a null caller and public-only entity
   scope.
8. Entity reads are definition-based and principal-scoped.
9. Job enqueue is definition-based and crosses the existing durable worker
   boundary.
10. Widget-to-workspace and view-to-action relationships use definition
    references.
11. One JSON-native presentation contract renders in Dashboard and CMS without
    author-supplied scripts or private components.
12. Dashboard visibility and CMS descriptor/data/action access are proven for
    public, trusted, and admin actors.
13. Package scoping prevents cross-package ID collisions; duplicate local IDs
    produce actionable diagnostics.
14. Registration order, rollback, unregistration, restart, and shutdown are
    runtime-owned.
15. Contributions are web-only and absent hosts do not break the service.
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
    the form is host-rendered and write-only for secrets; parsed settings and
    the configured-accounts enumeration reach only server-side callbacks;
    settings are isolated per principal and deleted with the account.

## Risks and mitigations

- **The operator view becomes a second UI framework.** Freeze only blocks proven
  by the golden package and one built-in consumer; keep arbitrary component
  composition advanced and separate.
- **Private renderer names leak into public source.** Public definitions return
  semantic views; adapters choose private generic renderers.
- **Dashboard data leaks across permissions.** Authenticate first, pass the
  canonical caller, scope entity reads, and execute providers only after
  minimum permission checks.
- **CMS actions become an untyped RPC surface.** Require named definitions,
  input/output schemas, workspace binding, CSRF, permission checks, and bounded
  errors.
- **Operator callbacks accidentally execute in workers.** Derive web-only
  inventory from declarative fields and assert worker exclusion in packed
  tests.
- **Registration timing leaks back to authors.** Collect definitions and wait on
  runtime finalization internally; reject author-facing ready-event hooks.
- **Custom UI pressure causes private package publication.** Keep the stable path
  JSON-native and handle rich UI in the later public UI milestone.
- **The feature delays `0.2` indefinitely.** Scope is already fixed outside
  `v0.2.0`; Phase 0 approval covers only the API shape. Stable `v0.2.0` ships on
  the frozen surface and this lands additively afterward rather than gating
  nomination or waiting for `0.3`.

## Explicit non-goals

- publishing `@brains/ui-library`;
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
