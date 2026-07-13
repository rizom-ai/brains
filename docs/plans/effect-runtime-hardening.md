# Effect runtime hardening

## Status

Active shell-runtime hardening plan. The baseline now includes transactional service acquisition, shell and daemon scopes, startup rollback, settling startup concurrency barriers, fully owned job, cleanup, and agent-turn fibers, end-to-end AI cancellation boundaries, Effect schedules, and deterministic clock coverage. This plan tracks only the remaining opportunities that provide concrete lifecycle, cancellation, or concurrency benefits.

This work does not change the roadmap priority of the stable release and identity/bundle/consolidation lanes.

## Goal

Use Effect as the internal shell control plane for structured concurrency and resource ownership while preserving Promise-based public APIs, Zod contracts, XState conversation machines, and durable database-backed job semantics.

## Boundary

- Public shell, plugin, daemon, AI, and job contracts remain Promise-based.
- Cancellation crosses public boundaries as `AbortSignal`.
- Zod remains the schema system.
- XState remains responsible for conversation state transitions.
- Durable jobs drain after being claimed; Effect interruption must not abandon queue rows.
- A package gains an Effect dependency only when the adoption owns a real lifecycle or concurrency boundary.
- `Layer` is introduced only when it replaces singleton/reset and manual-finalizer machinery for a complete vertical slice.

## Remaining inventory

### P0 — correctness and ownership

1. **Give each plugin a resource scope**
   - Files: `shell/plugins/src/base-plugin.ts`, context factories, `shell/plugins/src/manager/plugin-lifecycle.ts`
   - Messaging subscriptions and other registration-time resources are not uniformly retained for rollback or disable.
   - Own subscriptions, handlers, and background fibers per plugin; close the scope after failed registration, disable, and shell shutdown.
   - Before implementation, settle whether disabling also unregisters tools, resources, instructions, and job handlers.

### P1 — cancellation and scheduling

2. **Consolidate semantic-index polling**
   - Files: `shell/entity-service/src/entityService.ts`, `shell/core/src/initialization/shellBootloader.ts`
   - Polling currently exists both inside `awaitIndexReady()` and in the outer monitor retry loop.
   - Express timeout and retry cadence through one schedule and drive tests with `TestClock`.

3. **Supervise delayed message-progress cleanup**
   - File: `shell/plugins/src/message-interface/message-interface-plugin.ts`
   - Progress cleanup uses detached `setTimeout` callbacks.
   - Use a keyed fiber map so replacement and plugin shutdown interrupt pending cleanup.

4. **Use true bounded projection concurrency**
   - File: `shell/plugins/src/entity/derived-entity-projection.ts`
   - Fixed `Promise.all` chunks under-utilize concurrency when one item is slow.
   - Use `Effect.forEach` with bounded concurrency while preserving input/error semantics.

5. **Own database readiness work**
   - Files: `shell/job-queue/src/job-queue-service.ts`, `shell/runtime-state/src/runtime-state-service.ts`
   - WAL setup runs as detached Promises and can race readiness or closure.
   - Include non-fatal WAL initialization in scoped service acquisition and await its settlement before ready state.

### P2 — application and tooling boundaries

6. **Scope app signal handlers**
   - File: `shell/app/src/app.ts`
   - Model SIGINT/SIGTERM listener registration as an acquired resource and guarantee one shutdown fiber.

7. **Scope evaluation apps and HTTP calls**
   - Files: `shell/ai-evaluation/src/eval-db-builder.ts`, `evaluation-service.ts`, `remote-agent-service.ts`
   - Guarantee shell shutdown on every failure, replace manual worker pools with bounded Effect concurrency, and add HTTP timeout/cancellation.

8. **Revisit auth serialization only with an auth lifecycle**
   - File: `shell/auth-service/src/json-file-store.ts`
   - The Promise write chain is currently correct. Replace it with `Semaphore` or `Queue` only if auth gains a scoped service lifecycle that can drain or interrupt writes explicitly.

## Layer adoption path

Do not wrap existing `getInstance()` calls in layers. With transactional shell acquisition in place, the first acceptable layer is a complete job-service vertical slice:

1. construct fresh queue, progress, batch, and worker instances;
2. acquire the job database under a scope;
3. preserve handler registration before worker startup;
4. stop worker and cleanup fibers before closing the database;
5. replace the corresponding singleton resets and shell finalizers; and
6. provide alternate test layers without exposing Effect types publicly.

## Deliberate non-candidates

- Message-bus broadcast `Promise.all`: handlers already isolate failures and the broadcast waits for every handler.
- Database migrations: existing `try/finally` ownership is explicit and correct.
- Durable job retry/backoff: it must remain persisted in queue timestamps, not an in-memory Effect schedule.
- CRUD, parsers, synchronous registries, and cache pruning.
- XState conversation machine logic.
- Effect Schema or replacement of Zod.

## Delivery order

1. Add per-plugin scopes and registration rollback.
2. Introduce the job-service layer slice.
3. Consolidate semantic-index schedules and clocks.
4. Address app and evaluation lifecycle boundaries.

Each item should remain an independently reviewable commit.

## Verification

- No detached long-running fiber remains without an explicit documented reason.
- Startup rollback waits for concurrent phases before closing resources.
- Shutdown interrupts monitors and timers before closing their dependencies.
- Claimed jobs still drain gracefully.
- Abort reasons and original startup errors retain identity across Promise boundaries.
- Timing tests use `TestClock` rather than wall-clock sleeps where Effect owns the clock.
- Generated public declarations contain no Effect types.
- Targeted package tests, lint, typecheck, dependency checks, and the repository pre-commit suite pass.
