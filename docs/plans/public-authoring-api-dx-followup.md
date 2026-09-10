# Plan: Public authoring API boundary and DX follow-up

## Status and scope

**Investigation complete; recommendations proposed; API implementation not started.**
Follow-up to the public API/DX review
of `work/plugin-api-boundaries` at
[`ad97dc8e3`](https://github.com/rizom-ai/brains/tree/ad97dc8e352cc0fd41685f6248f6d15e6e6197cc).
Implementation targets that branch or its integrated successor, not the older
API currently on `main`. Recheck the findings against the implementation tip
before changing code.

This plan refines the contract before the stable nomination owned by
[Public authoring API compatibility](./public-authoring-api-0.2.md). It does
not authorize merging, publishing, database migration, or a runtime rewrite.

**Goal:** an external author encounters domain schemas and behavior, not the
bookkeeping needed to make the built-in packages use the SDK. Keep the
`define*` / `use()` architecture; distinguish a successful built-in conversion
from a public contract we are willing to maintain.

**Minimization applies to the entire current authoring surface**, including
existing helpers and callback shapes, not only this branch's additions or the
abstraction candidates below. Prefer removing, combining, or extending an
existing construct before introducing another public name. Do not combine
concepts whose different authority or lifecycle is meaningful to an author.

## Review baseline

These observations describe the reviewed branch, not current `main`:

- Across entities, services, and interfaces, the ledger grows from 68 to 248
  stable symbols. Size alone is not a defect, but the additions include
  `ServiceRole`, `ServiceGitBroker`, `EntityMirror`, and Studio registration
  messages. The accepted authoring plan keeps process roles and internal
  registration channels private.
- Service and message-interface contracts document that `setup` must precede
  callbacks that destructure `state`, otherwise inference can resolve state
  to an empty object.
- Service routes receive config only; interface routes also receive state.
  Newsletter uses an outer `let state`, and Dashboard an outer `let held`, to
  bridge setup to request execution.
- The external authoring guide says entities cannot have templates, while
  `defineEntity`, blog, and doc explicitly support them.
- Comparing the ledger with SDK exports found 13 stable names absent from the
  export files. An external compile probe against the built declarations
  confirmed all 13:
  `EntityDefinitionConfig`, `EntitySeedDefinition`, `EntitySeedTrigger`,
  `OperatorCardBlock`, `OperatorViewStatus`, `WorkspaceActionFormControl`,
  `WorkspaceActionFormDefinition`, `WorkspaceActionFormFieldDefinition`,
  `WorkspaceActionFormFieldMap`, `WorkspaceActionFormOption`,
  `WorkspaceActionResultDefinition`, `WorkspaceActionResultFieldDefinition`,
  and `WorkspaceActionResultFieldMap`. The current ledger test checks that
  exports are classified, but not that every promised export exists.

Primary implementation locations on the branch:

- `packages/brain-sdk/src/{entities,services,interfaces}.ts`
- `shell/plugins/src/public/{entity,service,interface}-definition.ts`
- `shell/plugins/src/service/service-definition-contract.ts` (route slot,
  `state` store factory versus `state` setup result)
- `shell/plugins/src/interface/interface-definition-contract.ts`
  (`runtimeState`)
- `shell/plugins/src/interface/route-contract.ts` (`RouteOutput`)
- `shell/plugins/src/internal/state-namespace.ts` (persisted namespace keys)
- `shell/core/src/http-route-registry.ts` (production route collection)
- `packages/brain-cli/test/fixtures/public-authoring/export-ledger.json`

## Design constraints

- A named built-in consumer proves a need, not a stable-public designation.
- Keep normal external and official extension authoring on the same contract.
  Explicitly distinguish infrastructure hosts from ordinary extensions rather
  than giving every extension a host-sized context.
- Review callback fields and transitively reachable types, not just named
  exports. Hiding a type export does not hide a capability returned by setup.
- Preserve runtime-owned authorization, ownership-scoped writes, registration,
  worker isolation, and shutdown. A smaller API must not weaken these rules.
- Prefer existing helpers and package boundaries. No generic service locator,
  universal context, new builder DSL, or speculative capability framework.
- Stable `0.2.0` has not been released. Make the intended breaking API cleanup
  now; existing alpha APIs are not a compatibility constraint. Remove superseded
  exports and signatures rather than retaining legacy aliases, overloads, shims,
  or dual authoring paths. Update built-ins, fixtures, and documentation together.
  This does not authorize destructive changes to persisted user data.
- Do not chase a target symbol count. Measure eliminated author bookkeeping,
  consistent semantics, and understandable examples instead.

## Phase 1 — Establish the contract and repair its evidence

1. Inventory the actual family exports and built declarations against the
   ledger. Record each capability's intended audience, consumers, proposed
   stability, and transitive runtime dependencies. Prior alpha publication does
   not require retaining a capability in the final `0.2.0` API.
2. Add a reverse ledger check: every stable and advanced public symbol must
   exist, with the correct type/value export. Keep intentional removals in
   their own category; do not weaken checks to accommodate missing symbols.
3. Add a generated external compile consumer importing every promised type
   and value from the packed entry points, not private workspace sources.
   Exercise runtime imports for value exports as well.
4. Quarantine the 13 missing names in an explicit `undecided` ledger category
   so the reverse check passes without lying about the surface. Do not decide
   keep/remove here: Phase 3 curation and the whole-surface removals below
   define the final surface, and resolving the names against a surface that
   later steps redefine reconciles the ledger twice. Do not restore an unwanted
   API solely to preserve an alpha promise. The `undecided` category must be
   empty before Phase 3 exits; the ledger test enforces this.

**Exit:** the ledger check machinery describes what an external consumer can
actually import, not merely the source files the workspace can resolve. The
final dispositions for quarantined names land with Phase 3.

## Phase 2 — Explore missing abstractions before widening the API

The candidates below define the investigation scope. Findings and dispositions
are recorded after them. They are not approved API names or a commitment to
implement everything. Before implementation, turn each accepted sketch into an
external fixture and confirm it reduces author bookkeeping.

### A. Route declaration versus instance-bound execution

**Evidence:** Newsletter and Dashboard hold mutable outer state because service
route discovery is config-only. Generic and message interfaces expose state in
route callbacks already.

Config-only discovery is not a production requirement; the investigation below
closes that question. Prefer one existing route lifecycle across families, with
per-instance state and the runtime-authenticated caller, rather than a
descriptor/handler separation. Never make a manifest test start real clients,
builds, or filesystem sync just to preserve coverage.

**Proof:** one ordinary webhook service and one console use the same mechanism;
two independent runtimes instantiated from the same exported definition never
share state. Route inventories remain complete through controlled registration
or existing finalized-runtime inspection.

### B. Consuming declared contributions as a host

**Evidence:** `defineDashboardWidget` and `defineStudioWorkspace` already cover
contributors, but Dashboard and Studio consume registration messages, maintain
registries, and name runtime renderer payloads. Those host needs have expanded
the normal service exports.

Explore a narrow host-side view of registered contributions with lifecycle and
caller-scoped resolution owned by the runtime. First decide whether supporting
third-party console hosts is an intended product feature. If not, keep the
consumer side internal; if so, describe it as an explicitly advanced contract.
Do not build a general registry API or replace the existing contributor helpers.

**Proof:** Dashboard and Studio no longer need internal registration-message
names on the ordinary authoring entry point. Registration rollback, removal,
optional-host behavior, and permission filtering remain covered.

### C. Definition-derived entity access and capability references

**Evidence:** jobs offer `entities.get(definition, id)` alongside string-and-schema
reads; subscription readers expose caller-selected generics; entity data sources
require a type name plus a schema. Blog's publish-assets declaration names an
image job with a qualified string.

Investigate whether the existing entity-definition and job-reference machinery
can cover these cases without duplicated schemas, unchecked generic assertions,
or hand-written runtime prefixes. Retain deliberate dynamic access for consoles
and mirrors, and avoid circular imports between an entity and its own handlers.
Do not collapse read, owned-write, routed-create, and operator-write authority
into one generic CRUD client.

**Proof:** a typed external entity reader/data source and an attachment-producing
flow can infer their contracts. Unknown references fail at registration with a
useful diagnostic; ownership and visibility checks still occur at execution.

### D. Typed requests versus one-way events

**Evidence:** subscriptions validate their input but return `unknown`; message
surfaces mix `send({ type, payload })`, `publish({ topic, data })`, and requests.
Email/notifications and site-info/newsletter provide real request/response
consumers, distinct from broadcasts.

Explore reusing an importable schema-bearing contract, as jobs already do, for
requests that need a typed response. Measure whether normalizing vocabulary is
sufficient before introducing another helper. Keep request failures distinct
from successful responses containing a domain refusal, and keep broadcasts
separate from requests with one expected answer.

**Proof:** at least two real caller/handler pairs share input/output schemas;
malformed responses and absent handlers have defined behavior. No general RPC
framework or public exposure of internal bus topics is required.

### E. Setup resources, durable state, and lifecycle capabilities

**Evidence:** service setup's `state(...)` means a durable store, while later
callbacks' `state` means the setup result; interfaces call the store factory
`runtimeState(...)`. Directory-sync's process and broker requirements also sit
on every service setup context.

Separate naming inconsistency from genuinely missing lifecycle behavior. Reuse
existing `defineDaemon`, account lifecycle, cleanup, and runtime-state scopes.
Investigate whether broker/role behavior belongs behind a narrow infrastructure
integration rather than teaching ordinary services process roles. Do not move
role switches into another universally available context property.

**Proof:** representative services and interfaces have consistent vocabulary
for in-memory state, durable bookkeeping, and cleanup. Failure during setup and
shutdown release resources; workers do not acquire scheduler-only resources.

### F. Programmatically distinguishable SDK failures

**Evidence:** added from collaborator feedback after A–E were scoped. Studio's
A2A assist path decides availability by string-matching an error message that
the messaging service composes. There is no public coded error a consumer can
check instead.

This is the one candidate whose disposition adds public surface rather than
removing or combining it. Audit existing coded errors first; reuse or
consolidate before adding a name. The minimization rule still applies: one
contract, chosen in the surface inventory, not a parallel error family.

**Proof:** Studio/A2A and one other supported boundary check a stable `code`,
and changing the human-readable message does not change caller behavior.

**Phase exit:** a disposition for every candidate, with consumers and the code
or author bookkeeping it eliminates. Reject abstractions that only rename the
same plumbing or broaden authority. Obtain API-shape agreement before large
implementation changes.

## Investigation results

### Evidence and limits

The remote branch still pointed to `ad97dc8e3` during investigation. Probes ran
outside the repository in `/tmp/brains-api-dx-investigations`, against the
isolated branch worktree. No production service, credentials, database, or API
implementation was changed.

- TypeScript 7.0.2 compiled a consumer of the built public subpaths using
  `--strict --skipLibCheck --module esnext --moduleResolution bundler`.
  Setup-first examples passed; reversing setup/state-consumer order produced
  TS2339 in services, generic interfaces, and message interfaces. No other
  diagnostics remained in that probe.
- An import-only consumer of all 248 stable names in the three families
  produced exactly the 13 missing-export diagnostics listed above.
- Five runtime characterization probes passed: definition-level state leakage,
  the real Newsletter route using a second instance's fake credentials,
  unvalidated subscription read assumptions, unvalidated subscription responses,
  and cleanup after setup failure through the production plugin manager.
  These tests assert observed behavior; passing the first four is not a claim
  that the behavior is desirable.
- A type-only prototype showed that `NoInfer` does not fix backward contextual
  inference. A two-argument header/setup-then-behavior sketch inferred state,
  including an async setup result. This proves a direction, not a complete
  replacement for the production definition signatures.
- These were focused compile/runtime probes plus source tracing, not a fresh
  packed install, full application boot, or exhaustive security review. Temporary
  probes are evidence, not permanent gates; promote the accepted cases into the
  existing suites during implementation.

### A. Routes — reuse one lifecycle, do not add another helper

**Disposition: combine existing family behavior. Priority: first consumer
migration after setup inference is decided (slice 3).**

`createRuntimeRoute` already owns authentication and request/response validation
for all families. Interface routes are built after setup and retained on the
plugin instance. Services instead call `routes({ config })` from `getWebRoutes`.
Newsletter, Dashboard, and Studio consequently retain mutable state outside the
instantiated plugin.

The reproduction instantiated the same Newsletter definition twice, configured
with `fake-A` and `fake-B`, and used a fake fetch. A route saved from the first
instance sent `Token fake-A` before the second setup and `Token fake-B` after it.
The problem is instance lifetime, not merely an awkward type annotation. The
current test helper creates a fresh definition per installation, so that path
avoids exercising reuse of the exported definition.

Config-only discovery has no production consumer. Production HTTP route
collection is `collectHttpRouteContributors` in
`shell/core/src/http-route-registry.ts`, which iterates
`pluginManager.getAllPlugins()` — registered, instantiated plugins — and runs
from `finalizeHttpRoutes()` after registration in
`shell/core/src/initialization/shellBootloader.ts`. Every other `getWebRoutes`
caller in the repository is a test or a test install helper; the concrete
early-reader is `packages/brain-cli/test/http-route-manifests.test.ts`, which
already registers interfaces but not services. The only assertion of the
requirement is the comment on the service `routes` slot in
`service-definition-contract.ts`, which justifies config-only routes by
"composition tooling [that] enumerates routes from an uninstantiated
definition". No such tooling exists in this repository.

**Recommendation (decided):** use `routes({ config, state, jobs })` after setup
for services as for interfaces, with state closures created per runtime
instance. Keep `defineRoute` and `createRuntimeRoute`; do not add
`defineRouteDescriptor`, a second registration callback, or a descriptor
registry to ordinary authoring. Delete the config-only rationale comment on the
service `routes` slot in the same change so the requirement is not re-litigated
from a stale comment. Update manifest evidence to controlled registration with
external effects stubbed, and cover finalized runtime inventory.

Also repair the existing `RouteOutput` type: it currently yields `unknown` for
schema responses, so `{ count: "wrong" }` compiles against
`response: z.object({ count: z.number() })`. Runtime validation exists already;
its input type should be reflected statically, with schema transforms handled
correctly. This requires no new public symbol, touches only
`shell/plugins/src/interface/route-contract.ts` plus a negative compile fixture,
and does not depend on the route-lifecycle change. Land it as its own first
commit.

Sources: `shell/plugins/src/interface/route-{contract,runtime}.ts`,
`service/declarative-service-plugin.ts`,
`interface/declarative-interface-plugin.ts`, and
`plugins/newsletter/{src/index.ts,test/helpers/install.ts}`.

### B. Contribution hosts — internal consolidation, not a new extension API

**Disposition: internal only unless third-party host support is explicitly
approved.**

The contributor abstractions already exist: widgets and workspaces declare
schemas, data loaders, semantic views, and actions. Runtime adapters already
bind config/state, filter permissions, validate data, and manage cancellation.
The missing part is on the host side: Dashboard and Studio receive private bus
messages and keep registries of the callbacks those adapters produced.

**Recommendation:** preserve `defineDashboardWidget` and `defineStudioWorkspace`.
Consolidate host registration/lifecycle behind the existing runtime boundary,
not a new public `defineHost` or generic contribution system. Only expose a
bounded advanced host reader if a supported external host actually needs one.
Keep rendering in the host packages; consolidation is not a reason to move their
UI into the shell or merge widget and workspace semantics.

Sources: `shell/plugins/src/operator/{dashboard-widget,studio-workspace}-runtime.ts`,
`plugins/dashboard/src/{service,widget-registry}.ts`, and
`plugins/studio/src/{service,workspace-registry}.ts`.

### C. Entity access — combine read vocabulary, reuse schema derivation

**Disposition: extend existing readers; no new repository/client abstraction.**

`definitionEntitySchema` and `parseDefinitionEntity` already derive runtime
validation from an entity definition. `JobEntityAccess.get(definition, id)` uses
that path. Data-source and projection readers have schema-bearing overloads;
subscription readers instead permit `getEntity<T>()` without evidence for `T`.
A consumer claiming an extra numeric metadata field compiles, while a runtime
probe returns `undefined` for that field.

**Recommendation:** use one definition-/schema-backed read vocabulary across jobs,
subscriptions, data sources, and projections. Reuse a small internal structural
reader contract and the existing validators. Keep dynamic base-entity reads for
hosts. Do not add `defineRepository`, a universal CRUD API, or caller-chosen
result generics. Preserve each context's visibility ceiling and write authority.

For publish assets, ownership delegation already exists in
`service/publish-delegation-registry.ts`; the gap is the qualified job string, not
missing orchestration. Reuse definition/job references where the owner can
publish a contract without an import cycle. Entity generation jobs and service
jobs have different completion semantics, so do not force them into one generic
job executor merely to remove a string. Defer a general capability-reference
framework.

Sources: `shell/plugins/src/entity/entity-schema.ts`,
`job/{job-context-contract,job-entity-access}.ts`,
`contracts/subscription.ts`, `public/entity-data-source.ts`, and
`entities/blog/src/post-entity.ts`.

### D. Messaging — complete the existing subscription contract

**Disposition: extend/combine; no separate request/event framework.**

The bus already distinguishes first-response requests from broadcasts. What the
SDK lacks is a shared response schema and a consistently unwrapped typed answer.
Email-workflows parses both a bus envelope and the mail response; Studio does
the same for A2A assist. These are stronger consumers than a generic assertion
that subscriptions need more typing.

**Recommendation:** extend `defineSubscription` to carry the response contract
when it answers a request; let a caller reference that same contract and receive
the parsed response. Reuse the existing definition/binding pattern if separating
the importable contract from its handler is necessary. Normalize `send`/`request`
vocabulary rather than publishing both for the same operation. Keep `publish`
as the distinct broadcast operation; do not add `defineRequest`, `defineEvent`,
or public bus-envelope helpers.

Domain refusals, such as `{ kind: "unavailable" }`, remain schema-valid domain
results. Missing handlers, invalid responses, cancellation, and handler failures
need explicit transport semantics. Do not make a typed contract confer caller
authority or imply that in-process payloads such as `AbortSignal` are durable
or remotely serializable.

Sources: `plugins/email-workflows/src/source-read.ts`,
`plugins/studio/src/editor-assist.ts`,
`shell/plugins/src/{contracts/subscription,service/reaction-context}.ts`, and
`shell/messaging-service/src/message-dispatcher.ts`.

### F. Shared errors — one small public contract

**Disposition: accept as the single net-new public contract of this cleanup.**
It adds public surface where every other disposition removes or combines. That
is deliberate: consumers cannot distinguish failures programmatically today, and
no existing exported construct can be extended to carry a stable code. The
accepted addition is bounded to one schema-backed contract and, at most, one
error class implementing it; both names are chosen in the Phase 1 inventory
and enter the ledger in the same slice as their consumers.

Collaborator feedback requests a coded error instead of matching generic error
messages. This is a demonstrated need: Studio's A2A assist path
(`plugins/studio/src/editor-assist.ts`) checks whether an error starts with
`"No handler found"`, a string composed in
`shell/messaging-service/src/message-factory.ts`.

**Recommendation:** establish one schema-backed public error contract for SDK
failures that callers need to distinguish programmatically. Audit existing coded
errors first and reuse or consolidate them rather than adding parallel families.
A public error class may implement the contract for local thrown failures; its
name and export location must be chosen in the surface inventory, not as another
standalone error package.

- Define a small documented set of stable `code` values from real caller needs.
  Examples to evaluate are unavailable capability, invalid input/response, and
  cancellation; do not predeclare a taxonomy for every internal exception.
- Keep `message` human-readable and explicitly outside string-matching guarantees.
  Add structured details only when a consumer needs them, with a bounded schema.
- Preserve the code through supported HTTP and worker/job boundaries. Consumers
  must not depend solely on `instanceof`, which cannot survive serialization or
  independently loaded copies of a package.
- Keep serialization and internal-error mapping runtime-owned. Do not expose
  stacks, credentials, raw causes, or private implementation details to clients.
  External protocols retain their mandated error envelopes, using explicit
  mappings where appropriate rather than a new universal wire format.
- Keep expected domain refusals as typed results. Do not convert every unsuccessful
  domain outcome into an exception or promise to classify arbitrary third-party
  errors exhaustively.
- Replace SDK-consumer message matching with code checks. Document a safe fallback
  for unknown codes and unclassified failures.

Prove the contract with Studio/A2A and a second supported public boundary. Test
that changing the human-readable message does not change caller behavior, codes
survive serialization, unknown codes are handled safely, and sensitive internal
error data stays private. Add the intended public exports to the ledger and the
packed-consumer checks in the same slice.

### E. Resources and state — reuse lifecycle, remove infrastructure vocabulary

**Disposition: consolidate existing lifecycle/state contracts; broker integration
stays internal.**

Services already have `lifecycle.onCleanup` and `onRegistered`; daemons already
have cancellation, readiness, and bounded shutdown; account lifecycle already
exists. The production plugin manager correctly ran a cleanup registered before
setup threw. An initial direct-harness check did not: that harness bypasses the
manager's failure rollback. This is not evidence of missing production rollback.

The real consistency gaps are that service setup calls durable storage `state`,
interfaces call it `runtimeState`, generic-interface setup is synchronous-only,
and interface setup exposes no equivalent cleanup handle for a shared setup
resource. A resource used by several callbacks should not need a dummy daemon
merely to obtain a lifecycle.

**Recommendation:** standardize `runtimeState` for durable bookkeeping and `state`
for the setup result; reuse one small cleanup lifetime contract where setup
acquires resources. Preserve existing account and daemon supervision. Do not add
a general `defineResource` or public process abstraction. Do not change persisted
namespace keys as a side effect of renaming the accessor: services currently use
package namespaces, while interfaces use declaration IDs.

Directory-sync alone demonstrates a need for broker endpoint and scheduler-role
facts. Hide those behind its infrastructure boundary rather than keeping
`ServiceRole`, `ServiceGitBroker`, and an unrestricted mirror on every setup
context. This does not make trusted in-process plugins a sandbox.

Sources: `shell/plugins/src/service/service-definition-contract.ts`,
`interface/{interface-definition-contract,declarative-daemon}.ts`,
`manager/plugin-lifecycle.ts`, `internal/state-namespace.ts`, and
`plugins/directory-sync/src/service.ts`.

## Whole-surface simplification recommendations

This includes pre-existing APIs, not only the six candidates. The existing
`main` service/template entry points were also checked so inherited surface is
not mistaken for a new branch regression.

| Current surface                                                                        | Recommendation                                                                                           | Reason / boundary to retain                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Service `templates` plus `views`                                                       | **Combine into one schema-bearing template declaration** with optional text formatting and web rendering | `runtimeTemplates()` already merges them by key and rejects different schema objects. One declaration removes duplicate names, schemas, generic maps, and the equality rule. Retain the JSON requirement for rendered props; do not mix this with AI prompts or markdown persistence codecs. |
| `defineDataSource` plus `defineEntityDataSource`                                       | **One authoring helper with two exclusive forms**                                                        | Both already form `AnyDataSourceDeclaration` and bind to the same data-source service. Keep the entity list/detail form's runtime pagination/navigation instead of making authors reimplement it with `fetch`. Reject ambiguous inputs; do not grow a query-builder DSL.                     |
| `getEntity`, `get(definition, id)`, and parallel reader contracts                      | **Consolidate read semantics** using definition/schema evidence                                          | Share validators and structural contracts, but retain scoped authority and a deliberate dynamic-read form.                                                                                                                                                                                   |
| Service/interface route slots                                                          | **One post-setup route lifecycle**                                                                       | Use the proven interface behavior; remove outer mutable holders and the service-only early-discovery constraint.                                                                                                                                                                             |
| `send` and `request`, plus subscription envelope parsing                               | **One typed request path**, separate from `publish`                                                      | Reuse the existing bus and subscription helper, not a second messaging system.                                                                                                                                                                                                               |
| `setup.state(...)` and `runtimeState(...)`                                             | **One name per lifetime**                                                                                | Durable state and setup-returned state are different concepts, not two spellings for one. Preserve stored keys.                                                                                                                                                                              |
| `defineProjection` and `defineProjectionRule`                                          | **Keep a simple normal path and an advanced rule path for now**                                          | Source-to-target mapping and batch/conversation reconciliation differ materially. Combining names alone would expose deletion authority and wave mechanics to the simplest example. Reuse their existing shared runtime rather than create another abstraction.                              |
| Entity/service/interface/message-interface families and package wrappers               | **Keep semantic families; do not introduce a universal `definePlugin`**                                  | Owned entities, durable work, protocol listeners, and conversations have different lifecycle/permission responsibilities. A giant union of optional slots is not a smaller conceptual API.                                                                                                   |
| Tools, durable jobs, workspace actions                                                 | **Keep distinct; share private validation/binding machinery**                                            | Agent confirmation, durable execution, and revision-bound prepared browser actions are not interchangeable operations.                                                                                                                                                                       |
| `@rizom/brain/templates` builder/registry exports and host namespace types             | **Internal or explicitly advanced after consumer audit**                                                 | Rendering a template does not require a `SiteBuilder` or a `ViewTemplateRegistry`. Removing an export alone is insufficient if it remains reachable through a callback.                                                                                                                      |
| Generic utilities on entity entry points (`pLimit`, `getErrorMessage`, string helpers) | **Remove from normal authoring unless needed for a domain contract**                                     | Their usefulness does not make them Brain authoring concepts. Use an already supported public shared library where available, ordinary dependencies, or local functions; do not create a new catch-all SDK utility subpath.                                                                  |
| Inferred public DTO/type exports                                                       | **Keep useful domain types; trim runtime-shaped aliases**                                                | Extracted handlers need names. Deleting type names while leaving the same structures implicit makes DX worse without reducing the real contract.                                                                                                                                             |

The template and data-source combinations are concrete existing-surface reduction
candidates, not instructions to widen `createTemplate` to every capability.
Start with the normal schema/formatter/renderer contract and adapt it to the
existing runtime implementation. The rich entity-template and site-section paths
must be checked against that vocabulary, not silently replaced by a host-sized
raw `Template` object.

### Setup inference decision

The order sensitivity is also present in generic interfaces, beyond the two
families whose comments mention it. It follows TypeScript's
[left-to-right contextual inference](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-7.html#improved-function-inference-in-objects-and-methods).
`NoInfer` is not a demonstrated fix.

Do not add an independent setup-builder API for each family. First attempt a
single type-level correction with the existing object syntax. If the complete
fixtures cannot support it, review one shared two-stage definition pattern using
the existing family helper names: config/setup first, behavior receiving the
inferred result second. The minimal prototype compiles, but production config
schemas, account settings, templates, async setup, and extracted handlers still
need proof. This is an explicit API-shape decision, not a hidden compatibility
shim or a promised one-line type fix.

It is also the only decision in this plan that can change the shape of every
family's definition object. If the two-stage pattern wins, the contracts
migrated by later slices — routes, templates/views, data sources, readers, state
vocabulary — are all expressed in that new shape. Deciding it after those
migrations means migrating every consumer twice. Settle it first: it is a
type-level decision, the prototype already exists, and the compile fixtures it
needs are small.

### Recommended implementation order

1. Land the ledger check machinery: reverse built-declaration checks, the
   packed-consumer fixture, and the `undecided` quarantine for the 13 names.
   Fix `RouteOutput` as a standalone commit in this slice.
2. Decide setup inference once across families, with compile fixtures covering
   both property orders for services, generic interfaces, and message
   interfaces. Every later slice expresses its contracts in the winning shape.
   Do not begin step 3 until this is decided.
3. Unify service routes with the existing instance-bound lifecycle; add the
   Newsletter two-instance regression. Delete the config-only rationale comment.
4. Combine service templates/views and the two data-source helper names, one
   contract change at a time. Migrate consumers and remove superseded alpha forms;
   do not retain compatibility aliases or parallel APIs.
5. Consolidate entity readers, request responses, and resource/state vocabulary
   through their existing machinery. Establish the shared coded-error contract
   alongside request-failure semantics. No new top-level helper by default.
6. Curate the boundary (Phase 3): remove host/infrastructure and unrelated
   utility exposure from normal authoring, keep advanced integration only where
   external support is intended, and empty the `undecided` ledger category.
7. Reconcile the external guide, golden examples, and presentation rule with
   the resulting API.

No abstractions from this investigation require a new general public framework.
The one unresolved design decision is third-party host support; it does not
block any slice above because B's disposition is internal-only until that is
approved. Preserving legacy alpha APIs is not a requirement.

### Landing strategy

Each numbered slice above is an independently reviewable and revertable change
against the integration branch, gated on its own targeted checks plus
`bun run typecheck` and `bun run surface:check`. The slices are ordered by
dependency, not preference: 1 has no dependencies, 2 gates everything after it,
and 3–5 may land in any order once 2 has landed. Do not accumulate slices into
one long-lived branch; a slice that is not landable on its own is too large and
should be split at a contract boundary. The whole-surface table entries that are
not covered by a numbered slice are folded into slice 6.

## Phase 3 — Curate the public boundary

Use the inventory and abstraction findings to assign each capability:

1. **Normal authoring:** domain definitions and focused behavior an ordinary
   extension needs, including widgets/workspaces contributed to an existing host.
2. **Advanced integration:** a supported external use case that genuinely owns
   hosting or infrastructure behavior, backed by a standalone consumer fixture.
3. **Internal runtime:** no supported external authoring use case.

Review process roles, git broker details, entity mirrors, renderer registration
messages, and broad namespace types first. Do not automatically demote all
cross-type operations: routed creates and caller-authorized editing can be real
public needs, but their authority must remain explicit.

Decide whether the existing advanced entry point can carry approved integration
contracts before proposing a new subpath. Classification alone is insufficient:
normal entry points and inferred callback contexts should not expose internal
integration machinery as ordinary author choices.

**Exit:** every public capability has an audience and contract rationale;
infrastructure needs no longer dictate every extension's autocomplete surface.
The built-ins still work, and no class-first authoring path is reintroduced.

## Phase 4 — Make the normal path predictable

- Remove the requirement that authors order `setup` before state consumers.
  This is slice 2 of the implementation order and is decided before any
  consumer migration, not here. Start with minimal compile fixtures covering
  both property orders for services, generic interfaces, and message
  interfaces. Preserve config defaults, transforms, async setup where supported,
  and extracted handler inference. Do not fix the examples with casts,
  empty-state widening, or explicit framework generics. If inference requires
  an API-shape change, review the two smallest viable designs before
  implementation.
- Implement the accepted route-binding design from Phase 2. Convert Newsletter
  and Dashboard first; extend to other service routes only after the pattern is
  proven. Keep authentication, body/response validation, and rollback semantics.
- Decide the entity presentation rule explicitly. Proposed direction: presentation
  intrinsic to an entity may live with its definition; cross-type or independently
  configured presentation belongs in a service. Alternatively, retain the original
  service-only rule and migrate the built-ins. Do not document both as mandatory.
- Align the external guide, official-package guide, fixture comments, and ledger
  with that decision. Document the normal family choice, setup/resource lifetime,
  and the advanced boundary without requiring readers to study internal plans.

**Exit:** moving a property does not change inferred types; route handlers need
no mutable outer state; external examples and representative built-ins teach the
same model.

### State the compatibility promise explicitly

Align the external authoring guide, migration guidance, and release ledger with
the existing stable-nomination policy:

- **Before stable `0.2.0`:** breaking authoring changes are allowed and belong in
  this cleanup. No legacy alpha compatibility is required. Replace old forms,
  migrate consumers, and update examples; do not defer simplifications to `0.3.0`
  or add compatibility shims.
- **Starting with stable `0.2.0`:** freeze the resulting documented contract.
  Subsequent `0.2.x` patches preserve signatures and observable semantics,
  including error-code meanings. Compatible additions are allowed; message text
  may change because it is not a machine-readable contract.
- **After that freeze:** breaking authoring changes belong in `0.3.0` or a later
  minor release, with migration guidance, rather than ordinary `0.2.x` patches.
  Any security exception follows the existing release policy rather than becoming
  a general escape hatch.
- Explain which contracts are stable versus advanced alpha integrations. Do not
  imply that every exported symbol has the same stability guarantee.

This clarifies the policy already owned by the stable-nomination plan; it does
not create a separate versioning policy or authorize stable publication.

## Phase 5 — Validate the API from outside the repository

Use the existing golden packages and packed-consumer infrastructure rather than
creating a parallel test system. Add focused cases for:

- a small schema-only entity and its definition-derived reads;
- a configured service with a durable job and a stateful authenticated route;
- a message interface sharing one setup resource across listen/send;
- entity presentation following the agreed rule;
- a widget/workspace contributor without host-registration imports;
- each newly approved advanced abstraction, with its named external use case.

Include negative compile tests for wrong inputs, output types where promised,
invalid config, and unavailable capabilities. Include runtime tests for parsed
config, two-instance isolation, request validation, permissions, setup failure,
cleanup, and worker exclusion. Test against built/packed public declarations:
workspace typechecking alone cannot prove external DX.

Run targeted checks per slice, then the cross-workspace gates for the integrated
contract: typecheck, relevant tests, lint, architecture, build, and
`bun run surface:check`. Run the existing packed compatibility evidence against
the candidate artifact and `bun run docs:check` after documentation updates.
Rendered-site evidence must start a canonical test app through its existing
posture script and rebuild preview through the running app before inspecting
`dist/site-preview`; a static build alone is not sufficient.

**Investigation exit (complete):**

- [x] Every abstraction candidate has an evidence-backed disposition.
- [x] Config-only route discovery is confirmed to have no production consumer.
- [x] The setup-inference order sensitivity is reproduced in all three families.

**Implementation acceptance:**

- [ ] Promised exports and packed declarations agree in both directions, and the
      `undecided` ledger category is empty.
- [ ] Normal authoring avoids host registries, broker details, and process roles.
- [ ] Setup inference and route instance state are predictable and tested.
- [ ] Presentation ownership has one documented rule used by real consumers.
- [ ] Golden examples compile unchanged outside the monorepo and exercise live paths.
- [ ] Public SDK failures have stable codes; consumers do not match message text,
      and supported cross-boundary mappings preserve codes without leaking internals.
- [ ] Superseded alpha APIs are removed, consumers are migrated, and no legacy
      aliases, compatibility shims, or dual authoring paths remain from this cleanup.
- [ ] Any advanced-contract additions are explicit.
- [ ] Public documentation allows breaking cleanup before stable `0.2.0` and
      states that the `0.2.x` patch promise and later-minor breaking-change policy
      apply only after the stable freeze.
- [ ] The API is reviewed from the external examples, not signed off solely because
      built-in conversions and repository tests pass.

### DX sign-off and stopping rule

Before declaring the API DX-ready for v0.2, use only the candidate public package
to build three small external extensions through the existing fixture system:

1. An entity with presentation and typed reads.
2. A configured service with a durable job and an authenticated, stateful route.
3. A conversational interface sharing a setup resource across its callbacks.

All three must compile and exercise their live paths without casts, duplicated
schemas, private imports, explicit framework generics, property-order rules, or
mutable outer state used to bridge lifecycle gaps. Setup inference must have one
consistent solution across families; it is the remaining API-shape risk, not a
documentation workaround.

When these examples and the acceptance checks pass, the public surface is
sufficiently coherent for v0.2 DX sign-off. Stop abstraction cleanup at that point;
require a concrete authoring failure or supported consumer need for further
changes, rather than pursuing elegance alone. This is not a claim that the API
will never evolve.

Completion feeds the existing stable-nomination plan; it does not replace its
exact-version, credentialed runtime, evaluation, or release-authorization gates.
