# Plan: Directory sync Effect lifecycle

## Status

Proposed cleanup. The dependency on `work/effect-shell-lifecycle` is hard, not optional: the package must use the canonical private `@brains/effect-runtime` boundary, and the shutdown design relies on that branch's lifecycle guarantees — `onShutdown()` after registration failure and plugin disable, plus the per-plugin resource scope that owns subscriptions and job registrations. (`onReady()` itself already exists on main's `BasePlugin`.) Stack this work on that branch, or start after it merges.

The worktree is currently 79 commits behind main (its directory-sync copy is at alpha.158, missing the seed-bootstrap `.git`-filter work). Rebasing it onto current main is part of the prerequisite and happens before Phase 1.

## Goal

Give directory sync explicit ownership of its watcher, debounce timers, periodic git work, and in-flight background operations. Shutdown and reconfiguration must stop new work, settle or cancel existing work according to an explicit policy, and release resources in dependency order.

Keep plugin, job, directory, and git contracts Promise-based. Cancellation crosses those boundaries only as `AbortSignal`; Effect remains an internal control-plane detail.

## Why this package benefits

| Resource             | Current ownership                                             | Risk                                                                                                  |
| -------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Chokidar watcher     | `FileWatcher.stop()` calls `void watcher.close()`             | shutdown can finish while the watcher or a callback is active                                         |
| Watcher debounce     | raw `setTimeout`; `stop()` clears the timeout and pending map | an already-fired `processPendingChanges()` is fire-and-forget and never awaited; tests use wall clock |
| Periodic git sync    | `setInterval` plus `running`                                  | cleanup stops future ticks but neither cancels nor awaits an active cycle                             |
| Git auto-commit      | `TrailingDebounce` plus fire-and-forget `git.withLock()`      | dispose cancels the delay but not an active commit/push                                               |
| Git lock             | Promise chain                                                 | queued work has no closed state or cancellation check                                                 |
| Import-job polling   | recursive `setTimeout` for up to five minutes                 | timing is not deterministic                                                                           |
| Plugin subscriptions | manually retained inconsistently                              | the Effect branch's plugin scope fixes this; do not duplicate it here                                 |

Characterize watcher startup before changing it. Plugin registration currently calls `initializeDirectory()`, while watcher startup lives under `initialize()`. Existing plugin tests do not prove that `autoSync: true` starts a watcher; the only production call to `initialize()` is reconfiguration.

## Findings from the Effect worktree

Follow the patterns established in `work/effect-shell-lifecycle`:

- Import only through `@brains/effect-runtime`, never from `effect` directly.
- Public APIs stay Promise-based and accept optional `AbortSignal` at cancellation boundaries.
- `Effect.tryPromise` supplies an `AbortSignal` to its `try` callback. Fiber interruption aborts that signal, but only a Promise adapter that consumes it is actually canceled.
- `Effect.runPromiseExit(effect, { signal })` links caller cancellation to an Effect. If the caller signal wins, rethrow `signal.reason` to preserve abort reason identity.
- Use `AbortSignal.any` when both lifecycle and caller signals exist.
- Use scoped `FiberSet`/`FiberMap` ownership for active and replaceable work, with idempotent scope closure.
- Inject `Clock` internally and use `Effect.withClock` plus `@brains/effect-runtime/test`'s `TestClock` instead of test sleeps.
- Durable claimed jobs drain during worker shutdown. Do not interrupt them from the plugin scope.

The concrete references are `ActiveTurnSupervisor`, `RemoteAgentService`, `KeyedCleanupSupervisor`, index-readiness polling, and the job worker's interrupt-poll-then-drain policy.

## Boundaries

### Use Effect for

- long-lived resource acquisition and finalization;
- periodic and trailing-debounce scheduling;
- background watcher/git supervision;
- cancellation propagation into cancellable git network adapters;
- deterministic timing tests.

### Keep as Promise/Zod code

- `IDirectorySync`, `IGitSync`, ServicePlugin hooks, tools, and job handlers;
- import/export/cleanup pipelines and partial-result accumulation;
- path parsing, serialization, schemas, hashing, and file helpers;
- durable job retry and draining behavior;
- the existing git Promise lock unless scoped cancellation gives a concrete reason to replace it.

Do not expose Effect, Scope, Fiber, Layer, Clock, or Cause from package exports. Do not add Effect Schema or a Layer in the first pass.

## Proposed design

### Private runtime scope

Add a package-internal runtime backed by `Scope.CloseableScope`. `DirectorySyncPlugin` creates it before background acquisition and closes it from `onShutdown()`. Closure is idempotent and returns one shared Promise.

The Effect branch guarantees `onShutdown()` after registration failure, plugin disable, and normal shell shutdown. Its plugin resource scope separately owns subscriptions and job registrations. Directory sync therefore needs no new public `context.lifecycle` API.

Use a child scope for the active sync-path generation so reconfiguration can replace one directory/git/watcher set without replacing plugin-level subscriptions.

### Startup order

1. `onRegister()` validates config, initializes directory/git clients, registers handlers and subscriptions, and installs initial sync.
2. Initial sync remains seed/bootstrap as configured, git pull, then file-to-database import.
3. `onReady()` starts the watcher, periodic git schedule, and auto-commit scheduler after initial sync.
4. `onShutdown()` stops admission, closes schedules/watchers, settles owned work, then clears clients.

Test that `autoSync: true` means the watcher is active after ready and that register-only/startup-check paths leave no persistent watcher or timer.

### Shutdown policy

- Interrupt and discard watcher debounce work that has not started.
- Stop accepting file events and await a callback already enqueueing a job.
- Interrupt a sleeping periodic schedule or a canceled waiter before it enters the git lock.
- Abort an active periodic pull through the Effect-provided signal; check the signal again before queueing imports.
- Interrupt an auto-commit still in its debounce window.
- Drain a commit/push already in progress under the existing git stall timeout rather than interrupting a repository mutation halfway through.
- Leave claimed directory jobs to the job worker's graceful drain.

Order shutdown as: reject triggers, interrupt delayed/periodic admission, await watcher callbacks, drain active commit/push, close Chokidar, then clean up git.

### AbortSignal bridge for git

Add optional signals without breaking callers:

```typescript
interface IGitSync {
  withLock<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T>;
  pull(signal?: AbortSignal): Promise<PullResult>;
  push(signal?: AbortSignal): Promise<void>;
}
```

Thread the signal through `pullGitChanges`, `pushGitChanges`, and `runGitWithStallTimeout`. Keep the output-sensitive stall timer: an absolute Effect timeout is not equivalent because the current timer resets whenever git emits output.

`runGitWithStallTimeout` must distinguish:

- caller/lifecycle cancellation: abort simple-git and reject with `signal.reason`;
- no-output stall: abort simple-git and reject with `GitStallError`;
- normal git failure: preserve the original error.

The lock can remain a Promise queue but must check cancellation before entering a queued callback and must always advance the queue. Local seed bootstrap uses synchronous filesystem and `spawnSync`; wrapping it in Effect would not make it cancellable, so async subprocess conversion is outside this plan.

### Deterministic schedules

Replace:

- periodic git `setInterval` with a supervised schedule whose first cycle occurs after one complete interval;
- auto-commit trailing debounce with keyed replaceable delayed work;
- watcher batch debounce with replaceable delayed work;
- import-job polling recursion with one Effect schedule preserving the five-minute timeout and current progress range.

Internal constructors may accept an optional `Clock.Clock` for tests. Job polling remains an awaited Promise at the handler boundary and is not interrupted by plugin shutdown.

### Atomic reconfiguration

`sync:configure:request` currently replaces `DirectorySync`, while some subscribers and job handlers retain the old instance and git remains bound to the old path. Treat the active path as one replaceable generation:

1. Build and initialize a candidate directory/git generation without starting background work.
2. On failure, close the candidate and keep the old generation active.
3. Close the old generation.
4. Atomically publish the candidate through a stable delegating facade used by tools, subscriptions, and job handlers.
5. Start candidate background resources if the plugin is ready.

Register subscriptions and handlers only once; callbacks resolve the active generation at execution time. Test that an old watcher cannot enqueue after a successful swap.

## Delivery phases

### Phase 0 — Characterization

1. Add tests for watcher startup, ready, shutdown, periodic first-tick semantics, trailing debounce, and reconfiguration.
2. Add regression tests showing current cleanup can return before watcher/git work settles.

### Phase 1 — Runtime and watcher ownership

1. Add `@brains/effect-runtime` as a workspace dependency.
2. Add the private scope and Promise boundary helper that does not leak `FiberFailure`.
3. Make `FileWatcher.stop()` asynchronous: reject new events during stop, await Chokidar's close, and settle an already-fired `processPendingChanges()` (timeout and pending-map clearing already exist).
4. Start and close the watcher through the runtime scope.

### Phase 2 — Git scheduling and draining

1. Replace periodic `setInterval` with one supervised non-overlapping schedule.
2. Replace auto-commit debounce with replaceable delayed fibers.
3. Track active commit/push separately from interruptible delays and drain it on shutdown.
4. Remove `gitCleanups` and raw fire-and-forget background calls from `plugin.ts`.
5. Write the new schedule and debounce tests against `TestClock` from the start; delete the wall-clock sleeps from periodic-sync and auto-commit unit tests in the same phase.

### Phase 3 — Git cancellation

1. Add optional signals to internal git interfaces and adapters.
2. Bridge Effect interruption into simple-git through `runGitWithStallTimeout`.
3. Make canceled lock waiters skip their callback without blocking later waiters.
4. Preserve abort reason and `GitStallError` identity in tests, using `TestClock` for stall-timing cases.

### Phase 4 — Import-job polling

1. Convert import-job polling recursion to one Effect schedule with `TestClock` tests.
2. Preserve progress, the five-minute timeout, non-overlap, and logging behavior.

### Phase 5 — Reconfiguration

1. Introduce the stable facade and child generation scope.
2. Make path replacement transactional.
3. Verify directory, git, tools, handlers, subscriptions, and status all resolve one active path.

## Verification

Run:

- `cd plugins/directory-sync && bun run typecheck`
- `cd plugins/directory-sync && bun test`
- `bun scripts/lint.mjs --force --filter directory-sync` from the repo root (per-package eslint dies under TS7)
- repository dependency-boundary and declaration-leak checks after adding `@brains/effect-runtime`

Behavioral gates:

- watcher close is awaited and no event enqueues afterward;
- periodic cycles never overlap or start after shutdown;
- shutdown aborts a stalled periodic pull and preserves its abort reason;
- shutdown waits for an already-started commit/push;
- a canceled lock waiter neither runs nor blocks later waiters;
- the output-sensitive stall still throws `GitStallError`;
- initial sync remains pull-then-import and does not race the watcher;
- claimed jobs drain normally;
- reconfiguration leaves either the old generation or a complete new generation active;
- timing tests use `TestClock`;
- generated declarations contain no Effect types.

## Non-goals

- Rewriting import, export, cleanup, quarantine, or serialization as Effect programs.
- Parallelizing import/export loops.
- Replacing Zod or result objects with Effect Schema or typed error channels.
- Making synchronous seed bootstrap cancellable.
- Changing durable job persistence, retry, or shutdown semantics.
- Adding a general public plugin lifecycle API or Effect Layer.
