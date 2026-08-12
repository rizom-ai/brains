# Plan: Public authoring API compatibility for `v0.2.0`

## Status

**In progress:** implementation phases 1–5, the local Phase 6 export/documentation freeze, candidate publication, the exact-version registry matrix, and npm retirement are complete. The six golden packages compile, pack, install, and boot against `@rizom/brain@0.2.0-alpha.272` with `@rizom/site@0.2.0-alpha.233`. [Site Release evidence](https://github.com/rizom-ai/brains/actions/runs/31319970155) verifies all 73 published `@rizom/site-sections` alphas are deprecated with a migration pointer to `@rizom/site`. The packed and registry matrices prove the declarative contracts for all four required extension use cases:

1. custom entity types;
2. custom service plugins;
3. custom sites; and
4. custom interfaces, including message interfaces.

The remaining nomination gates, in order, are:

1. **Refresh the final alpha candidate.** Merge current `main`, nominate the newest published Brain alpha containing the intended stable source, advance every golden peer lower bound to it, and rerun the exact alpha registry matrix. The existing `alpha.272`/`alpha.233` result remains historical evidence, not proof for a newer final candidate.
2. **Implement and run provider-backed live evidence.** The opt-in `RIZOM_PUBLIC_API_LIVE_EVIDENCE` flag exists, but the bounded live matrix itself is not yet written. It must prove embeddings, semantic ranking, agent chat and confirmation, inbound messaging, lazy attachments, and model-triggered durable progress against the same final alpha.
3. **Complete every correctable pre-release check.** Audit acceptance criteria 12 and 15, then run the full criterion-17 sweep: format, typecheck, tests, forced lint, architecture/package boundaries, all packed smokes, and zero-failure personal/team eval suites. Failures are corrected on the alpha line before any stable package is published.
4. **Obtain explicit release authorization.** A green plan, CI run, or evidence matrix does not authorize `changeset pre exit`, stable npm publication, workflow dispatch, or dist-tag mutation. Each stable release action requires a separate explicit yes/no approval.
5. **Run one coordinated stable release.** Prepare the reviewed global Changesets prerelease exit, but do not use the current core-first publish order. Core Release may own the one global version commit; it must then pause core publication while Site Release publishes stable `@rizom/site` through the site lane. Rerun the exact registry matrix against the stable site SDK and final Brain alpha, then publish stable Brain only after that matrix passes.

The current workflows do not yet satisfy gate 5: Core Release publishes Brain before it dispatches Site Release. That orchestration must be corrected and tested before prerelease exit; an out-of-band site publish is not an acceptable substitute. Five standalone extension packages—entity, service, site, generic interface, and message interface—serve as golden paths and primary documentation. A sixth standalone brain-definition package is a compatibility canary for the root API. This plan is narrower than general plugin-system cleanup: it freezes only the contracts required by those paths.

## Goal

An author in a standalone repository can use one canonical public entry point for the extension family, define schemas and behavior once through declarative `define*` helpers, default-export the resulting package definition, install it into a packed Brain consumer, and exercise it through public runtime behavior without importing `@brains/*`, repeating package metadata or runtime-owned entity fields, implementing registries or queue plumbing, understanding process roles, or depending on monorepo tooling.

Passing runtime tests is necessary but not sufficient. The API must also be pleasant enough to preserve for the full `0.2.x` line: domain code should dominate each example, types should infer where the runtime already knows them, lifecycle and registration vocabulary should be consistent, and advanced capabilities should compose without turning any base class into a shell facade.

For the `0.2.x` line:

- patch releases preserve the documented authoring contracts;
- additive methods remain allowed;
- author-constructed inputs and DTOs may gain only optional fields; adding a required field is breaking;
- runtime-produced outputs may gain fields, but existing fields are not removed, narrowed, or widened to `unknown`;
- removals, renamed required fields, narrowed input types, callback variance changes, and semantic changes wait for `0.3.0` unless correcting a security defect;
- external packages declare `@rizom/brain: ">=0.2.0 <0.3.0"` after stable release;
- generated declarations contain no private workspace, Effect, shell, or database types.

## Release decision

The current API is **alpha-usable, not stable-complete**.

| Golden use case          | Proven alpha evidence                                                                                                                     | Remaining nomination gate                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Custom entity type       | Declarative schema/codec package; visibility-safe CRUD/FTS, projection convergence, restart durability, and packed worker execution       | Live embedding completion and semantic ranking against the final alpha                        |
| Custom service plugin    | Declarative config/setup/tools/jobs; typed durable enqueue/result/progress, confirmation replay, restart recovery, and worker isolation   | Model-triggered confirmation/progress evidence plus the final criteria 12/15 and sweep audits |
| Custom site              | One-import `@rizom/site`; canonical validation, isolated typecheck, running-app preview rebuild, full structural output, and alpha matrix | Authorized stable SDK publication and post-publication exact registry matrix                  |
| Custom generic interface | Typed routes/protocol caller resolution, job enqueue, daemon health/shutdown, authentication rejection, and worker exclusion              | Final-alpha refresh and full criterion-17 sweep                                               |
| Custom message interface | Descriptor/delivery ownership, normalized send/edit, listener lifecycle, lazy attachment contract, typed failure, and worker exclusion    | Live inbound chat, confirmation, attachment download, and model-backed progress               |

## Author-experience standard

API elegance is a release property, not optional polish. Before changing implementation types, write five ideal **golden-path extension packages** from the author's point of view: entity, service, site, generic interface, and message interface. A root brain-definition canary separately proves `defineBrain`, `defineBundle`, and composition. Those exact packages become compile fixtures, runtime fixtures, and documentation source.

A golden path passes only when:

- there is one obvious declarative definition helper for the extension family;
- the minimal example contains domain schema, behavior, and configuration—not constructors, package manifests imported into source, queue/registry plumbing, shell objects, process roles, or placeholder lifecycle methods;
- generic parameters and callback inputs infer unless the author is choosing a real domain type;
- the author writes no casts, `unknown` bridges, duplicated schemas, runtime-owned entity fields, fully qualified capability names, or manual package versions;
- config is defined once and its parsed output, including defaults and transforms, reaches every callback;
- schemas drive runtime validation, callback types, result types, and tests;
- local tool, job, entity, and channel names are scoped by the runtime;
- lifecycle-owned resources use abort signals and returned/supervised cleanup rather than manual registry calls;
- package-load, config-validation, and capability-conflict errors each identify the relevant package/plugin, field or capability, and corrective action;
- advanced behavior composes focused definitions instead of expanding every context; and
- copying the documented example into a standalone package compiles unchanged.

Author-facing complexity is reviewed from examples inward. The accepted golden paths demonstrate the need for narrow `define*` helpers; they are identity/normalization helpers, not a chained builder DSL. Base classes may remain as an advanced escape hatch only when a checked external example needs behavior the canonical definitions cannot express. They are not the primary documentation path and are not stable merely because they are currently exported.

The review asks four concrete questions for every public symbol:

1. Is this a domain choice the author must make?
2. Can the runtime infer or own it instead?
3. Is the same concept named and shaped consistently elsewhere?
4. Are we willing to preserve it through every `0.2.x` patch?

A “no” to the fourth question keeps the symbol internal.

### Accepted golden-path vocabulary

| Authoring task    | Canonical entry point     | Canonical vocabulary                                                               |
| ----------------- | ------------------------- | ---------------------------------------------------------------------------------- |
| Brain definition  | `@rizom/brain`            | `defineBrain`, `defineBundle`, `use`                                               |
| Entity package    | `@rizom/brain/entities`   | `defineEntity`, `EntityOf`, `defineProjection`, `defineEntityPackage`, blessed `z` |
| Service package   | `@rizom/brain/services`   | `defineServicePlugin`, `defineTool`, `defineJob`, blessed `z`                      |
| Generic interface | `@rizom/brain/interfaces` | `defineInterface`, `defineRoute`, `protocol`, `defineDaemon`, blessed `z`          |
| Message interface | `@rizom/brain/interfaces` | `defineMessageInterface`, normalized inbound/send/edit/deliver contracts           |
| Site package      | `@rizom/site`             | `defineSite`, `defineSection`, `sectionGroup`, blessed `z`                         |

The names above are contract decisions. Their exact generic implementation is driven by the checked golden source, but an implementation may not replace them with class boilerplate or multiple equally preferred authoring styles.

## Contract boundary

### Public package entry points

The stable authoring registry is limited to:

- `@rizom/brain` — declarative brain/bundle composition and public definition types;
- `@rizom/brain/entities` — the complete normal entity-authoring path and advanced entity contracts proven by fixtures;
- `@rizom/brain/services` — the complete normal service/tool/job-authoring path and typed template/view contracts;
- `@rizom/brain/interfaces` — generic and message-interface definitions, routes, callers, supervised daemons, channels, delivery, and enqueue-only job contracts;
- `@rizom/brain/plugins` — advanced shared contracts needed by more than one family, not a second preferred authoring path;
- `@rizom/brain/templates` — advanced template and renderer contracts; and
- `@rizom/site` — the sole site-authoring entry point.

Neither `@rizom/brain/site` nor `@rizom/site-sections` is part of the stable registry. Both have only exposed alpha contracts: remove the Brain subpath before stable, migrate all consumers to `@rizom/site`, deprecate every published `@rizom/site-sections` alpha with a migration pointer, and remove the workspace package. No compatibility facade or stable shim survives into `0.2.x`.

`@rizom/brain/model`, `@rizom/brain/deploy`, and the CLI are public products but are not extension-authoring dependencies for this compatibility sign-off. An independently released stable `@rizom/site` version must be published before stable Brain nomination.

### Stable plugin families

Each external package default-exports a declarative package definition. The runtime normalizes that definition into its existing plugin lifecycle:

- entity persistence and derivation use `defineEntity()` and, when several definitions compose, `defineEntityPackage()`;
- tools, resources, integrations, and durable work use `defineServicePlugin()`;
- handler-backed HTTP routes and supervised listeners use `defineInterface()`;
- conversational and outbound channels use `defineMessageInterface()`.

A package needing several runtime concerns composes focused definitions rather than turning one family into a shell facade. The runtime may continue using internal classes, but no class-first authoring export survives into the stable public registry. An advanced consumer that exceeds a definition helper drives an additive declarative contract rather than preserving the alpha inheritance API.

### Stable runtime behavior

The compatibility promise covers observable behavior, not just TypeScript compilation:

- schema-validated configuration reaches package definitions from typed `use()` and `brain.yaml`;
- installed package metadata and local capability scoping are runtime-owned;
- registration is finalized before ready hooks;
- failed registration rolls back context-owned capabilities;
- shutdown is terminal and releases lifecycle-owned resources;
- entity writes remain schema-validated, visibility-aware, searchable, and restart-durable;
- custom projection definitions use the scheduler-owned projection runtime;
- durable custom jobs use the existing job queue and execute in the worker child;
- interface daemons run only in the web child and participate in health and shutdown;
- public/protocol routes use the shared host and protocol identities become canonical callers before permission-sensitive behavior;
- normalized inbound messages use the shared conversation, agent, confirmation, attachment, and progress runtime; and
- site packages build through the app-managed site-builder path.

Storage schemas, queue tables, shell objects, internal message channels, and process-role switches remain private.

## Architecture decisions

### 1. Declarative definitions are the canonical API

The stable golden paths are definition-object APIs. `defineEntity`, `defineServicePlugin`, `defineInterface`, `defineMessageInterface`, and `defineSite` provide contextual typing, normalize author input, and return package definitions the runtime can instantiate. They do not expose a chained builder, shell object, or registry.

A definition may declare optional `setup`, lifecycle, capability, and supervised-task callbacks. Callback inputs are inferred from the config schema and prior definition fields. The runtime adapts definitions to existing internal plugin classes and lifecycle order. Authors do not import package manifests, construct runtime delegates, or subclass merely to receive typed config.

### 2. Configuration, package metadata, and brain composition are inferred

Each plugin definition declares one config schema. The framework parses it once and supplies its `z.output`, including defaults and transforms, to setup, tools, jobs, routes, daemons, and message callbacks. The input accepted by `brain.yaml` and `use()` derives from `z.input`.

The loader owns installed package name and version. Authors choose only stable domain IDs local to the package; the runtime scopes tool and job names and reports both package and definition IDs in diagnostics.

Plugin package definitions carry their family, ID, config schema, and internal factory. Root composition uses typed `use(definition, config)`, and bundles reference configured capability objects rather than repeating string IDs. Entity, service, and interface definitions share this composition model; there is no separate interface-constructor/environment-mapper tuple. Secrets and environment interpolation remain instance concerns in `brain.yaml`. This root shape must align with the brain-model-unification plan before either plan freezes declarations.

### 3. One source and one stability rule for every public contract

Runtime validation and public TypeScript types derive from the same schema or source type. Apply this to plugin definitions, site definitions, routes, callers, daemons, jobs, tools, messages, permissions, entities, and projections. Declaration bundling may inline public structures but must not create independently maintained copies.

Before stable release, every unannotated export from an authoring subpath is part of the stable ledger. Unsupported alpha exports are removed or marked `@internal`; publishing a symbol and declaring it informally unstable is not acceptable. Root and plugin entries use the same `PluginPackageDefinition`, configured capability, and config types.

### 4. Entity authors declare domain metadata, not runtime storage

`defineEntity()` takes a type, purpose, and metadata schema. The runtime composes base fields, literal entity type, visibility, content hash, timestamps, and the full schema. `EntityOf<typeof definition>` exposes the inferred entity type.

The normal case receives a generated markdown adapter: metadata maps to frontmatter and content maps to the body. An optional typed `markdown.decode` / `markdown.encode` pair handles entities whose frontmatter and searchable metadata differ. Authors never implement YAML parsing, metadata extraction, or a multi-method adapter for the default case.

Typed definitions replace string type names in reads and projections: `entities.get(bookmark, id)`, `entities.list(bookmark)`, and `digest.upsert(...)`. `defineProjection()` references source and target definitions, while the runtime owns scheduling, write-intent validation, memoization, worker execution, and feedback-loop protection. Direct database, FTS, embedding, queue, and projection-store access remain private.

Data sources and create interception are not stable baseline requirements merely because internal entities use them. They enter the ledger only if a concrete external golden extension demonstrates an elegant contract.

### 5. Service tools and durable jobs are schema-first

`defineServicePlugin()` is the normal service path. `defineTool()` uses an object signature with input/output schemas, receives parsed domain input, and accepts plain domain output. The runtime owns validation, local-name scoping, success/error conversion, output validation, and confirmation integration; authors do not pass plugin IDs or return `toolSuccess()` wrappers.

`defineJob()` separates a reusable name/input/output contract from execution. `.handle()` binds immutable execution to a service definition. Handlers receive parsed input plus inferred config, an abort signal, and a narrow progress reporter. `jobs.enqueue(job, input)` validates input and returns a typed job reference; interfaces can import and enqueue the contract without owning its handler.

The existing durable queue remains the only implementation. Finalized service job handlers derive worker inventory, and the same external package supplies web-side validation and worker-side execution. Batch enqueue is excluded from `0.2` until a golden path demonstrates need. Retry/deadline options are curated from author needs rather than exporting queue options wholesale.

Public template and view namespaces retain their real stable methods and public types; they do not erase values to `unknown` merely to avoid declaration work.

### 6. Interfaces normalize routes, callers, agents, and daemons

`defineInterface()` owns parsed config and declarative capabilities. `defineRoute()` provides typed request parsing and response serialization. Its initial security union is explicit:

- `{ kind: "public" }` for genuinely unauthenticated routes;
- `protocol({ authenticate })` for handler-protocol authentication.

A protocol authenticator returns the platform user identity. The runtime then resolves one canonical caller containing actor attribution, permission level, and anchor status. Already authenticated message events use the same runtime-owned resolution without asking authors to repeat `interfaceType`. The alpha `public: true` shape is absent from public declarations; an equivalent private representation remains inside the existing router adapter.

Generic agent operations are intentionally not stable without a golden caller. Message interfaces invoke the agent through `messages.receiveAuthenticated()`, which keeps permission, anchor, interface, channel, and actor fields out of author callbacks. A future generic request-object `agent` namespace must first appear in a concrete golden package.

`defineDaemon()` exposes one supervised abortable `run()` task with health reporting. The runtime owns registration, post-ready startup, required/optional policy, shutdown deadlines, cleanup, and worker exclusion. Tool-backed API routes, shared-host operator authentication, parameter routing, and `context.http.register()` remain in the HTTP hardening plan.

### 7. Message interfaces normalize inbound and outbound transport

`defineMessageInterface()` builds on the generic interface model. A static `channel` declaration automatically registers descriptor, recipient validation, ownership, and an optional delivery provider.

Conversational transports implement a supervised `listen`, `send`, and optional `edit`. `messages.receiveAuthenticated()` accepts normalized sender, channel/thread, text, and lazy attachments. The runtime owns permission resolution, conversation mapping, persistence, attachment policy, confirmation routing, agent invocation, response delivery, job tracking, progress buffering, and cleanup.

Every stable outbound message is normalized to text. Presence of `edit` determines edit capability; authors do not implement support flags or progress registries. Outbound-only transports implement `deliver` without conversational placeholders. Delivery callbacks return a provider ID or throw; the runtime normalizes failures rather than asking authors to construct framework status unions. Native cards and authored outbound attachments remain outside the stable baseline.

### 8. `@rizom/site` is the one site-authoring concept

The canonical site package imports `defineSite`, `defineSection`, `sectionGroup`, and the blessed `z` from `@rizom/site` and default-exports one structural definition. It supports layouts, routes, content, schema-first sections, entity display metadata, additive CSS, head scripts, and static assets. Themes remain independently selected.

The stable site definition does not contain an embedded runtime plugin. Advanced backend behavior is a separate focused plugin export/package configured explicitly through `plugins:`. The runtime may continue accepting legacy embedded site plugins internally during migration without making them part of the stable contract.

Remove the `@rizom/brain/site` export map and entry before stable. Migrate all `@rizom/site-sections` consumers to `@rizom/site`, deprecate every published alpha with a pointer to the canonical SDK, and remove the workspace package without publishing a stable shim. A stable compatible `@rizom/site` release must be available before Brain nomination.

### 9. Golden fixtures are executable contracts with hermetic and live tiers

Five extension fixtures are the primary documentation source. The root brain-definition package is a sixth compatibility canary, not a sixth extension style. Every TypeScript example is imported from one of these checked packages or extracted and compiled.

Normal PR and pre-commit feedback keeps focused contract/integration tests plus one canonical packed-install/startup canary. The complete hermetic packed matrix is an explicit nightly, manual, and pre-publication tier: package loading, config, metadata inference, CRUD/FTS, markdown, visibility, deterministic projection, durable jobs, public/protocol routes, caller resolution, daemons, outbound delivery, site builds, restart, and shutdown. It uses no model-provider network calls or secrets and runs through `bun run test:packed:compat`, which packs Brain once and isolates each scenario's mutable state.

At stable nomination, freeze the approved `0.2.0` fixtures as an immutable compatibility baseline. Every later `0.2.x` candidate compiles and runs that baseline; current examples may evolve additively without replacing it. The phase-oriented suite names are retired once the stable baseline is frozen. See [`packed-compatibility-test-tiering.md`](./packed-compatibility-test-tiering.md).

A nominated-alpha live tier supplies real providers and proves embedding completion, semantic ranking, `agent.chat`, confirmation, inbound conversations, attachments, and model-backed progress. Live evidence gates stable nomination but is not a flaky per-PR compatibility test.

### 10. Compatibility is package- and fixture-enforced

Peer ranges and resolved package versions are authoritative; remove `PLUGIN_API_VERSION`, which has no independent compatibility role. The harness explicitly verifies peer satisfaction rather than relying on package-manager warning behavior.

The authoritative gates are clean generated declarations, the stable export ledger, compile fixtures, isolated tarball installs, hermetic runtime proofs, nominated-alpha live evidence, and explicit stability documentation. After `0.2.0`, frozen old fixtures compile and run against every `0.2.x` candidate. Do not retain alpha overloads solely to preserve superseded examples; correct them before stable with release notes and advances to alpha peer lower bounds.

## Non-goals

- A plugin marketplace or discovery protocol.
- Dynamic plugin install, unload, or re-enable in a running shell.
- Publishing every first-party `@brains/*` plugin independently before `0.2.0`.
- Rewriting internal first-party plugins onto the declarative API before the external fixtures prove it.
- Exposing shell, plugin-manager, database, worker, queue, or registry implementations.
- Completing HTTP route-registry normalization, operator authentication, parameter routing, or tool-backed API routes.
- Stabilizing batch jobs, entity data sources, create interception, native platform cards, or other advanced capabilities without a golden-path need.
- Removing legacy internal site-plugin loading in the same release; it is excluded from the stable external contract first.
- Publishing the private UI library as a general SDK.
- Supporting arbitrary Node runtimes; the supported runtime remains Bun.
- Maintaining compatibility with every published alpha signature. The contract may be corrected before stable release with explicit release notes and peer lower bounds.

## Proof topology

Tests must exercise the package boundary rather than workspace aliases.

```text
packed public SDK tarballs
├── @rizom/brain
└── @rizom/site

isolated temporary consumer
├── packed brain-definition package
├── packed custom-entity package
├── packed custom-service package
├── packed custom-site package
├── packed custom-interface package
└── packed custom-message-interface package
```

Each fixture:

- has its own `package.json`, `exports`, source, declarations, and `peerDependencies`;
- imports no `@brains/*` or direct `zod` dependency;
- imports its blessed `z` and canonical helpers from one family entry point;
- contains no package-manifest import, class-only placeholder, process-role branch, cast, or `unknown` bridge;
- is packed before installation;
- is installed with packed public SDK tarballs in a temporary directory outside the monorepo;
- typechecks against generated public declarations;
- boots through the published CLI as part of the standalone consumer; and
- is exercised through public CLI, MCP, HTTP, entity, or site-build behavior.

The site golden fixture imports only `@rizom/site` and Preact. Negative package-boundary checks prove that `@rizom/brain/site` is absent and no workspace source imports `@rizom/site-sections`; release verification confirms every published `@rizom/site-sections` alpha is deprecated with a migration pointer. Tests must not inspect SQLite tables or import test-only shell constructors. Hermetic runtime assertions use public system tools, routes, health, generated site output, and process exit behavior. Provider-backed assertions run only in the nominated-alpha live tier.

## Implementation phases

Each phase follows red → green TDD and lands with a green tree. Public API changes include a Changeset in the package's appropriate core or site release lane. No phase may add casts to paper over declaration incompatibility. Golden source is written first; implementation is accepted only when it supports that source without leaking runtime bookkeeping into the example. Golden fixtures are authoritative; the ledger is a checked descriptive index, not a substitute for assignability or behavior tests.

### Phase 0 — Check in the accepted DX and freeze intended exports

1. Materialize the five accepted extension packages exactly as designed: `defineEntity`, `defineServicePlugin`, `defineInterface`, `defineMessageInterface`, and `defineSite` paths.
2. Add the root brain-definition canary using `defineBrain`, `defineBundle`, and typed `use()`.
3. Review every line as domain choice, framework declaration, or removable plumbing; reject manifest imports, casts, duplicate schema/type declarations, base-field repetition, full capability names, and placeholder lifecycle methods.
4. Add a ledger containing every symbol required by those sources and classify every currently generated export as stable, advanced-with-consumer, or internal/removable; there is no compatibility-facade category.
5. Remove `PLUGIN_API_VERSION` from the intended ledger and record every alpha signature that will be intentionally corrected.
6. Align the root definition source with the brain-model-unification plan so tuple factories and interface constructors are not frozen independently.
7. Scaffold focused tests but activate each red capability in its owning implementation phase; the committed suite remains green.

Exit gate:

- Five extension examples are approved as publishable primary documentation, and the root canary is approved as the composition contract.
- Every framework line has a stated purpose and every required symbol has an owning entry point.
- No unsupported alpha export is accidentally promised stable.

### Phase 1 — Establish package definitions, typed composition, and the packed harness

1. Introduce the shared public `PluginPackageDefinition`/configured-capability source used by family helpers, the root API, and the loader.
2. Parse config once, infer package name/version at load time, and carry typed `z.input`/`z.output` through `use()` and runtime instantiation.
3. Replace root tuple composition and separate interface constructors with typed `use()` and configured capability references, coordinated with brain-model unification.
4. Generalize the canonical packed-consumer helper, pack public SDKs and the root canary, and install them outside the monorepo with frozen manifests.
5. Add explicit peer-range verification, bounded startup/HTTP readiness, diagnostic capture, process cleanup, and a separate opt-in live-evidence mode.
6. Migrate default/named alpha exports to one canonical default package-definition export, reject legacy class/factory package shapes with an actionable migration error, and retain no public compatibility loading.

Exit gate:

- The root canary resolves generated declarations, composes all plugin families through one typed path, and boots from packed artifacts.
- Package metadata is correct without source manifest imports.
- Missing files, private imports, and incompatible peers fail deterministically.

### Phase 2 — Make entity definitions complete and behaviorally proven

1. Implement `defineEntity()` with runtime-composed base schema, inferred `EntityOf`, default markdown/frontmatter adapter, and typed custom encode/decode escape hatch.
2. Implement definition-based typed reads and writes without author-supplied type strings or generic arguments.
3. Implement `defineProjection()` and target helpers over the existing scheduler-owned projection runtime, plus `defineEntityPackage()` for focused multi-entity composition.
4. Activate the entity fixture and prove markdown round-trip, default/explicit visibility, CRUD, duplicate/conflict behavior, list/count/FTS, deletion, restart durability, and deterministic projection convergence.
5. Verify restricted entities do not escape public scope and target helpers cannot write the wrong entity type.
6. Keep data sources and create interception out of the stable ledger unless the fixture gains a concrete domain need.
7. Move embedding completion and semantic-ranking assertions to the live tier.

Exit gate:

- The primary entity source contains domain schemas and projection behavior, not base fields, adapter boilerplate, package metadata, string type names, or runtime process concepts.
- The packed entity survives restart and its deterministic projection executes in the worker through public behavior.

### Phase 3 — Make service definitions and durable jobs operationally sufficient

1. Implement `defineServicePlugin()` with inferred parsed config/setup state and lifecycle-owned resources.
2. Replace the public positional tool helper with canonical object-style `defineTool()` and plain typed output while preserving runtime confirmation behavior.
3. Implement schema-first `defineJob()`, `.handle()`, typed job references/status, immutable service registration, enqueue, progress, cancellation signals, and a narrow retry/deadline subset.
4. Keep batch enqueue private until a golden source requires it.
5. Restore real public types and stable methods for templates/views instead of `unknown` approximations; verify tools, resources, instructions, prompts, entity access, and messaging used by the golden source.
6. Activate the service fixture and prove a tool enqueues a custom job, the worker executes it, progress and terminal typed result are observable, and restart/retry/cancellation remain queue-owned.
7. Prove failed registration rolls back context-owned tools, subscriptions, handlers, and definitions.

Exit gate:

- The packed service performs synchronous tool work and durable worker work from one config schema without plugin IDs, success wrappers, handler registration, queue types, package metadata, or process branches in author source.

### Phase 4 — Make `@rizom/site` the complete one-import site SDK

1. Move the canonical `defineSection`, `sectionGroup`, associated section types, and blessed `z` implementation into `@rizom/site`; add `defineSite()` as the canonical default-export helper.
2. Derive runtime site validation and all public site types from the canonical SDK source, covering layouts, routes, content, sections, entity display, CSS, head scripts, and static assets.
3. Exclude embedded runtime plugins from the stable site definition and document a separate explicit plugin export/package for advanced backend behavior.
4. Remove the `@rizom/brain/site` export map and entry. Migrate every source, fixture, test, scaffold, and current document to `@rizom/site`; historical changelogs may retain old package names as history.
5. Migrate every internal `@rizom/site-sections` consumer, including `shared/site-composition`, `sites/rizom`, `sites/rizom-ai`, and their tests, to import from `@rizom/site` directly.
6. Regenerate the `brain-cli init` site source from the site golden fixture and add an exact compatible direct `@rizom/site` dependency to the generated package manifest, so a new consumer starts on the one-import canonical path instead of relying on a transitive dependency.
7. Activate the one-import site fixture and test compile, runtime parsing, and every supported field without direct `zod`, Brain authoring imports, casts, or monorepo tooling.
8. Boot the packed consumer, trigger an app-managed preview rebuild on the running app, and inspect generated routes, layout, CSS, head script, content section, and static asset.
9. Deprecate every published `@rizom/site-sections` alpha with a pointer to `@rizom/site`, remove the workspace package, and add negative checks for source imports and stable publication.
10. Publish a stable compatible `@rizom/site` version and preserve independent theme selection/versioning before Brain stable nomination.

Exit gate:

- The external site source imports only `@rizom/site` and Preact, then builds every stable field through the real app-managed path.
- Runtime validation derives from the canonical SDK, `@rizom/brain/site` is absent, and `@rizom/site-sections` is deprecated on npm with no remaining workspace package or source consumers.

### Phase 5 — Make generic and message interfaces declarative and lifecycle-owned

1. Implement `defineInterface()`, schema-aware `defineRoute()`, explicit public/protocol security, canonical caller resolution, and enqueue-only typed jobs. Keep generic agent operations out until a golden package fixes their request-object contract.
2. Implement `defineDaemon()` as one supervised abortable run task with readiness/health and runtime-owned cleanup.
3. Activate the generic-interface fixture and prove public routing, protocol authentication failure/success, caller permission/anchor resolution, typed enqueue, daemon health/shutdown, and worker exclusion without model calls.
4. Implement `defineMessageInterface()` with declarative channel registration, supervised listen, `messages.receiveAuthenticated()`, normalized output, send/optional edit, outbound deliver, lazy attachments, and runtime-owned progress/confirmation bookkeeping.
5. Activate the message fixture and hermetically prove descriptor/provider registration, outbound delivery, normalized send/edit contracts, listener lifecycle, recipient validation, typed delivery failure, and worker exclusion.
6. Keep tool-backed API routes, operator-session auth, progress registries, support flags, status unions, and native-card requirements out of the stable authoring surface.
7. Exercise real agent chat, confirmation, inbound conversation, attachments, and model-backed progress only in the live nominated-alpha tier.

Exit gate:

- Generic and message authors express transport authentication and delivery, while the runtime owns caller trust, agent context, daemon supervision, channels, conversations, and progress plumbing.
- Conversational and outbound-only transports use one coherent definition style with no placeholders.

### Phase 6 — Documentation, stable export freeze, and nominated-alpha evidence

1. Rewrite plugin-system, quick-reference, external-plugin, external-site, and stability docs directly from the checked golden sources.
2. Publish the exact stable symbol/capability ledger and strip or mark internal every unsupported alpha export.
3. Remove `PLUGIN_API_VERSION`; document stable peer ranges and make the harness verify them explicitly.
4. At nomination, freeze the exact final golden packages as the `0.2.0` compatibility baseline; after stable, compile and run those frozen fixtures against every later `0.2.x` candidate.
5. Verify package tarball contents, export maps, declarations, the canonical site version, absence of removed authoring subpaths, and license metadata.
6. Merge current `main`, nominate its newest published Brain alpha, advance all golden peer lower bounds together, and run all six packed packages against that exact alpha and the compatible published site SDK.
7. Implement and run the bounded provider-backed live matrix against that same alpha, then add migration notes for every corrected alpha signature.
8. Add focused automated audits for actionable package-load/config/conflict errors and every documented TypeScript example, then run the complete final nomination evidence protocol below.
9. Request explicit approval before changing prerelease state or performing any stable registry action.
10. Correct and test the coordinated release order: one global stable version commit, stable site-lane publication, stable-site registry matrix, then stable core publication.

Exit gate:

- Documentation examples compile from their published locations.
- Local-tarball and registry-installed hermetic matrices pass.
- Embeddings, semantic retrieval, agent conversation/confirmation, inbound messaging, attachments, and progress pass in bounded live evidence.
- `docs/public-release/STABILITY.md` names the four supported use cases, canonical entry points, and explicit exclusions.

## Validation matrix

### Package and composition boundary

- canonical default package-definition export and intentional alpha named-export migration;
- packed root `defineBrain` / `defineBundle` / typed `use()` composition across every family;
- schema-derived config input/output typing and runtime validation;
- inferred package name/version and local capability scoping;
- explicit peer-range success and failure across Brain and stable site SDK packages;
- tarball inventory, ESM resolution, generated declarations, export ledger, and license metadata;
- no `@brains/*`, Effect, shell, direct `zod`, manifest imports, or workspace aliases in fixtures.

### Entity

- inferred entity type with runtime-composed base fields;
- default and custom markdown/frontmatter round-trip;
- default and explicit visibility;
- typed-definition CRUD, duplicate, conflict, list, count, FTS, and deletion;
- projection unchanged-input memo, changed-input convergence, target-type safety, and worker execution;
- restart durability;
- live-only embedding completion and semantic ranking.

### Service

- parsed config defaults/transforms and inferred setup state;
- object-style typed tools with plain output and confirmation behavior;
- typed resources, instructions, templates, views, prompts, entity access, and messaging;
- immutable job handler inventory in web and worker composition;
- typed enqueue/status/result, retry, cancellation, deadline, progress, and terminal failure;
- lifecycle order and rollback of context-owned registrations;
- no execution dependency on web-only state.

### Site

- one-import `@rizom/site` source with `defineSite`, sections, and blessed `z`;
- canonical type/runtime-schema assignability and full-field runtime parsing;
- custom layout and route, content, sections, entity display, CSS, head script, and static asset;
- absence of the `@rizom/brain/site` export and workspace `@rizom/site-sections` package, plus npm deprecation of every published `@rizom/site-sections` alpha;
- `brain-cli init` generates the golden one-import source, an exact compatible direct `@rizom/site` dependency, and an isolated project that installs and typechecks;
- preview rebuild through the running app;
- a stable independently versioned SDK package and independent theme selection.

### Generic interface

- typed config/setup state;
- public route and protocol authentication success/failure;
- invalid body rejection and typed response serialization;
- canonical public/trusted/admin permission, anchor, and actor resolution;
- typed enqueue-only job use;
- supervised daemon ready/warning/error health, abort, and shutdown;
- no route, daemon, or interface registration in worker composition;
- live-only agent chat and confirmation.

### Message interface

- declarative descriptor, recipient validation, and provider ownership;
- outbound-only delivery success and typed failure;
- normalized send/edit output with stable text fallback;
- listener startup, health, abort, and shutdown;
- lazy attachment contract and runtime policy boundary;
- no support flags, progress registries, or placeholder conversational methods;
- live-only inbound conversation, confirmation, attachment, and model-backed progress flow.

### Author experience

- one canonical family import and one default definition export;
- no casts, private imports, duplicate schemas/types, package metadata, runtime-owned entity fields, fully qualified capability names, queue/registry calls, or process concepts;
- no placeholder lifecycle methods or manually repeated inferred callback types;
- config, setup state, tool/job inputs and outputs, callers, entities, and projections infer from declared schemas/definitions;
- advanced behavior composes the golden definition style rather than replacing it;
- package-load, config-validation, and capability-conflict errors are actionable without parsing logs.

### Compatibility

- frozen `0.2.0` fixtures compile and run against each later `0.2.x` candidate;
- author-constructed DTO additions remain optional;
- runtime-produced result additions do not remove, narrow, or widen existing fields to `unknown`;
- stable callback inputs remain contravariantly usable;
- stable behavior does not change merely because declarations remain assignable;
- every unannotated authoring export remains present and compatible;
- explicit peer checks reject incompatible resolved versions.

## Final nomination evidence protocol

Run this protocol from a clean commit containing current `main`. Record the git SHA, exact Brain/site versions, npm packument versions and dist-tags, Bun/Node versions, provider model IDs, command results, durations, and linked CI artifacts in `docs/public-release/evidence/AUTHORING_0.2.md`. Do not commit provider secrets, raw credentials, or private conversation content.

### Hermetic and repository checks

All commands must exit zero:

```bash
bun run format:check
bun run typecheck
bun run lint
bun run arch:check
bun run changeset:check
bun run docs:check
bun run test

bun test packages/brain-cli/test/public-authoring-golden.test.ts
bun run test:packed:compat

RIZOM_PUBLIC_API_REGISTRY_EVIDENCE=1 \
RIZOM_PUBLIC_API_BRAIN_VERSION=<final-alpha> \
RIZOM_PUBLIC_API_SITE_VERSION=<published-compatible-site> \
bun test packages/brain-cli/test/public-authoring-registry-packed.test.ts
```

Before the sweep, criterion 12 must have focused tests for missing/invalid package loading, config validation, and capability conflicts that assert the package/plugin, field or capability, and corrective action. Criterion 15 must have an automated inventory proving every documented TypeScript example comes from, or compiles with, checked fixture source.

### Provider-backed and eval checks

Add `packages/brain-cli/test/public-authoring-live-packed.test.ts`, guarded only by `RIZOM_PUBLIC_API_LIVE_EVIDENCE=1`, and run it against the same exact final alpha:

```bash
RIZOM_PUBLIC_API_LIVE_EVIDENCE=1 \
RIZOM_PUBLIC_API_BRAIN_VERSION=<final-alpha> \
RIZOM_PUBLIC_API_SITE_VERSION=<published-compatible-site> \
AI_API_KEY=<provider-secret> \
bun test packages/brain-cli/test/public-authoring-live-packed.test.ts

cd packages/brain-cli
AI_API_KEY=<provider-secret> OPENAI_API_KEY=<provider-secret> \
bun run eval:personal --parallel --max-parallel 3
AI_API_KEY=<provider-secret> OPENAI_API_KEY=<provider-secret> \
bun run eval:team --parallel --max-parallel 3
```

The checked `brain.eval.yaml` model (`gpt-5.6-luna`) and judge (`gpt-5.4-mini`) are the nomination eval configuration; changing either requires review and a new recorded run. Both suites must report zero failed tests. The live matrix has a 15-minute overall deadline, at most 60 seconds per provider call, and at most two retries limited to provider `429`/`5xx` failures. Validation, schema, authorization, assertion, or lifecycle failures are never retried. Its evidence must prove embedding completion, semantic ordering, agent response, confirmation completion, inbound conversation continuity, lazy attachment fetch, durable progress delivery, bounded shutdown, and the absence of leaked secrets in diagnostics.

After authorized stable site publication, rerun the registry command with the exact stable site version and attach that result before stable Brain publication. A transient infrastructure rerun must be identified as such in the evidence file; failed cases may not be removed, waived, or hidden by averaging.

## Acceptance criteria

1. Five standalone extension packages are approved unchanged as primary documentation; a sixth brain-definition package is approved as the root compatibility canary.
2. Entity, service, interface, message-interface, and site sources use the accepted canonical vocabulary and one family import each.
3. Golden sources contain domain choices rather than runtime plumbing: no casts, private imports, package metadata, process concepts, duplicate schemas/types, runtime-owned base fields, queue/registry calls, or placeholder methods.
4. All six packages pass isolated local-tarball and registry-installed hermetic matrices against one nominated published Brain alpha plus a stable compatible `@rizom/site` version.
5. The root canary composes every plugin family through typed `use()` without tuple factories, repeated IDs, interface constructors, or environment mappers.
6. Config is authored once, parsed once, and inferred through composition, setup state, and every capability callback.
7. Custom entity data uses generated base schema/default adapter, survives restart, remains visibility-safe, supports typed CRUD/FTS, and converges through one deterministic typed projection.
8. A custom service tool enqueues a schema-backed typed job that crosses the supervised web/worker boundary through the existing durable queue.
9. A custom site imports only `@rizom/site` and Preact, then exercises every stable structural field through a real app-managed build; `brain-cli init` generates the same canonical source with a direct compatible SDK dependency.
10. A generic interface proves protocol authentication, canonical caller resolution, typed route/enqueue behavior, daemon health, and shutdown; a separate message interface proves outbound delivery and normalized listener/send/edit lifecycle.
11. Provider-backed live evidence proves embeddings, semantic ranking, agent chat/confirmation, inbound conversation, attachments, and model-backed progress against the same nominated alpha.
12. Package-load, config-validation, and capability-conflict failures include the relevant package/plugin, field or capability, and corrective action.
13. Generated declarations contain no private imports and cannot drift from runtime schemas or canonical source types.
14. Every unannotated authoring export appears in the published stable ledger; unsupported alpha exports and `PLUGIN_API_VERSION` are removed or internal before stable.
15. All documented TypeScript examples compile from checked fixture source in CI.
16. Stable peer ranges, route/job/entity exclusions, sole `@rizom/site` ownership, removed alpha surfaces, hermetic/live test boundaries, and `0.2.x` compatibility policy are explicit.
17. Full format, typecheck, tests, forced lint, package-boundary checks, packed smokes, bounded live evidence, and targeted personal/team evals pass before stable nomination.

## Risks and mitigations

- **Definition helpers become a second framework.** Keep them as typed normalization/identity functions over existing runtime ownership; no chained DSL, hidden process model, or alternate queue/router.
- **The declarative path cannot express an advanced consumer.** Add a focused declarative capability proven by a checked external example; do not preserve the alpha base classes as a parallel authoring system.
- **The SDK freezes internal abstractions accidentally.** Definitions expose schemas, callers, abort signals, progress, and domain DTOs—not shell/services, registries, queue options, or process roles.
- **Root composition diverges from brain-model unification.** Share one configured-capability source and do not land competing tuple/definition contracts in parallel.
- **Durable external jobs violate worker isolation.** Derive inventory from immutable service handlers and prove web validation plus worker execution from the same packed package without web-state capture.
- **Typed jobs overpromise runtime result safety.** Validate persisted terminal output against the declared output schema before exposing typed status/result.
- **Route work expands into the full HTTP redesign.** Land only schema-aware handler routes with public/protocol security; defer operator sessions, tool routes, parameters, normalized registry, and lifecycle mutation.
- **Caller resolution trusts unauthenticated IDs.** Route protocols authenticate before caller construction, and non-HTTP APIs are explicitly named `resolveAuthenticated` / `receiveAuthenticated` to mark the transport trust boundary.
- **Message abstractions freeze presentation internals.** Guarantee text fallback and optional typed cards/attachments; keep native card rendering and progress bookkeeping runtime-owned.
- **Site ownership forks again.** Keep `@rizom/site` as the only exported authoring path, remove the Brain subpath and workspace sections package, and deprecate every published sections alpha before stable.
- **Compile fixtures pass while runtime loading fails.** Require isolated pack/install/boot/behavior/restart/shutdown for each extension.
- **Provider calls make compatibility tests flaky.** Keep the nightly/release packed matrix hermetic and run bounded live evidence only for nominated alphas with diagnostics and retry policy.
- **Documentation drifts from signatures.** Source primary examples directly from fixtures and reject uncompiled TypeScript snippets.
- **Alpha compatibility blocks correction.** Correct signatures before stable, publish migration notes, and advance alpha peer lower bounds rather than carrying obsolete overloads.
- **The published surface remains broader than the promise.** Treat every unannotated authoring export as stable and strip or mark internal everything else before nomination.

## Related work

- [Packed compatibility test tiering](./packed-compatibility-test-tiering.md) — focused PR feedback, one default packed canary, and the nightly/release compatibility lifecycle.
- [Public dashboard-widget and CMS-workspace authoring](./public-operator-surface-authoring.md) — approved additive `0.2.x` milestone that does not gate `v0.2.0`.
- [NPM package boundaries](./npm-package-boundaries.md) — later official plugin publishing and public-only dependency proofs.
- [Independent site and theme package versioning](./site-package-independent-versioning.md) — external site publishing and exact hosted pins.
- [HTTP route registry hardening](./http-route-registry-hardening.md) — post-baseline route ownership and authorization improvements.
- [Brain model unification](./brain-model-unification.md) — stable `v0.2.0` nomination and canary crossover.
- [API stability](../public-release/STABILITY.md) — current compatibility policy to update at Phase 6.
