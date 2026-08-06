# Plan: Public authoring API compatibility for `v0.2.0`

## Status

**Proposed — P0 stable-release gate.** The generated `@rizom/brain/*` declarations are clean enough for alpha use, and an external site has exercised the public package path, but the authoring API is not yet sufficient or proven as a patch-stable `0.2.x` contract for all four required use cases:

1. custom entity types;
2. custom service plugins;
3. custom sites; and
4. custom interfaces, including message interfaces.

Stable `v0.2.0` must not be nominated until this plan's packed compatibility matrix passes against one published alpha. This plan is narrower than general plugin-system cleanup: it freezes only the contracts needed by those four use cases.

## Goal

An author in a standalone repository can depend on `@rizom/brain`, import only documented public subpaths, build one of the four extension types through one obvious and coherent authoring path, install it into a packed Brain consumer, and exercise it through public runtime behavior without importing `@brains/*`, reading runtime databases, understanding runtime process roles, or depending on monorepo tooling.

Passing runtime tests is necessary but not sufficient. The API must also be pleasant enough to preserve for the full `0.2.x` line: domain code should dominate each example, types should infer where the runtime already knows them, lifecycle and registration vocabulary should be consistent, and advanced capabilities should compose without turning any base class into a shell facade.

For the `0.2.x` line:

- patch releases preserve the documented authoring contracts;
- additive methods and DTO fields remain allowed;
- removals, renamed required fields, narrowed input types, and semantic changes wait for `0.3.0` unless correcting a security defect;
- external packages declare `@rizom/brain: ">=0.2.0 <0.3.0"` after stable release;
- generated declarations contain no private workspace, Effect, shell, or database types.

## Release decision

The current API is **alpha-usable, not stable-complete**.

| Use case              | Existing foundation                                                                                                    | Remaining release blocker                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Custom entity type    | `EntityPlugin`, entity schemas/adapters, data sources, create interception, projection rules, controlled entity access | No packed create/update/search/restart/projection proof; examples and generic signatures have drifted                  |
| Custom service plugin | Lifecycle, tools, resources, instructions, entity access, messaging, prompts/templates/views                           | Durable job declaration/enqueue is not public; documentation promises hooks the public delegate does not forward       |
| Custom site           | Published loader, `SitePackage`, standalone site canary, exact package pins                                            | `@rizom/brain/site` duplicates and trails the runtime contract; no packed full-field site-build proof                  |
| Custom interface      | `InterfacePlugin`, `MessageInterfacePlugin`, web routes, agent calls, channel delivery descriptors                     | Public context omits canonical permission lookup, daemon lifecycle, and job enqueue; delegate/docs signatures disagree |

## Author-experience standard

API elegance is a release property, not optional polish. Before changing implementation types, write one ideal **golden-path package** for each use case from the author's point of view. Those packages become the compile fixtures, runtime fixtures, and documentation source.

A golden path passes only when:

- there is one obvious base class or definition helper for the use case;
- the minimal example contains domain schema, behavior, and configuration—not queue, registry, shell, process-role, or lifecycle plumbing;
- generic parameters and callback inputs infer unless the author is choosing a real domain type;
- the author writes no casts, `unknown` bridges, duplicated runtime fields, internal IDs, or placeholder methods;
- each capability has one canonical declaration path, with any static-versus-dynamic distinction named and justified consistently;
- config is defined once and drives runtime validation, constructor input, and documented YAML shape;
- schemas and DTOs are defined once and remain usable in both callbacks and tests;
- lifecycle names and ordering mean the same thing across entity, service, and interface plugins;
- errors identify the package, plugin, capability, invalid field, and corrective action without requiring log-schema parsing;
- advanced behavior is added by composing focused plugins or optional capabilities, not by exposing a god context;
- copying the documented example into a standalone package compiles unchanged.

Author-facing complexity is reviewed from examples inward. Add a `define*` helper only when at least two golden paths demonstrate repeated non-domain boilerplate; do not introduce a builder DSL merely to reduce line count. Conversely, do not preserve awkward constructor generics or manual metadata simply because the runtime can technically execute them.

The review asks four concrete questions for every public symbol:

1. Is this a domain choice the author must make?
2. Can the runtime infer or own it instead?
3. Is the same concept named and shaped consistently elsewhere?
4. Are we willing to preserve it through every `0.2.x` patch?

A “no” to the fourth question keeps the symbol internal.

## Contract boundary

### Public package entry points

The stable authoring registry is limited to:

- `@rizom/brain` — `defineBrain`, `defineBundle`, blessed `z`, and compatibility metadata;
- `@rizom/brain/plugins` — plugin base classes, lifecycle contexts, tools/resources, projection rules, channels, and public DTO schemas;
- `@rizom/brain/entities` — entity, adapter, datasource, search, pagination, frontmatter, and mutation contracts;
- `@rizom/brain/services` — service-specific authoring helpers;
- `@rizom/brain/interfaces` — route, daemon, messaging, permission, and interface DTO contracts;
- `@rizom/brain/templates` — template and renderer contracts;
- `@rizom/brain/site` — the complete site-package authoring contract.

`@rizom/brain/model`, `@rizom/brain/deploy`, and the CLI are public products but are not plugin-authoring dependencies for this compatibility sign-off.

### Stable plugin families

A package may export one `PluginFactory` returning one plugin or an array of plugins. Composition is preferred over making every base class own every capability:

- entity persistence and derivation use `EntityPlugin`;
- tools, resources, integrations, and durable work use `ServicePlugin`;
- HTTP/channel transports and long-running listeners use `InterfacePlugin` or `MessageInterfacePlugin`;
- a package needing several concerns returns several focused plugin instances.

Do not add entity-registration or route-registration shortcuts to `ServicePlugin` merely because internal service plugins historically own mixed responsibilities. Either forward an already documented stable hook deliberately or remove the unsupported claim from external documentation before `0.2.0`.

### Stable runtime behavior

The compatibility promise covers observable behavior, not just TypeScript compilation:

- configuration reaches the package factory from `brain.yaml`;
- registration is finalized before ready hooks;
- failed registration rolls back owned capabilities;
- shutdown is terminal and releases owned resources;
- entity writes remain schema-validated, visibility-aware, searchable, and restart-durable;
- custom projection rules use the scheduler-owned projection runtime;
- durable custom jobs use the existing job queue and execute in the worker child;
- interface daemons run only in the web child and participate in health and shutdown;
- route and permission behavior uses the shared host and canonical permission service;
- site packages build through the app-managed site-builder path.

Storage schemas, queue tables, shell objects, internal message channels, and process-role switches remain private.

## Architecture decisions

### 1. One source for each public contract

Do not hand-maintain a second structural approximation of an internal contract. The public entry may curate or rename fields, but runtime validation and exported TypeScript types must derive from the same schema or source type.

The first required correction is `SitePackage`: `@rizom/brain/site` must represent every supported runtime field, including optional `plugin`, `content`, `sections`, `themeOverride`, `headScripts`, and `staticAssets`. The public declaration and runtime site-package schema must be tested for mutual assignability.

Apply the same rule to route, daemon, job, permission, message, and entity DTOs. Declaration bundling may inline public structures, but it must not create an independently maintained copy.

### 2. Durable plugin work uses immutable handler registration

Custom jobs must use the existing queue. Expose the smallest public contracts for:

- schema-backed job data;
- immutable handler registration during plugin registration;
- enqueue and batch enqueue;
- cancellation/deadline signals;
- progress reporting; and
- typed success/failure results.

The worker execution inventory remains derived from finalized handler registrations. Do not add a hand-maintained dependency manifest, second queue, cross-process bus, environment switch, or web-to-worker closure transport.

A packed test plugin must prove that the same external package registers validation/enqueue capability in the web child and execution capability in the worker child. Handler construction must not depend on web-only mutable state. Execution-only messaging dependencies use the existing explicit execution-subscription mechanism when genuinely required.

### 3. Interfaces use existing runtime ownership

Expose a curated subset of capabilities already present in the internal interface context rather than a broad shell facade:

- `agent.chat()` and `agent.confirmPendingAction()`;
- canonical `permissions.getUserLevel()` and `permissions.isAnchor()`;
- web/API route declarations supported during the `0.2` compatibility window;
- `createDaemon()` or equivalent lifecycle-owned daemon registration;
- enqueue-only job access, with execution owned by a service plugin when needed;
- channel descriptor and delivery-provider registration for message interfaces.

The daemon hook must be forwarded by the public delegate, participate in runtime health, start only after readiness, and stop during plugin shutdown. A custom interface must not open an unmanaged listener during module import or constructor execution.

Full HTTP route-registry redesign remains in [`http-route-registry-hardening.md`](./http-route-registry-hardening.md). This plan only characterizes and preserves the current route contract needed by external interfaces; it does not introduce parameter routing, a new authorization model, or `context.http.register()` before that design is ready.

### 4. Entity authoring stays schema-first

The stable entity contract includes:

- `BaseEntity` and visibility;
- a Zod schema authored with the blessed `z`;
- `EntityAdapter` or `BaseEntityAdapter`;
- `EntityTypeConfig`;
- markdown/frontmatter round-tripping;
- controlled reads and writes through context namespaces;
- data sources and create interception; and
- scheduler-owned `ProjectionRule` declarations.

No external entity package receives direct database, FTS, embedding, queue-repository, or projection-store access.

The fixture must test default visibility, explicit restricted visibility, markdown import/export, duplicate IDs, update conflicts, search result shape, deletion, restart durability, and one projection rule. Compile-only adapter conformance is insufficient.

### 5. Site authoring is structural and complete

`@rizom/brain/site` owns the stable author-facing `SitePackage` contract. It must support:

- custom Preact layouts;
- handwritten routes and sections;
- optional site plugin factory;
- content definitions and schema-first section groups;
- per-entity display metadata;
- additive package CSS;
- global head scripts; and
- static assets.

Themes remain independently selected and versioned. A site package does not own the base theme. The stable site contract must remain usable from a standalone repository with only public npm dependencies.

### 6. Public examples are executable contracts

Golden-path fixtures are designed before their backing API and reviewed as product interfaces, not written afterward to explain whatever implementation emerged. Every TypeScript example in plugin, entity, site, and interface authoring documentation must either:

- be imported from a checked fixture; or
- be extracted and compiled in CI.

Do not retain compatibility overloads solely to make an obsolete example compile. Choose one canonical signature, update the docs and fixture together, and advance the alpha peer lower bound when needed.

### 7. Compatibility is enforced by package tests

`PLUGIN_API_VERSION` must describe the compatibility line rather than accidentally imply that every alpha package version is a different API. Before stable release, settle it as a `0.2` compatibility marker or remove it in favor of peer-range-only diagnostics.

The authoritative gates are:

- peer dependency compatibility;
- clean generated declarations;
- compile-time use-case fixtures;
- packed install and runtime tests; and
- explicit stable-surface documentation.

A string marker is not a substitute for those gates.

## Non-goals

- A plugin marketplace or discovery protocol.
- Dynamic plugin install, unload, or re-enable in a running shell.
- Publishing every first-party `@brains/*` plugin independently before `0.2.0`.
- Exposing shell, plugin-manager, database, worker, or registry implementations.
- Completing the HTTP route-registry hardening plan.
- Publishing the private UI library as a general SDK.
- Supporting arbitrary Node runtimes; the supported runtime remains Bun.
- Maintaining compatibility with every published alpha signature. The contract may be corrected before stable release with explicit release notes and peer lower bounds.

## Proof topology

Tests must exercise the package boundary rather than workspace aliases.

```text
@rizom/brain source
└── bun pm pack
    └── temporary standalone consumer
        ├── packed custom-entity package
        ├── packed custom-service package
        ├── packed custom-site package
        └── packed custom-interface package
```

Each fixture:

- has its own `package.json`, `exports`, source, declarations, and `peerDependencies`;
- imports no `@brains/*` or direct `zod` dependency;
- is packed before installation;
- is installed with the packed `@rizom/brain` tarball in a temporary directory outside the monorepo;
- typechecks against generated `dist/*.d.ts`;
- boots through the published CLI; and
- is exercised through public CLI, MCP, HTTP, entity, or site-build behavior.

Tests must not inspect SQLite tables or import test-only shell constructors. Runtime assertions are made through public system tools, routes, health, generated site output, and process exit behavior.

## Implementation phases

Each phase follows red → green TDD and lands with a green tree. Public API changes include a core-lane Changeset. No phase may add casts to paper over declaration incompatibility. Golden-path source is written first; implementation is accepted only when it supports that source without leaking runtime bookkeeping into the example.

### Phase 0 — Design golden paths and freeze the contract ledger

1. Write ideal standalone golden-path packages for custom entity, service, site, generic interface, and message-interface authoring before changing public implementation types.
2. Review every line as domain choice, necessary framework declaration, or removable runtime plumbing.
3. Reject casts, duplicate config/schema declarations, placeholder overrides, internal identifiers, and explicit types the compiler can infer.
4. Add a checked contract ledger listing every symbol and method required by the accepted golden paths.
5. Inventory generated declarations against that ledger.
6. Turn the golden paths into initially red compile fixtures using only public imports and the blessed `z`.
7. Characterize current runtime loading for default and named plugin factory exports.
8. Record each documentation/runtime mismatch as a failing focused test before correction.

Exit gate:

- Each use case has an approved example we would be willing to publish unchanged as the primary `0.2.x` documentation.
- Every line of framework boilerplate has a stated purpose; demonstrated repetition is either removed or deliberately retained.
- Every promised capability has an owning entry point and a red or green proof.
- Unsupported internal conveniences are removed from the stable claim instead of being accidentally frozen.

### Phase 1 — Build the packed external-authoring harness

1. Generalize the existing canonical packed-consumer test helper without coupling it to workspace resolution.
2. Pack `@rizom/brain` and each external fixture.
3. Install them in isolated temporary consumers with frozen manifests.
4. Add bounded process startup, HTTP readiness, clean termination, and diagnostic capture.
5. Ensure test cleanup leaves no child processes, temporary databases, or generated output.
6. Keep the four use-case assertions independent so one fixture cannot mask another.

Exit gate:

- All fixtures install and resolve only generated public declarations.
- A deliberate `@brains/*` import, missing packed file, or incompatible peer range fails the harness.

### Phase 2 — Make custom entities patch-stable

1. Correct `EntityPlugin` generic defaults or examples so the documented minimal entity compiles exactly as shown.
2. Ensure public entity schemas and visibility types come from one source.
3. Prove schema registration, adapter markdown round-trip, create/get/list/update/search/delete, and restart durability.
4. Prove controlled context mutation and search result typing.
5. Add one data source or create interceptor proof.
6. Add one scheduler-owned projection rule and verify it converges through the generic projection job in the worker child.
7. Verify restricted data is not exposed through public scope.

Exit gate:

- The packed entity package survives a process restart and remains usable through system tools.
- Its projection executes without a package-specific runtime patch or private import.

### Phase 3 — Make custom service plugins operationally sufficient

1. Settle the stable `ServicePlugin` capability list and remove unsupported documentation claims.
2. Preserve lifecycle, tools, resources, instructions, prompts, templates, views, entity access, and messaging contracts.
3. Add the smallest public durable-job declaration and enqueue namespaces.
4. Forward immutable job-handler registration through the public delegate.
5. Prove config parsing and both default/named factory exports.
6. Prove a tool enqueues a custom job, the worker executes it, progress is observable, and the durable result survives web/worker separation.
7. Prove failed registration rolls back tools, subscriptions, and handlers.

Exit gate:

- A packed service plugin performs synchronous tool work and durable worker work without shell or queue internals.
- Restart, retry, cancellation, and shutdown remain owned by the existing queue/runtime.

### Phase 4 — Unify and prove custom site authoring

1. Replace the hand-maintained public `SitePackage` approximation with a contract derived from the runtime schema/type.
2. Make the plugin factory optional consistently in runtime validation and public typing.
3. Export the complete supported route, section, content, display, CSS, script, and static-asset types.
4. Add mutual-assignability tests between public and runtime site contracts.
5. Extend the standalone site fixture to use every supported field.
6. Boot the packed consumer, trigger an app-managed preview rebuild on the running app, and inspect generated routes, layout, CSS, head script, content section, and static asset.
7. Preserve independent theme selection and exact package-version behavior.

Exit gate:

- The external site compiles, loads, and builds without casts or monorepo imports.
- Public and runtime `SitePackage` contracts cannot drift independently.

### Phase 5 — Make custom interfaces safe and lifecycle-owned

1. Forward the current supported web/API route declarations through public delegates.
2. Expose canonical permission lookup and anchor checks from the existing permission service.
3. Forward lifecycle-owned daemon creation/registration and health.
4. Expose enqueue-only job operations needed by interfaces; custom execution remains in a service plugin.
5. Settle one request-object signature for message delivery/editing and update all docs/fixtures.
6. Prove generic interface routes, permission decisions, daemon ready/health/shutdown, and agent confirmation calls.
7. Prove message-interface channel descriptors, outbound delivery, progress updates, inbound chat context, and clean shutdown.
8. Verify worker-only boot registers no interface, route, or daemon capability from the external package.

Exit gate:

- A packed interface can safely identify a caller, call the agent, mount a route, run a supervised daemon, enqueue durable work, and shut down without leaked processes.
- A packed message interface can complete one conversational and one outbound-only flow.

### Phase 6 — Documentation and compatibility freeze

1. Rewrite plugin-system, quick-reference, external-plugin, external-site, and stability docs from checked fixtures.
2. Publish the exact stable symbol/capability ledger.
3. Settle `PLUGIN_API_VERSION` behavior and stable peer-range guidance.
4. Add a generated-declaration compatibility check that rejects removed or narrowed ledger contracts during `0.2.x` development.
5. Verify package tarball contents and all export-map targets.
6. Run all four packed fixtures against the nominated published alpha, not only the workspace build.
7. Add migration notes for every alpha signature intentionally corrected before stable.

Exit gate:

- Documentation examples compile from their published locations.
- The nominated alpha passes both local-tarball and registry-installed compatibility matrices.
- `docs/public-release/STABILITY.md` names the four supported use cases and their explicit limits.

## Validation matrix

### Package boundary

- default and named plugin exports;
- one plugin and plugin-array factories;
- config input/output typing;
- peer range success and failure;
- tarball file inventory;
- ESM import and generated declaration resolution;
- no `@brains/*`, Effect, shell, or direct `zod` imports.

### Entity

- markdown/frontmatter round-trip;
- default and explicit visibility;
- CRUD, duplicate, conflict, list, count, and search;
- datasource/interceptor registration;
- projection unchanged-input memo and changed-input convergence;
- restart durability and derived embedding completion.

### Service plugin

- lifecycle order and rollback;
- tools, resources, instructions, templates, prompts, and messaging;
- handler registration in web and worker composition;
- enqueue, retry, cancellation, deadline, progress, and terminal result;
- no execution dependency on web-only state.

### Site

- custom layout and route;
- content and section definitions;
- entity display metadata;
- theme override, head script, and static asset;
- preview rebuild through the running app;
- packed external package and independently selected theme.

### Interface

- public and authenticated routes;
- public/trusted/Admin and anchor permission resolution;
- daemon ready, warning/error health, and shutdown;
- agent chat and pending-action confirmation;
- channel descriptor and delivery provider;
- message send/edit/progress behavior;
- no interface capability in worker-only composition.

### Author experience

- golden-path packages contain no casts, internal imports, duplicated configuration schemas, or runtime process concepts;
- minimal examples require no placeholder lifecycle methods;
- callback and configuration types infer from schemas and declarations wherever possible;
- static and dynamic registration choices are consistent and documented from the same fixtures;
- package, plugin, capability, and field names appear in actionable author-facing errors;
- examples for advanced behavior extend or compose the golden path rather than replacing it with a different API style.

### Compatibility

- old `0.2.0` fixture compiles and runs against each later `0.2.x` candidate;
- additive fields do not become required accidentally;
- stable callback inputs remain contravariantly usable;
- stable result fields are not removed or widened to `unknown`;
- error behavior remains typed or documented rather than requiring log parsing.

## Acceptance criteria

1. Four standalone golden-path packages are approved for clarity and can serve unchanged as primary documentation.
2. The golden paths contain domain choices rather than runtime plumbing: no casts, shell/process concepts, duplicate schemas, placeholder overrides, or manually repeated inferred types.
3. Four standalone packed fixtures derived from those golden paths pass against one nominated published alpha.
4. Every fixture imports only `@rizom/brain/*`, `preact` where applicable, and ordinary third-party runtime dependencies.
5. Custom entity data survives restart and participates in system tools, visibility, search, embeddings, and one projection rule.
6. A custom service job crosses the supervised web/worker boundary through the existing durable queue.
7. A custom site exercises every stable `SitePackage` field in a real app-managed build.
8. A custom interface uses canonical permission lookup, lifecycle-owned daemon health, agent chat/confirmation, routes, and clean shutdown.
9. Configuration and callback types infer from the author's schemas and declarations wherever the runtime already has that information.
10. Author-facing failures name the package, plugin, capability, invalid field, and corrective action.
11. Generated declarations contain no internal imports and cannot drift from the runtime schemas they describe.
12. All documented TypeScript examples compile in CI.
13. Stable `0.2.x` compatibility policy, peer ranges, and exclusions are explicit.
14. Full format, typecheck, tests, forced lint, package-boundary checks, packed smokes, and targeted personal/team evals pass before stable nomination.

## Risks and mitigations

- **The SDK freezes internal abstractions accidentally.** Keep contexts namespace-based and DTO/schema-backed; never expose shell/services directly.
- **Elegance work expands into an SDK rewrite.** Design from five concrete golden paths, remove only demonstrated boilerplate, and reject speculative builders or convenience layers without a second real consumer.
- **A line-count goal produces a clever but opaque DSL.** Judge concepts, inference, consistency, and domain-to-plumbing ratio rather than raw file length.
- **Durable external jobs violate worker isolation.** Derive inventory from immutable registrations and prove execution-only boot from the packed package.
- **The plan expands into HTTP redesign.** Preserve and test the existing route getters for `0.2`; leave normalized registration and central route security to the separate hardening plan.
- **Compile fixtures pass while runtime loading fails.** Require pack, install, boot, behavior, restart, and shutdown for each use case.
- **Site contracts drift again.** Generate public typing and runtime validation from one source and test mutual assignability.
- **Interface authors bypass permission policy.** Expose canonical permission resolution and test caller levels; do not ask plugins to reimplement `brain.yaml` permission matching.
- **Documentation drifts from signatures.** Source examples from checked fixtures and reject uncompiled TypeScript examples.
- **Alpha compatibility blocks correction.** Make intentional breaking corrections before stable, publish release notes, and advance external alpha peer lower bounds.
- **Packed tests become slow or flaky.** Share installation/build setup, use bounded readiness instead of sleeps, and keep each behavioral assertion deterministic.

## Related work

- [NPM package boundaries](./npm-package-boundaries.md) — later official plugin publishing and public-only dependency proofs.
- [Independent site and theme package versioning](./site-package-independent-versioning.md) — external site publishing and exact hosted pins.
- [HTTP route registry hardening](./http-route-registry-hardening.md) — post-baseline route ownership and authorization improvements.
- [Brain model unification](./brain-model-unification.md) — stable `v0.2.0` nomination and canary crossover.
- [API stability](../public-release/STABILITY.md) — current compatibility policy to update at Phase 6.
