# Plan: shell lifecycle race hardening

## Status

**Proposed.** The repo-wide Effect lifecycle adoption is complete. This is a narrower follow-up for concrete shell races found after that work; it does not reopen a mechanical Effect conversion sweep.

Phase 1 is the highest-value core fix and can ship independently. The remaining phases should proceed only after their characterization tests reproduce the race. This work is not a stable `v0.2.0` release gate unless one of those races is observed in production or release-candidate validation.

## Goal

Make shell lifecycle transitions deterministic under concurrent callers:

- boot and shutdown are one-shot, terminal, and joinable;
- shutdown follows dependency order, so active work cannot use a resource after its owner is torn down;
- daemon start/stop/unregister transitions execute exactly once per admitted transition;
- plugin teardown, recurring-check release, and conversation-actor release settle before callers return;
- original errors and abort reasons remain intact; and
- public shell, plugin, daemon, AI, job, and recurring-check contracts remain Promise/`AbortSignal` based.

Effect remains a private ownership mechanism imported through `@brains/utils/effect`. Do not expose Effect, Scope, Fiber, Deferred, Ref, Layer, Clock, or Cause in public declarations. Do not add Layers for registries or transition bookkeeping.

## Current baseline

The completed lifecycle work already provides:

- one `ShellLifecycle` scope per fresh or injected shell;
- transactional shell and plugin acquisition with reverse finalization;
- package-owned Layers for complete database/service slices;
- supervised job polling, cleanup, agent turns, actor eviction, app signals, and index-readiness monitoring;
- graceful draining for claimed durable jobs;
- cancellation across package boundaries through `AbortSignal`;
- deterministic schedule tests through `TestClock`; and
- terminal plugin teardown with resource-scoped registrations.

The production shell no longer contains an unmanaged recurring timer that warrants automatic conversion. The remaining findings are transition and teardown races around already-owned resources.

## Findings

### 1. Active turns currently stop after plugin teardown

`registerShellRuntimeFinalizers()` registers agent shutdown, plugin shutdown, job-runtime shutdown, and recurring-check shutdown in that order. Effect scopes finalize in reverse order, producing:

1. recurring checks stop;
2. job workers drain;
3. plugins and their capabilities shut down;
4. active agent turns stop.

An admitted turn can therefore still execute a plugin tool while that plugin's daemon, subscriptions, or capabilities are being released.

Target close order:

1. prevent and abort recurring checks;
2. stop active/queued agent work;
3. drain already-claimed durable jobs;
4. shut down plugins and daemons;
5. close databases and remaining service resources.

This is primarily an ownership-order fix using the existing shell scope, not a new abstraction.

### 2. Shell boot and close are not joinable transitions

`Shell.initialize()` guards only on the final `initialized` boolean. Two callers can enter boot before either sets it. A shutdown can also close the lifecycle while boot is still acquiring resources.

`ShellLifecycle.close()` sets `closed = true` before awaiting `Scope.close()`. A concurrent second caller sees `closed` and returns immediately instead of waiting for finalizers already in progress. A failed boot closes the lifecycle but leaves `Shell.initialize()` callable again against a terminal scope.

Required semantics:

- concurrent initialization with the same mode joins one boot promise;
- a conflicting concurrent boot mode fails clearly;
- shutdown requested during boot prevents new work, waits for the admitted boot attempt to settle, then closes;
- failed boot is terminal for that shell instance;
- every shutdown caller joins the same close promise; and
- the first close exit determines finalizer context while all callers observe the same completion.

Do not interrupt arbitrary plugin registration promises until those adapters accept a lifecycle signal. Waiting for the admitted boot attempt is safer than pretending interruption cancels underlying work.

### 3. Daemon transitions can overlap

`DaemonRegistry.start()` publishes the daemon scope only after `daemon.start()` resolves. Concurrent starts can both see no scope, invoke `start()` twice, and overwrite the stored scope. Concurrent stops can similarly observe a deleted scope and invoke the underlying stop more than once. Start and stop can cross while status is `starting` or `stopping`.

Each daemon needs one serialized transition record:

- identical concurrent operations join;
- stop during start waits for the start transition and then closes exactly once;
- start during stop waits and starts a new generation only when the daemon remains registered and its owner remains open;
- unregister is terminal and rejects later starts;
- failed start rolls back only the scope acquired by that generation; and
- failed stop remains retryable without losing ownership.

Use an internal keyed Effect synchronization primitive or equivalent scoped transition queue. Keep `Daemon.start()` and `Daemon.stop()` Promise based.

### 4. Concurrent plugin teardown does not join

`PluginLifecycle.releasePluginResources()` adds the plugin id to `releasedPluginIds` before awaiting teardown. A second `disablePlugin()` or shell shutdown call returns immediately rather than joining the release already in progress.

Replace the released-id marker with a per-plugin release promise/exit. This likely needs ordinary Promise coordination around the existing `PluginResourceScope`, not another Effect service.

### 5. Recurring-check unregister does not own admitted work

A check registered after service start launches catch-up enqueue work with `void ...catch(...)`. Unregister starts `ScheduledJob.stop()` without awaiting it, removes the definition, and does not abort or drain an active `runNow()` for that plugin.

Consequences include:

- a scheduled callback enqueuing after plugin teardown;
- plugin-owned check code running after `shutdown()`;
- an admitted catch-up task outliving registration; and
- a durable check job finding that its definition disappeared mid-run.

The recurring-check service should own catch-up tasks, schedules, and active executions by check and plugin. Plugin release must prevent new admission, stop schedules, cancel cancellation-aware checks with an explicit reason, and await settlement. Shell shutdown keeps the existing durable-job policy: an interrupted claimed check remains retryable and the worker drains its claim transition.

The public registration handle may remain synchronous, but plugin teardown must have an internal async release path that joins all work for the plugin.

### 6. Conversation actor disposal is not terminal

`ConversationActorRegistry.dispose()` forks scope closure without awaiting it, clears operation bookkeeping, creates a replacement eviction supervisor, and does not mark the registry closed. A queued operation chained before disposal can start afterward and acquire a new actor. `AgentService.shutdown()` disposes actors before waiting for active turns, and `AgentService.resetInstance()` drops the shutdown promise.

The registry needs terminal async closure:

1. reject new acquire/enqueue calls;
2. cancel eviction fibers;
3. prevent queued-but-not-started operations from entering;
4. interrupt active turns through their existing `AbortSignal` boundary;
5. settle operation chains;
6. stop XState actors; and
7. return only after its scope is closed.

XState remains the conversation workflow owner. Effect owns only queue/eviction lifetime and cancellation.

## Architecture decisions

### Keep one shell lifecycle state

Do not add a second public state machine. `Shell` and `ShellLifecycle` should share one private terminal transition model such as:

```ts
type ShellLifecycleState =
  "constructed" | "booting" | "running" | "closing" | "closed" | "failed";
```

The implementation may use Effect `Deferred`/`Ref` internally or cached Promise transitions where that is simpler. The externally observable contract remains Promise methods and existing shell status methods.

### Prefer joining over early idempotent return

Idempotence means repeated calls share the same result, not that later callers return before cleanup finishes. Apply this rule to shell close, daemon transitions, plugin release, recurring-check plugin release, and actor-registry close.

### Preserve resource-specific shutdown policy

- Agent turns and cancellation-aware recurring checks: interrupt through `AbortSignal`.
- Claimed durable jobs: drain.
- Plugin and daemon resource release: await exact-once finalization.
- Database/service scopes: close after dependents.
- Failed stop: retain enough ownership state to retry.

### Keep Effect private and narrow

No new package Layer is justified by these findings. Pure status maps, registries, and configuration remain TypeScript. Use Effect where it provides scoped finalization, keyed supervision, synchronization, or deterministic time—not merely to wrap a Promise.

## Implementation phases

### Phase 0 — characterization

Add deferred-fake tests before changing behavior:

1. An active agent turn remains live while plugin shutdown begins under the current finalizer order.
2. A second `ShellLifecycle.close()` returns before the first finalizer settles.
3. Two concurrent `Shell.initialize()` calls enter boot twice.
4. Shutdown can race an admitted boot phase.
5. Concurrent daemon starts call the underlying daemon twice; start/stop can cross.
6. A second plugin disable returns before the first teardown settles.
7. Recurring-check unregister returns while schedule/catch-up/check work remains active.
8. A queued conversation operation can start after registry disposal.

Use gates and fake services. Do not launch real interfaces, browser processes, or remote services.

### Phase 1 — core shell ordering and terminal transitions

1. Reorder runtime finalizers to stop recurring checks, then agent work, then job runtime, then plugins.
2. Add a joinable boot transition to `Shell.initialize()`.
3. Add a joinable close transition to `ShellLifecycle` and `Shell.shutdown()`.
4. Make boot failure and completed shutdown terminal for that shell instance.
5. Define and test shutdown-during-boot behavior.
6. Preserve the original boot failure if cleanup also fails; log cleanup failure separately as today.

Gate:

- one boot runs under concurrent callers;
- every shutdown caller waits for all finalizers;
- active turns settle before plugin release starts;
- job draining still completes before plugin handlers disappear; and
- register-only/startup-check behavior remains unchanged.

### Phase 2 — daemon transition ownership

1. Add a per-daemon serialized transition/generation.
2. Make concurrent starts and stops join their matching transition.
3. Serialize crossed start/stop requests.
4. Make unregister terminal and wait for an in-progress transition.
5. Preserve startup rollback, stop retry, overwrite protection, and inactive `abandon()` behavior.
6. Cover plugin-wide start rollback and stop continuation with concurrent calls.

Gate:

- each admitted generation starts and stops at most once;
- no scope can be overwritten or lost;
- stop failure is retryable; and
- one daemon's transition does not block unrelated daemons.

### Phase 3 — plugin and recurring-check teardown

1. Make plugin release joinable per plugin.
2. Track recurring-check catch-up enqueue tasks instead of detaching them.
3. Own schedules and active checks by plugin/check key.
4. Add an async internal plugin release that prevents admission, aborts checks, and drains settlement.
5. Wire that release into plugin resource teardown without exposing Effect publicly.
6. Preserve durable-job retry semantics and alert deduplication state.

Gate:

- plugin shutdown cannot return while its check code is active;
- no check is enqueued after plugin release;
- concurrent plugin disable/shutdown callers observe one teardown result; and
- unrelated plugins' checks continue normally.

### Phase 4 — terminal conversation ownership

1. Replace synchronous `dispose()` with an async terminal close operation.
2. Reject new actor acquisition and queued operations after close begins.
3. Give queued operations a lifecycle-linked signal so not-yet-started work cannot enter after closure.
4. Coordinate actor-registry closure with `ActiveTurnSupervisor.close()`.
5. Await eviction-scope closure and operation settlement before stopping actors.
6. Make singleton reset await shutdown or remove the fire-and-forget reset path where fresh construction already supersedes it.

Gate:

- no queued operation starts after close;
- active callers receive the lifecycle abort reason;
- actor stop occurs exactly once after operations settle; and
- XState terminal/confirmation behavior remains unchanged.

### Phase 5 — focused follow-up audit

After Phases 1–4, re-run the ownership audit rather than converting mechanically. Specifically characterize before changing:

- `JobQueueWorker` start/stop overlap and legacy `autoStart` fire-and-forget behavior;
- `BatchJobManager` restart while stop is in progress;
- Discord's detached message/interaction handlers during client destroy; and
- site-builder debounce callbacks whose enqueue has already been admitted.

Any confirmed interface/plugin race should receive its own package-local plan or complete vertical slice. Awaiting content-pipeline completion/failure broadcasts is a normal Promise fix, not an Effect adoption project.

## Validation

Per phase, run the smallest affected checks first, then the repository gates because core contracts cross workspaces:

- focused package typecheck, lint, and tests;
- `bun run typecheck`;
- `bun run lint`;
- `bun run test`;
- `bun run deps:check` and `bun run workspace:check` when package dependencies change;
- `bun run arch:check`;
- `bun test shared/utils/test/effect-import-boundary.test.ts`;
- generated `@rizom/brain` declaration checks; and
- packaged startup-check acquisition and shutdown when core boot behavior changes.

Use `TestClock` only for actual time behavior. Transition races should use deferred fakes so tests assert admission and settlement directly. Do not run Rover evaluations unless explicitly requested.

## Non-goals

- Changing public APIs from Promise to Effect.
- Replacing XState conversation machines.
- Interrupting claimed durable jobs.
- Adding Effect Schema or a general Effect service locator.
- Wrapping pure registries, CRUD, validation, or configuration in Effect.
- Reopening completed directory-sync, A2A, MCP HTTP, media-renderer, scheduler, or database-Layer work without a new reproduction.
- Solving Discord or site-builder ownership inside the core phases.

## Risks and mitigations

- **Shutdown reorder exposes hidden dependencies.** Add a cross-service order test before changing registration and retain job drain before plugin release.
- **Boot joining changes repeated-call behavior.** Characterize normal, register-only, and startup-check calls; reject conflicting modes explicitly.
- **A transition queue can hide a hung adapter.** Keep ownership visible in status and logs; add bounded cleanup only where the resource has a safe fallback.
- **Recurring-check cancellation can strand a claimed job.** Preserve worker draining and retryable failure; never mark an interrupted check successful.
- **Actor closure can overwrite terminal conversation state.** Keep XState transitions authoritative and use cancellation only at existing turn boundaries.
- **Overusing Effect increases complexity.** Prefer cached Promises for join semantics when no scope, fiber, synchronization, or clock ownership is needed.

## Success criteria

- Concurrent shell initialization performs one boot.
- Every shell shutdown caller waits for the same complete reverse-dependency teardown.
- Active agent work cannot execute plugin capabilities after plugin teardown begins.
- Daemon generations cannot double-start, double-stop, or lose their scope.
- Concurrent plugin release callers join one teardown.
- Recurring-check code and catch-up tasks cannot outlive plugin ownership.
- Queued conversation operations cannot start after agent-service closure.
- Existing Promise/`AbortSignal`, Zod, XState, durable-job, and public declaration contracts remain intact.
- No new Layer or direct `effect` dependency is introduced outside the curated utility boundary.

## Related documentation

- [Architecture overview](../architecture-overview.md#effect-runtime-boundary)
- [HTTP route registry hardening](./http-route-registry-hardening.md)
- [Plugin contracts consolidation](./plugin-contracts-consolidation.md)
