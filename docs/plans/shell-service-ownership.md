# Plan: Shell service ownership and lifecycle consolidation

## Status

Partial. Phases 0-3 have landed: fresh per-shell construction, package-owned database Layers, and cross-service lifecycle rollback. Phase 4 integration and distribution verification remains. This cleanup is not a stable `v0.2.0` release gate and must not preempt roadmap P0/P1 work.

## Goal

Every `Shell` instance owns one independent graph of default services. Constructing, failing, or shutting down one fresh shell must not reset, close, mutate, or reconfigure services used by another shell in the same process.

Keep all public shell and service contracts Promise-based. Preserve `AbortSignal` cancellation, the `Shell.getInstance()` convenience singleton, and legacy static service factories for compatibility. Effect remains a private ownership mechanism rather than a public service locator.

## Shipped baseline

The previous process-global composition model has been replaced:

1. `Shell.createFresh()` constructs a fresh graph without calling global reset helpers.
2. Core honors all advertised `ShellDependencies` overrides.
3. One shell-owned initializer is passed through boot instead of being reacquired from static state.
4. Registries, providers, adapters, identity services, managers, and supervisors use fresh constructors or factories.
5. Core composes private package Effect surfaces for job queue, runtime state, conversations, and entities.
6. Scoped release replaces manual core database finalizers for runtime-state, conversation, and entity services.
7. Synchronous Layer acquisition rethrows the original failure rather than leaking `FiberFailure`.
8. Public declarations remain Promise-based and do not expose Effect types.
9. Recurring-check handler and daemon registrations roll back synchronously; entity release unregisters its embedding handler before queue database release.
10. Combined tests cover construction failure identity, supplied-service exact-once cleanup, normal cleanup order, and exclusion of singleton resets from normal composition.

Legacy `getInstance()`, `resetInstance()`, `resetServiceSingletons()`, and `resetAllSingletons()` remain compatibility/test utilities. Normal shell construction, boot, rollback, and shutdown must not depend on them.

## Invariants

- `Shell.getInstance()` remains a process-level convenience facade; `Shell.resetInstance()` still shuts it down.
- `Shell.createFresh()` remains synchronous with its existing signature.
- Public shell, plugin, service, job, and daemon APIs remain Promise-based; cancellation remains `AbortSignal`-based.
- Plugin registration order, database readiness, ready hooks, daemon startup, and job-worker startup do not move.
- Durable claimed jobs drain before plugin teardown.
- Recurring schedules and active checks stop with daemon shutdown before database release.
- Shutdown then stops agent work, disposes subscriptions, and closes conversation/entity/job/runtime-state databases in dependency order.
- Cleanup settles every finalizer, reports the first failure, and remains idempotent.
- A supplied dependency belongs to that shell's graph and follows the same lifecycle behavior as the corresponding default service.
- No Effect type appears in `Shell`, `ShellDependencies`, public service declarations, plugin contracts, or `@rizom/brain` declarations.

## Ownership model

| Service group                   | Examples                                                                                                                                           | Construction                                      | Lifecycle owner                                                                 |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------- |
| Pure registries and adapters    | `EntityRegistry`, `DataSourceRegistry`, `MessageBus`, `TemplateRegistry`, `RenderService`, `MCPService`, `PermissionService`, `AttachmentRegistry` | Fresh factory or supplied dependency              | Containing shell; no Layer used merely for lookup                               |
| Configuration/provider services | `AIService`, `OnlineEmbeddingProvider`, `ContentService`, identity/profile services                                                                | Fresh factory or supplied dependency              | Containing shell; explicit shutdown only when runtime work exists               |
| Database services               | Runtime state, job queue, entity, conversation                                                                                                     | Package-owned scoped Layer or supplied dependency | Shell lifecycle scope; job runtime remains in its earlier-closing runtime scope |
| Runtime supervisors             | `AgentService`, `PluginManager`, `DaemonRegistry`, `RecurringCheckService`                                                                         | Fresh factory or supplied dependency              | Existing supervisors and explicit shell shutdown barriers                       |
| Shell orchestration             | `ShellInitializer`, `ShellBootloader`                                                                                                              | One fresh initializer retained by one shell       | Containing shell                                                                |

The logger may remain a deliberate process-level facility at CLI entry points. Each shell's service logger is fresh unless explicitly injected.

## Effect boundary

Workspace code imports curated Effect APIs through `@brains/utils/effect`; deterministic test services use `@brains/utils/effect/test`.

Private package composition surfaces are:

- `@brains/job-queue/effect`;
- `@brains/runtime-state/effect`;
- `@brains/conversation-service/effect`;
- `@brains/entity-service/effect`.

Use Effect for scoped acquisition/release, supervised runtime work, transactional rollback, reverse finalization, schedules, and deterministic lifecycle tests.

Do not use Effect for pure registries, configuration, schemas, CRUD logic, synchronous adapters, or a second public dependency-injection API. Layer constructors accept normal typed inputs so `ShellDependencies` remains the application composition boundary.

## Remaining delivery

### Phase 4 — Integration and distribution verification

1. Boot and shut down two isolated no-interface shells in one process against separate persistent SQLite paths.
2. Fail construction and asynchronous initialization of one shell while the other continues entity, conversation, job, and runtime-state I/O.
3. Exercise recurring-check registration and shutdown with default and injected queue/runtime dependencies.
4. Repeat register-only and startup-check modes without global resets.
5. Run the packaged `@rizom/brain` startup-check smoke.
6. Verify public declarations contain no Effect types or private `/effect` package imports.
7. Re-run bundle-size and fresh-process startup checks only if the final composition changes the packed graph materially.

## Verification

Run affected package checks first, then central shell gates:

```sh
bun run typecheck
bun scripts/lint.mjs --force --filter @brains/core
bun test shell/core/test
bun test shared/utils/test/effect-import-boundary.test.ts
bun run workspace:check
bun run deps:check
bun run arch:check
```

For package Layer changes, also run the owning package's full typecheck, lint, and tests. Finish shared runtime-contract changes with the full repository pre-commit suite.

Behavioral gates:

- constructing shell B never resets or closes shell A;
- failing or shutting down shell B leaves shell A usable;
- default services are distinct across fresh shells;
- supplied dependencies are honored and cleaned up exactly once;
- recurring-check registration cannot survive failed shell construction;
- initialization and registration order is unchanged;
- recurring checks stop before the job runtime drains, then plugins stop before databases close;
- repeated shutdown is idempotent;
- original startup and cleanup failure identity is preserved;
- no normal shell path depends on singleton reset helpers;
- no Effect type leaks through public declarations.

## Risks and mitigations

### Durable registration rollback

Database scopes do not automatically undo registrations made against an injected job queue. Register explicit rollback as soon as recurring-check or entity handlers are installed, and test failure after registration.

### Boot-order drift

Layer acquisition remains synchronous. Database readiness stays in the existing pre-plugin concurrent phase; daemon and job startup remain after ready hooks.

### Cleanup-order drift

Do not merge job runtime and database scopes. Assert the complete order with failing-finalizer tests so all cleanup runs while the first error is retained.

### Hidden singleton consumers

Continue auditing constructors for static lookups. Keep compatibility methods until repository and published-API usage supports a separate removal decision.

### Over-broad Effect graph

Tagging every service would duplicate `ShellDependencies` and obscure normal TypeScript composition. Restrict Layers to complete resource-owning slices.

### Concurrent interfaces

Independent service graphs do not make fixed ports or third-party SDK globals process-isolated. Multi-shell tests use no-interface modes and distinct data paths; complete deployed brains remain process-isolated.

## Completion

Delete this plan after Phases 3 and 4 pass and the final ownership model is represented in `docs/architecture-overview.md`, tests, and package changelogs.

## Non-goals

- Removing `Shell.getInstance()` or changing its public contract.
- Removing all package static singleton methods in this work.
- Making `Shell.createFresh()` asynchronous.
- Replacing `ShellDependencies` with public Effect services.
- Converting every shell service or registry into a Layer.
- Changing Zod schemas, XState conversation ownership, plugin APIs, or job drain semantics.
- Running multiple complete interface stacks on shared ports in one process.
- Replacing subprocess isolation in multi-model evaluation.
- Refactoring directory-sync, content-pipeline, A2A, media-renderer, or shared-heartbeat internals.
