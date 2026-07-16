# Plan: Effect lifecycle adoption (content-pipeline, a2a, media-renderer)

## Status

Partial. Phases 1 and 2 are implemented; Phase 3 remains proposed and has not started. The shared shell lifecycle and ownership prerequisite is complete on `main`; all follow-up conversions use the canonical private `@brains/utils/effect` boundary and the same boundary rules.

Together with [directory-sync-effect-lifecycle.md](./directory-sync-effect-lifecycle.md), this plan records the concrete remaining follow-up scope from the repo-wide lifecycle sweep. The previously deferred MCP HTTP eviction timer was converted after a focused ownership audit exposed constructor-failure leakage and detached transport closes; newly discovered candidates still require their own audit rather than automatic conversion.

Explicitly excluded:

- Everything the completed shell lifecycle work already converted: job-queue worker and batch cleanup, entity-service index polling, ai-service `ActiveTurnSupervisor`, the message-interface `KeyedCleanupSupervisor`, plugin resource scopes, the shell bootloader's index-readiness monitor (now a lifecycle-forked Effect), and conversation-actor eviction (now a `FiberMap` supervisor).
  The MCP HTTP transport remains outside the numbered delivery phases, but its opportunistic lifecycle conversion is now complete and recorded below.

## Goal

Give each package explicit ownership of its background work: scheduled cycles, streaming turns, and browser processes must be supervised, drain or cancel on shutdown according to an explicit policy, and never outlive their owner silently.

Public contracts stay Promise-based. Cancellation crosses package boundaries only as `AbortSignal`; Effect remains an internal control-plane detail. Same boundary rules as the directory-sync plan: import only through `@brains/utils/effect`, never expose Effect, Scope, Fiber, Layer, Clock, or Cause from package exports, no Effect Schema or Layer.

## Why these packages

### plugins/content-pipeline — scheduled publishes raced shutdown

Pre-Phase 1 findings:

- `CronerBackend.scheduleCron` and `scheduleInterval` fire `void callback()`; `ScheduledJob.stop()` stops future firings only (`src/scheduler-backend.ts:54-56,64-67`).
- `ContentScheduler.stop()` flips `running` and stops the runners, but runner callbacks check `isRunning()` only at entry (`src/scheduler-publish-runner.ts:52,68`) — an in-flight cycle runs to completion after `stop()` returns, unsupervised.
- The exposure is real: `processEntry` removes the queue entry **before** publishing (`src/scheduler-publish-runner.ts:91-98`). A process exit during an orphaned in-flight publish loses the entry — the publish is neither completed nor requeued.
- Cycles for the same entity type can overlap: nothing guards a cron firing while the previous cycle's publish is still running.
- `ContentScheduler.resetInstance()` fires `void instance.stop()` (`src/scheduler.ts:49`).
- `ContentPipelinePlugin.onShutdown()` awaits `scheduler.stop()` (`src/plugin.ts:148-149`), but that await is hollow while `stop()` doesn't drain.

What is already good: the `SchedulerBackend` abstraction with `TestSchedulerBackend.tick()` gives deterministic tests today. Keep it.

### interfaces/a2a — streaming turn was decoupled from stream lifetime

Pre-Phase 2 findings:

- `handleStreamMessage()` launched `agentService.chat(...)` as a floating `.then/.catch` chain. The stream's `cancel()` only stopped the heartbeat and set `closed`, so a client disconnect left the full agent turn running with no destination. The non-streaming task path had the same detached shape.
- The public agent boundary had already gained an optional `AbortSignal` argument during shell lifecycle hardening, but A2A did not supply one.
- The A2A daemon's `stop()` only logged; in-flight streams and polling turns were neither tracked nor interrupted at plugin shutdown.
- The task manager already modeled a `canceled` terminal state, but active chat completion could overwrite it with `completed`.

### shared/media-renderer — hand-rolled browser supervision

- `withBrowser()` implements timeout, late-arriving-launch tracking, and cleanup with a manual slot object and a raced rejection (`src/renderer.ts:217-283`).
- `killBrowser` is fire-and-forget `void b.close().catch(...)` with a SIGKILL fallback only if `close()` rejects — a hung `close()` is never killed, and the render promise can settle while the Chromium process is still alive (`renderer.ts:231-239,268-278`).
- On timeout during the operation, the `finally` skips the awaited close entirely (`slot.aborted` guard, `renderer.ts:268`) and relies on the fire-and-forget kill.
- Callers cannot cancel a render: `ScreenshotPngOptions`/`PdfRenderOptions` have `timeoutMs` but no signal.

Blast radius is small: consumers (`entities/blog`, `portfolio`, `document`, `products`, `decks`) call the standalone `screenshotPng`/`renderPdf` functions; the conversion is internal plus one optional options field.

## Proposed design

### content-pipeline: supervised schedule execution

Keep croner as the trigger source (cron parsing and `validateCron` are its value) and keep the `SchedulerBackend` interface, with one contract change: `ScheduledJob.stop()` becomes `stop(): Promise<void>` and settles in-flight work.

Inside `CronerBackend`, run each callback in a keyed supervised fiber (`FiberMap` keyed by job, following `KeyedCleanupSupervisor`):

- Non-overlap per job: if the previous cycle for a key is still active when the trigger fires, skip the firing and log it. This matches the periodic-git-sync policy in the directory-sync plan.
- `stop()` prevents new firings, then drains the active cycle rather than interrupting it — a publish is a remote mutation, same drain-don't-interrupt policy as git commit/push.
- The 1-second immediate interval becomes a supervised Effect schedule with an injectable `Clock`.

`ContentScheduler.stop()` awaits both runners' drains; `resetInstance()` awaits `stop()` instead of `void`-ing it. `TestSchedulerBackend` keeps its manual `tick()` API unchanged so existing scheduler tests keep passing; its `stop()` also becomes async.

The remove-before-publish ordering in `processEntry` stays as is — reordering requires publish idempotency analysis that is out of scope. Draining on shutdown closes the common loss window (clean shutdown mid-publish); a hard process kill can still lose an entry, unchanged from today.

### a2a: turn lifetime linked to stream lifetime

Implemented in the private `A2ATurnSupervisor`:

1. Streaming and polling turns run in keyed fibers under one interface-owned `Scope` and `FiberMap`; the package still exposes only Promise and `AbortSignal` contracts.
2. Stream cancellation aborts the signal passed to `AgentNamespace.chat()`, interrupts the turn, and records `canceled`. A canceled task cannot later be overwritten by a late chat response.
3. SSE heartbeats are scoped Effect schedules owned by the same turn and stop on completion, disconnect, cancellation, or shutdown.
4. The A2A daemon's `stop()` aborts every active streaming and polling turn, then awaits scope closure.
5. Polling clients may return without canceling their task; explicit `tasks/cancel` and interface shutdown are the cancellation boundaries.

### MCP HTTP: scoped session eviction

Implemented as an opportunistic follow-up in the private `SessionEvictionSupervisor`:

- Authentication validation completes before the eviction schedule is acquired, so failed construction cannot leave an unreachable timer.
- A scoped Effect schedule replaces `setInterval`, runs non-overlapping sweeps, and uses an injectable Effect `Clock` for deterministic timing tests.
- Eviction transport closes are admitted into the supervisor before execution. `stop()` interrupts future sweeps and waits for every admitted close before closing remaining sessions and the server.
- Singleton reset is asynchronous and stops the owned server before discarding it.

### media-renderer: scoped browser acquisition

Rewrite `withBrowser()` as an internal Effect `acquireUseRelease`:

- Acquisition is the launch with the timeout applied as interruption; a late-arriving browser after interruption is released by the same finalizer, not a separate slot path.
- Release always runs and is always awaited, with its own bounded close timeout: if `close()` neither resolves nor rejects within it, SIGKILL the process. This fixes the hung-close leak, which the current code cannot handle.
- The render promise settles only after release completes — no more resolving while Chromium is still alive.
- Add `signal?: AbortSignal` to `ScreenshotPngOptions` and `PdfRenderOptions`, linked via `Effect.runPromiseExit(effect, { signal })` with `signal.reason` rethrow, per the `RemoteAgentService` pattern.
- `MediaRenderError` codes and the public function signatures are otherwise unchanged; no lifecycle object is added to the public API.

## Delivery phases

Each phase is a complete vertical slice — characterization tests first, conversion, deterministic timing tests via `TestClock` from the start — and ships independently.

### Phase 1 — content-pipeline

**Implemented in the shared `@brains/scheduler` boundary.**

1. Characterization tests: an in-flight publish cycle continues after `stop()` returns; same-key cron firings can overlap; `resetInstance()` does not settle work.
2. Use `@brains/utils/effect`; convert `CronerBackend` to keyed supervised fibers with non-overlap and draining `stop()`; make `ScheduledJob.stop()` async through `ContentScheduler` and both runners; fix `resetInstance()`.
3. New timing tests (interval cadence, non-overlap skip, drain-on-stop) use `TestClock`; existing `TestSchedulerBackend`-based tests keep passing unmodified except for async `stop()`.

### Phase 2 — a2a

**Implemented.**

1. Characterization tests captured detached stream and polling turns, including late completion overwriting `canceled`.
2. `A2ATurnSupervisor` owns signal-linked streaming and polling fibers under the interface lifecycle.
3. Stream disconnect, `tasks/cancel`, and daemon shutdown interrupt turns and record `canceled`; ordinary polling client return does not cancel work.
4. Heartbeat cadence and termination use deterministic `TestClock` coverage; disconnect and shutdown tests verify signal propagation and settlement.

### Phase 3 — media-renderer

1. Characterization tests with a fake `BrowserFactory`: late-arriving launch after timeout is killed; hung `close()` currently leaks (regression test for the fix); render settles before release completes today.
2. Convert `withBrowser()` to scoped acquire/use/release with bounded close timeout and SIGKILL fallback; add optional `signal` to both options types.
3. Timeout and close-timeout tests use `TestClock`; no real browser launches in unit tests.

## Verification

Per phase:

- `cd <package> && bun run typecheck && bun test`
- `bun scripts/lint.mjs --force --filter <package>` from the repo root (per-package eslint dies under TS7)
- repository dependency-boundary and declaration-leak checks for `@brains/utils/effect`; generated declarations contain no Effect types

Behavioral gates:

- content-pipeline: `stop()` returns only after the active cycle settles; same-key cycles never overlap; no queue entry is removed by a cycle that started after `stop()`.
- a2a: client disconnect interrupts the turn and records `canceled`; heartbeat never fires after close; daemon `stop()` settles all tracked streams.
- media-renderer: no code path can settle the render promise while the browser process is alive; hung `close()` is killed within the close timeout; caller aborts preserve `signal.reason`; `MediaRenderError` codes unchanged.

## Non-goals

- Reordering content-pipeline's remove-before-publish or making publishes idempotent/durable jobs.
- Cancelling a2a turns whose polling clients are merely slow (only disconnect and shutdown cancel).
- A browser pool or reuse in media-renderer; it stays launch-per-render.
- Any change to packages already covered by the completed shell lifecycle and ownership work.
- Exposing Effect types from any package export.
