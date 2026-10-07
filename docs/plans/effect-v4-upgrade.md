# Plan: Effect v4 upgrade

## Status

**Proposed; implementation has not started.** Effect `4.0.0` was released on 2026-10-01; `4.0.1` is `latest`. The repository runs `effect@3.22.0` behind the curated boundary `@brains/utils/effect` (`shared/utils/src/effect.ts`) and its test surface `@brains/utils/effect/test` (`shared/utils/src/effect-test.ts`). No workspace imports `effect` directly.

The incoming-main survey counted 66 TypeScript files importing the boundary, with 56 (33 source, 23 test) using an API that v4 renames or removes. Recompute that inventory against the declarative branch before implementation; the remaining surface (`Effect.gen`, `runPromise`, `runFork`, `promise`, `tryPromise`, `Scope.make`/`close`, `Layer.buildWithScope`, `Schedule`, `Cause.squash`, `TestClock.adjust`, …) is unchanged.

## Goal

Run the shell's supervisors, scoped service layers, schedules, and deterministic clock tests on Effect v4, remove the glue v4 makes redundant, and move the directory-sync Git broker's hand-written transport onto `effect/rpc`.

## Measured basis

Probed on Bun 1.4 against `effect@3.22.0` and `effect@4.0.1` with the repository's own patterns:

| Measure                                                    | v3.22.0 | v4.0.1  |
| ---------------------------------------------------------- | ------- | ------- |
| `runSync` of a small `Effect.gen`, ×200k                   | 283 ms  | 104 ms  |
| `runPromise` of `Effect.gen` with `sync` + `promise`, ×50k | 103 ms  | 33 ms   |
| Heap per suspended fiber (`sleep("1 hour")`)               | ~3.2 KB | ~0.9 KB |

Further verified on `4.0.1`:

- `Effect.runPromise` rejects with the original failure value for `fail`, `tryPromise`, and `die`; the v3 `FiberFailure` wrapper no longer exists.
- Extracting the test clock with `TestClock.testClockWith(Effect.succeed)` under `TestClock.layer()` and injecting it with `Effect.provideService(Clock.Clock, clock)` drives sleepers in a separate run, so the existing "test owns the clock, production code receives it" pattern carries over.
- Fiber keep-alive does not hold the process open where v3 exited; the only divergence is v3 holding the process on `Effect.never`, which the repository does not use.
- `effect/rpc` with `@effect/platform-bun@4.0.1` over a Unix socket round-trips request/response, typed errors as class instances (`Schema.TaggedError`), streamed progress, and client interruption that reaches the server-side stream.

## Decisions

- **One atomic upgrade PR for Phase 1.** The boundary package pins a single `effect` version and every consumer compiles against it, so the bump and the renames cannot be sliced per package.
- **Keep the curated boundary.** Consumers keep importing `@brains/utils/effect`; only the boundary's export list changes. `Either` is replaced by `Result`. Keep Effect internals out of public authoring contracts; preserve caller authority, request/delivery lifetimes, coded public errors and local causes.
- **Pin `effect` and `@effect/platform-bun` to an exact version.** `effect/rpc` and the socket layers are `@stability unstable` and may break in minor releases; bumps are deliberate PRs.
- **Effect Schema is confined to the broker wire contract.** `effect/rpc` accepts only Effect Schema (no Zod or Standard Schema input). Zod stays the source of truth everywhere else; the broker's `gitOperationSchema` moves to Effect Schema with the transport.
- **Not adopted:** `effect/http-api` (declarative route contracts are Zod across the plugin surface), `effect/ai` and its `McpServer` (the AI SDK drives Studio streaming through `@ai-sdk/react`; MCP runs on `@modelcontextprotocol/server` v2), `effect/cli` (`packages/brain-cli/src/parse-args.ts` is 20 lines), `effect/workflow`/`cluster`/`sql` (would replace the working job queue and Drizzle/libSQL), `ErrorReporter` (reports only inside explicit `withErrorReporting` boundaries, verified; supervisors run as independent roots with injected loggers), `LayerRef`, `Redactable` (applies to Effect's logger, which the repository does not use), and the `startImmediately` fork option (all 38 `Effect.yieldNow` calls are in tests).

## Phases

### Phase 1 — Upgrade and rename

Tests first: update `shared/utils/test/effect.test.ts` for the v4 boundary (`scopedServiceLayer` built on `Layer.effect`, a `withOptionalClock` helper, the v4 test layer) before changing the boundary.

1. Bump `shared/utils` to `effect@4.0.1` (exact).
2. Boundary exports: replace `Either` with `Result`; `effect-test.ts` exports `TestClock` from `effect/testing` and a test layer equal to `TestClock.layer()`, replacing `TestContext.TestContext`.
3. Add `withOptionalClock(effect, clock?)` to the boundary and replace the 17 `clock ? Effect.withClock(x, clock) : x` ternaries with it (`Effect.withClock` is removed in v4; the replacement is `Effect.provideService(Clock.Clock, clock)`).
4. Apply the renames:

| v3                                               | v4                                                       |
| ------------------------------------------------ | -------------------------------------------------------- |
| `Context.GenericTag` / `Context.Tag`             | `Context.Service`                                        |
| `Effect.catchAll`                                | `Effect.catch`                                           |
| `Effect.either` / `Either.isLeft`                | `Effect.result` / `Result.isFailure`                     |
| `Effect.async`                                   | `Effect.callback`                                        |
| `Effect.fork`                                    | `Effect.forkChild`                                       |
| `Effect.timeoutFail`                             | `Effect.timeoutOrElse`                                   |
| `Effect.acquireReleaseInterruptible`             | `Effect.acquireRelease(…, { interruptible: true })`      |
| `Fiber.RuntimeFiber`                             | `Fiber.Fiber`                                            |
| `Fiber.interruptFork(f)`                         | `f.interruptUnsafe()`                                    |
| `FiberMap.unsafeSet` / `unsafeHas` / `unsafeGet` | `setUnsafe` / `hasUnsafe` / `getUnsafe`                  |
| `FiberSet.unsafeAdd`                             | `FiberSet.addUnsafe`                                     |
| `Scope.CloseableScope`                           | `Scope.Closeable`                                        |
| `Scope.extend`                                   | `Scope.provide`                                          |
| `Layer.scoped` / `Layer.scopedContext`           | `Layer.effect` / `Layer.effectContext`                   |
| `Cause.failureOption`                            | `Cause.findErrorOption`                                  |
| `Clock.make`                                     | a plain `Clock.Clock` value (adds `monotonicTimeNanos*`) |
| `clock.unsafeCurrentTimeMillis()`                | `clock.currentTimeMillisUnsafe()`                        |
| `TestClock.testClock()`                          | `TestClock.testClockWith(Effect.succeed)`                |
| `Effect.provide(TestContext.TestContext)`        | `Effect.provide(TestClock.layer())`                      |

5. v4 shares layer memoization across `Effect.provide` calls. Tests that provide the same layer twice and expect independent instances use `Layer.fresh` or `Effect.provide(layer, { local: true })`; the full suite identifies them.

Validation: `bun run typecheck`, `bun scripts/lint.mjs --force`, `bun run test` (the boundary is a shared contract, so the full suite runs). Then `bun start:personal` from `packages/brain-cli` and confirm the job worker, recurring checks, and directory-sync watcher start and complete one cycle.

### Phase 2 — Remove `runEffectPromise`

Tests first: in `shell/core/test/shell-lifecycle.test.ts`, assert that a failing phase rejects with the original error class, not a wrapper.

1. Replace the call sites in `shell/core/src/daemon-registry.ts`, `initialization/job-services.ts`, and `initialization/shell-lifecycle.ts` with `Effect.runPromise`.
2. Delete `runEffectPromise`; `runConcurrentPhase` in `shell/core/src/effect-runtime.ts` keeps its behavior on `Effect.result`.

Validation: `bun run typecheck` and `bun test` in `shell/core`.

### Phase 3 — Git broker transport on `effect/rpc`

Scope: replace the transport in `plugins/directory-sync/src/lib/broker/` — framing in `protocol.ts`, `client.ts`, `connect.ts`, `socket-writer.ts`, `active-requests.ts`, and the transport half of `server.ts` (≈1,100 lines). Checkout ownership, `journal.ts`, `host.ts`, `health.ts`, `operations.ts`, and replacement-after-process-group-exit semantics are unchanged.

Tests first, against the new transport:

- an `execute-operation` payload carrying an unknown key (an `argv` vector) is rejected, not stripped;
- a frame above `MAX_FRAME_BYTES` is rejected without buffering it;
- progress frames stream during a long operation;
- client interruption ends the server-side operation stream;
- a Git failure arrives as a typed error class;
- a client on a different protocol version is refused at `register-checkout`.

Design:

1. One `RpcGroup` with `RegisterCheckout` and a streaming `ExecuteOperation` whose stream carries progress and ends with the result.
2. Serialization: `RpcSerialization.layerNdjsonWith({ maxBufferSize: MAX_FRAME_BYTES })`.
3. Strict payloads: `RpcServer` exposes no parse options, and a schema-level `parseOptions` annotation is ignored for nested structs (verified on `4.0.1`). The broker contract therefore wraps each payload in a pre-decode exact-keys check, so unknown keys fail before decoding.
4. Transport: `BunSocketServer.layer({ path })` and `BunSocket.layerNet({ path })`. These are Node `net` adapters, replacing `Bun.listen`/`Bun.connect`, so the change is gated on the broker soak.

Validation: the directory-sync test suite, `bun run test:git-broker-process-inventory` (100-cycle soak), and `bun run test:git-broker-recovery`. Then `bun start:personal` with a Git-backed directory sync, confirming an entity edit produces an `Auto-sync` commit.

## Completion

All three phases are merged and released, `@brains/utils/effect` exports only v4 APIs, `runEffectPromise` is gone, and the broker transport runs on `effect/rpc` with the soak and recovery gates green. Delete this plan when that holds.
