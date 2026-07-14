# Plan: Effect lifecycle adoption (content-pipeline, a2a, media-renderer)

## Status

Proposed cleanup, companion to the directory-sync Effect lifecycle plan. Same hard prerequisite: `work/effect-shell-lifecycle` must be rebased onto main and available (stacked on, or merged), because all conversions import through the canonical private `@brains/effect-runtime` boundary and reuse its patterns. Execute after or alongside the directory-sync plan — they share the prerequisite and the same boundary rules.

Scope was set by a repo-wide sweep. Explicitly excluded:

- Everything the Effect branch already converted: job-queue worker and batch cleanup, entity-service index polling, ai-service `ActiveTurnSupervisor`, the message-interface `KeyedCleanupSupervisor`, plugin resource scopes, the shell bootloader's index-readiness monitor (now a lifecycle-forked Effect), and conversation-actor eviction (now a `FiberMap` supervisor).
- The MCP HTTP transport's session-eviction `setInterval`: it is unref'd and cleared in `stop()`; convert it opportunistically when that transport is next touched, not as a phase here.

## Goal

Give each package explicit ownership of its background work: scheduled cycles, streaming turns, and browser processes must be supervised, drain or cancel on shutdown according to an explicit policy, and never outlive their owner silently.

Public contracts stay Promise-based. Cancellation crosses package boundaries only as `AbortSignal`; Effect remains an internal control-plane detail. Same boundary rules as the directory-sync plan: import only through `@brains/effect-runtime`, never expose Effect, Scope, Fiber, Layer, Clock, or Cause from package exports, no Effect Schema or Layer.

## Why these packages

### plugins/content-pipeline — scheduled publishes race shutdown

- `CronerBackend.scheduleCron` and `scheduleInterval` fire `void callback()`; `ScheduledJob.stop()` stops future firings only (`src/scheduler-backend.ts:54-56,64-67`).
- `ContentScheduler.stop()` flips `running` and stops the runners, but runner callbacks check `isRunning()` only at entry (`src/scheduler-publish-runner.ts:52,68`) — an in-flight cycle runs to completion after `stop()` returns, unsupervised.
- The exposure is real: `processEntry` removes the queue entry **before** publishing (`src/scheduler-publish-runner.ts:91-98`). A process exit during an orphaned in-flight publish loses the entry — the publish is neither completed nor requeued.
- Cycles for the same entity type can overlap: nothing guards a cron firing while the previous cycle's publish is still running.
- `ContentScheduler.resetInstance()` fires `void instance.stop()` (`src/scheduler.ts:49`).
- `ContentPipelinePlugin.onShutdown()` awaits `scheduler.stop()` (`src/plugin.ts:148-149`), but that await is hollow while `stop()` doesn't drain.

What is already good: the `SchedulerBackend` abstraction with `TestSchedulerBackend.tick()` gives deterministic tests today. Keep it.

### interfaces/a2a — streaming turn is decoupled from stream lifetime

- `streamingAgentMessage()` launches `agentService.chat(...)` as a floating `.then/.catch` chain (`src/jsonrpc-handler.ts:372-402`). The stream's `cancel()` only stops the heartbeat and sets `closed` (`jsonrpc-handler.ts:404-407`) — a client disconnect leaves the full agent turn running with no destination and no way to stop it. The non-streaming task path (around `jsonrpc-handler.ts:201`) has the same detached shape.
- `ChatContext` carries no `AbortSignal` (`shell/plugins/src/contracts/agent.ts:95-110`), so there is currently no cancellation path into the turn at all.
- The a2a daemon's `stop()` only logs (`src/a2a-interface.ts:473-474`); in-flight streams are neither tracked nor drained at plugin shutdown.
- The task manager already models a `canceled` terminal state (`src/task-manager.ts:12`) — the protocol supports what the implementation doesn't do.

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

1. Add `signal?: AbortSignal` to `ChatContext` (`shell/plugins/src/contracts/agent.ts`) — optional, non-breaking, and the natural handoff point to the Effect branch's `ActiveTurnSupervisor`, which already checks caller signals. Wiring the signal into turn interruption inside ai-service is part of this phase; if the supervisor path isn't reachable for a given turn, the signal is still observed at the message-bus boundaries (best-effort cancellation, guaranteed no orphaned delivery).
2. In `streamingAgentMessage()`, own the turn as a supervised fiber whose lifetime is linked to the stream: stream `cancel()` aborts the signal, the turn is interrupted, and the task transitions to `canceled` in the task manager. `finish()` semantics are unchanged for the happy path.
3. The heartbeat interval becomes a scoped schedule owned by the same fiber — it cannot fire after the stream closes.
4. Track in-flight streams in a plugin-level `FiberSet`; the a2a daemon's `stop()` aborts their signals and awaits settlement (bounded by the turn's own timeout) instead of only logging.
5. Apply the same signal linkage to the non-streaming task path: a task abandoned by its client keeps running (polling clients may return), but plugin shutdown aborts it and records `canceled`.

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

1. Characterization tests: an in-flight publish cycle continues after `stop()` returns; same-key cron firings can overlap; `resetInstance()` does not settle work.
2. Add `@brains/effect-runtime`; convert `CronerBackend` to keyed supervised fibers with non-overlap and draining `stop()`; make `ScheduledJob.stop()` async through `ContentScheduler` and both runners; fix `resetInstance()`.
3. New timing tests (interval cadence, non-overlap skip, drain-on-stop) use `TestClock`; existing `TestSchedulerBackend`-based tests keep passing unmodified except for async `stop()`.

### Phase 2 — a2a

1. Characterization tests: stream `cancel()` leaves the chat running; daemon `stop()` does not settle in-flight streams; heartbeat cannot fire after close (current behavior to preserve).
2. Add `signal` to `ChatContext` and thread it through ai-service turn supervision.
3. Convert `streamingAgentMessage()` and the task path to signal-linked supervised fibers; heartbeat as scoped schedule; `canceled` task state on abort; plugin-level `FiberSet` drained in daemon `stop()`.
4. Timing tests (heartbeat cadence, cancel-before-response, shutdown drain) use `TestClock`.

### Phase 3 — media-renderer

1. Characterization tests with a fake `BrowserFactory`: late-arriving launch after timeout is killed; hung `close()` currently leaks (regression test for the fix); render settles before release completes today.
2. Convert `withBrowser()` to scoped acquire/use/release with bounded close timeout and SIGKILL fallback; add optional `signal` to both options types.
3. Timeout and close-timeout tests use `TestClock`; no real browser launches in unit tests.

## Verification

Per phase:

- `cd <package> && bun run typecheck && bun test`
- `bun scripts/lint.mjs --force --filter <package>` from the repo root (per-package eslint dies under TS7)
- repository dependency-boundary and declaration-leak checks after adding `@brains/effect-runtime`; generated declarations contain no Effect types

Behavioral gates:

- content-pipeline: `stop()` returns only after the active cycle settles; same-key cycles never overlap; no queue entry is removed by a cycle that started after `stop()`.
- a2a: client disconnect interrupts the turn and records `canceled`; heartbeat never fires after close; daemon `stop()` settles all tracked streams.
- media-renderer: no code path can settle the render promise while the browser process is alive; hung `close()` is killed within the close timeout; caller aborts preserve `signal.reason`; `MediaRenderError` codes unchanged.

## Non-goals

- Reordering content-pipeline's remove-before-publish or making publishes idempotent/durable jobs.
- Cancelling a2a turns whose polling clients are merely slow (only disconnect and shutdown cancel).
- A browser pool or reuse in media-renderer; it stays launch-per-render.
- Converting the MCP transport eviction timer (deferred until that transport is next touched).
- Any change to packages already covered by `work/effect-shell-lifecycle`.
- Exposing Effect types from any package export.
