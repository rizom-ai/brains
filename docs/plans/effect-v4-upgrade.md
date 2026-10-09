# Plan: Effect v4 upgrade

## Status

**Implemented. All three phases and their completion gates pass locally; publication is pending.** The reviewed target is `effect@4.0.1`, now pinned by `shared/utils` behind the curated boundary `@brains/utils/effect` (`shared/utils/src/effect.ts`) and its test surface `@brains/utils/effect/test` (`shared/utils/src/effect-test.ts`). At the reviewed base (`998010644d`), the repository resolved `effect@3.22.0` from `^3.21.4`. Workspace consumers do not import `effect` directly; only the boundary does.

At the reviewed base, 64 TypeScript files import the boundary. Implementation corrected the migration inventory to 55 consumers (32 source, 23 test), including `Schedule.upTo`'s options-object change. The remaining surface (`Effect.gen`, `runPromise`, `runFork`, `promise`, `tryPromise`, `Scope.make`/`close`, `Layer.buildWithScope`, `Cause.squash`, `TestClock.adjust`, …) retains its API. Refresh the inventory when the base advances.

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
- `effect/rpc` with `@effect/platform-bun@4.0.1` over a Unix socket round-trips request/response, typed errors as class instances (`Schema.TaggedError`), streamed progress, and client interruption that reaches the server-side stream. This is transport cancellation, not permission to cancel broker-owned Git work.

Independent review probes on `4.0.1` confirm original failure identity, extracted test-clock injection, isolated root layer scopes, and sibling finalization after a cleanup failure. They also confirm that stock NDJSON counts string code units rather than UTF-8 bytes, silently skips malformed JSON lines, and does not cap outbound frames. Nested `parseOptions` annotations do not enforce strict payloads. Carry these probes into repository regressions; stock NDJSON is not a drop-in replacement for the broker's framing contract.

The measurements above are microbenchmarks, not evidence of packaged Brain size or startup improvements.

Phase 1 packaged measurements on Bun 1.4.0, against the same source baseline:

| Built artifact / measure         | v3.22.0          | v4.0.1           |
| -------------------------------- | ---------------- | ---------------- |
| `dist/brain.js`                  | 11,681,243 bytes | 11,537,996 bytes |
| CLI gzip                         | 3,518,312 bytes  | 3,471,397 bytes  |
| `dist/git-broker.js`             | 1,058,597 bytes  | 937,701 bytes    |
| Fresh-process `--version` median | 1,092 ms         | 1,080 ms         |

Startup uses 30 interleaved samples per version after three warmups, with a warm filesystem cache. The roughly 1% timing difference is not evidence of a meaningful startup improvement; the bundle reductions are measured artifact differences.

## Decisions

- **One atomic upgrade PR for Phase 1.** The boundary package pins a single `effect` version and every consumer compiles against it, so the bump and the renames cannot be sliced per package. Phase 2 removes redundant glue after that migration. Phases 1–2 may ship independently; Phase 3 is a separately reviewed and gated transport change, not a prerequisite for the v4 upgrade.
- **Keep the curated boundary.** Production consumers keep importing `@brains/utils/effect`; `Either` is replaced by `Result`. Test services remain on `/effect/test`, without a v3 compatibility facade. Phase 3 adds private `@brains/utils/effect/rpc` and `/effect/bun` subpaths, exporting only the required RPC, Schema, stream/queue, and Bun socket modules; do not broaden the root boundary or import Effect independently in the broker. Keep Effect types out of published authoring declarations. The declarative integration preserves installed ownership, caller authority, callback lifetimes, coded public errors and local causes; it does not restore native authoring bridges.
- **Pin dependencies at adoption.** Pin `effect` to `4.0.1` in Phase 1 and add exact `@effect/platform-bun@4.0.1` only in Phase 3, both owned by `shared/utils`. Commit the lockfile; review resolved platform dependencies when upgrading. Pin the transitive `@effect/platform-node-shared` adapter to `4.0.1` as well: the Bun package's caret dependency can otherwise select an adapter requiring a newer Effect peer. RPC and socket APIs are unstable, so bumps are deliberate PRs.
- **Effect Schema is confined to the private broker wire contract.** `effect/rpc` requires Effect Schema. Phase 3 adapts the broker's operation payload schemas to Effect Schema at that boundary while preserving authoritative Zod operation shapes and domain/result validation. Zod remains the source of truth for configuration, entities, public contracts, and existing result schemas; do not introduce parallel domain models. Update [the architecture overview](../architecture-overview.md#effect-runtime-boundary) in the Phase 3 PR to document this narrow exception to its current no-Effect-Schema rule. No schema-policy change is needed for Phases 1–2.
- **Not adopted:** `effect/http-api` (declarative route contracts are Zod across the plugin surface), `effect/ai` and its `McpServer` (the AI SDK drives Studio streaming through `@ai-sdk/react`; MCP runs on `@modelcontextprotocol/server` v2), `effect/cli` (`packages/brain-cli/src/parse-args.ts` is 20 lines), `effect/workflow`/`cluster`/`sql` (would replace the working job queue and Drizzle/libSQL), `ErrorReporter` (reports only inside explicit `withErrorReporting` boundaries, verified; supervisors run as independent roots with injected loggers), `LayerRef`, `Redactable` (applies to Effect's logger, which the repository does not use), and the `startImmediately` fork option (all 38 `Effect.yieldNow` calls are in tests).

## Phases

### Phase 1 — Upgrade and rename

Tests first: update `shared/utils/test/effect.test.ts` before changing the boundary. Pin `scopedServiceLayer` ownership and exact-once release using `Layer.effect`, `withOptionalClock` with and without an injected clock, original failure identity, and an extracted `TestClock` driving a separately started fiber. Exercise independent root scopes and finalization after a sibling cleanup failure.

1. Bump `shared/utils` to `effect@4.0.1` (exact) and update the lockfile.
2. Boundary exports: replace `Either` with `Result`; `effect-test.ts` exports `TestClock` from `effect/testing`. Consumers use `TestClock.layer()` instead of `TestContext.TestContext`, with no compatibility alias.
3. Add `withOptionalClock(effect, clock?)` to the boundary and replace the 17 `clock ? Effect.withClock(x, clock) : x` ternaries with it (`Effect.withClock` is removed in v4; the replacement is `Effect.provideService(Clock.Clock, clock)`).
4. Apply the API migrations:

| v3                                               | v4                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| `Context.GenericTag` / `Context.Tag`             | `Context.Service`                                                  |
| `Effect.catchAll`                                | `Effect.catch`                                                     |
| `Effect.either` / `Either.isLeft`                | `Effect.result` / `Result.isFailure`                               |
| `Effect.async`                                   | `Effect.callback`                                                  |
| `Effect.fork`                                    | `Effect.forkChild`                                                 |
| `Effect.yieldNow()`                              | `Effect.yieldNow` (an Effect value)                                |
| `Schedule.upTo(duration)`                        | `Schedule.upTo({ duration })`                                      |
| `Effect.timeoutFail`                             | `Effect.timeoutOrElse` with a failing `orElse` Effect              |
| `Effect.acquireReleaseInterruptible`             | `Effect.acquireRelease(acquire, release, { interruptible: true })` |
| `Fiber.RuntimeFiber`                             | `Fiber.Fiber`                                                      |
| `Fiber.interruptFork(f)`                         | `f.interruptUnsafe()`                                              |
| `FiberMap.unsafeSet` / `unsafeHas` / `unsafeGet` | `setUnsafe` / `hasUnsafe` / `getUnsafe`                            |
| `FiberSet.unsafeAdd`                             | `FiberSet.addUnsafe`                                               |
| `Scope.CloseableScope`                           | `Scope.Closeable`                                                  |
| `Scope.extend`                                   | `Scope.provide`                                                    |
| `Layer.scoped` / `Layer.scopedContext`           | `Layer.effect` / `Layer.effectContext`                             |
| `Cause.failureOption`                            | `Cause.findErrorOption`                                            |
| `Clock.make()`                                   | `Effect.runSync(Clock.Clock)` for the default live clock           |
| `clock.unsafeCurrentTimeMillis()`                | `clock.currentTimeMillisUnsafe()`                                  |
| `TestClock.testClock()`                          | `TestClock.testClockWith(Effect.succeed)`                          |
| `Effect.provide(TestContext.TestContext)`        | `Effect.provide(TestClock.layer())`                                |

For timeouts, preserve lazy failure construction with `orElse: () => Effect.fail(onTimeout())`; this is not a method-name-only rename. Obtain the production clock from the runtime rather than hand-building a wall-clock substitute; custom clocks must implement the v4 monotonic-time members too.

5. Check memoization at each owning scope, not by assuming all `Effect.provide` calls share globally. Pin independent shell/database lifetimes and rollback isolation. Use `Layer.fresh` or `Effect.provide(layer, { local: true })` only where independent acquisition is intentional; do not adjust tests to accept accidental sharing.

Validation: targeted boundary and lifecycle suites first, then `bun run typecheck`, `bun run lint --force`, and `bun run test` (the boundary is a shared contract, so the full suite runs). Run `bun run arch:check`, `bun run changeset:check`, and `bun run docs:check`; add a `core--` changeset for the affected release closure. Force a fresh `bun run build --filter=@rizom/brain --force`, then `bun run surface:check` to verify declarations remain Effect-free and the packaged CLI boots. Record bundle size and fresh-process startup alongside the v3 baseline; do not infer them from the microbenchmarks. Finally, run `bun start:personal` from `packages/brain-cli` and confirm the job worker, recurring checks, and directory-sync watcher start and complete one cycle.

#### Phase 1 validation record

- Nine new boundary regressions pass alongside the migrated lifecycle/clock suites: original failure identity, independent roots, exact-once release, sibling finalization, and optional/extracted clocks. No memoization compatibility shim was needed. The A2A cancellation regression now checks reason preservation and exact-once release without assuming interruption defers finalization to another microtask.
- Full types, forced lint, tests, script checks, architecture, docs, and changeset checks pass. Fresh public-surface validation passes 51 tests; packaged boot passes three tests.
- Additional broker checks pass: 100 soak cycles / 300 Git operations, zero lost completions and zero zombies; all four packaged recovery tests pass. Recovery initially exposed a v3-baseline fixture mismatch: an embedding-disabled fixture ran semantic wishlist creation. The separate test-only fix (`c6e04209cb`) uses the existing non-AI markdown-upload job and retains durable export, remote commit, live-role, and recurring-check assertions.
- Canonical `bun start:personal` boots and serves HTTP/MCP; the worker completes recurring-check jobs, initial directory sync completes, and the watcher/periodic Git schedule start. Temporary local overrides were restored and owned processes stopped. This is lifecycle verification with embeddings disabled and a dummy provider key; AI projection jobs fail with that key, so it does not claim provider-backed content verification.

### Phase 2 — Remove `runEffectPromise`

Tests first: in `shell/core/test/shell-lifecycle.test.ts` and focused phase-runner tests, assert original failure identity, not merely the error class. Pin that a failed sibling cannot return before an admitted sibling settles, that declaration-order failure selection is unchanged, and that concurrent shutdown callers join cleanup even when it fails.

1. Replace the call sites in `shell/core/src/daemon-registry.ts`, `initialization/job-services.ts`, and `initialization/shell-lifecycle.ts` with `Effect.runPromise`.
2. Delete `runEffectPromise`; `runConcurrentPhase` in `shell/core/src/effect-runtime.ts` keeps its all-siblings-settled behavior on `Effect.result` and reads the original failure value from `Result`.

Validation: core tests and targeted typecheck/lint first, then the shared-contract checks and fresh package/boot gates from Phase 1 before releasing the upgrade.

#### Phase 2 validation record

- Removed `runEffectPromise` and its imports; shell, daemon, job-runtime cleanup, and concurrent phases use `Effect.runPromise` directly. The phase runner still collects every sibling's `Result` before selecting a failure in declaration order.
- Added 12 regressions for parallel admission, empty phases, asynchronous/synchronous failure draining, declaration-order selection, exact rejected values (including objects, `undefined`, and `null`), and concurrent/later callers joining failed shell/job cleanup. Existing daemon joiners now assert error identity rather than structural equality.
- Focused regressions pass before and after removal; core tests pass 625 tests. A fail-fast mutation is rejected by the draining, declaration-order, and synchronous-admission regressions. Failure probes use an event-loop checkpoint after explicit admission gates, not elapsed-time sleeps.
- Full types, forced lint, tests, script checks, architecture, docs, and changeset checks pass. A fresh package passes 51 public-surface tests and three boot tests; the 100-cycle / 300-operation Git soak has zero lost completions or zombies, and all four packaged recovery tests pass.

### Phase 3 — Git broker transport on `effect/rpc` (separately gated)

Scope: replace transport plumbing in `plugins/directory-sync/src/lib/broker/protocol.ts`, `client.ts`, `connect.ts`, the retired `socket-writer.ts`, and the transport portions of `server.ts`. Keep `ActiveRequests`, checkout executors, the request ledger, journal, health/recovery policy, and process-group ownership as broker behavior, not RPC bookkeeping. Wire schema declarations in `operations.ts` change as needed; operation behavior and existing result validation do not. Adapt host lifecycle wiring only to preserve its current guarantees. This phase does not promise removal of every framing or ownership helper.

#### Ownership and replay invariants

- A caller abort or socket loss stops waiting/stream observation; an admitted Git operation remains broker-owned until its real terminal result and durable settlement. RPC request fibers may be interrupted, but must not own the mutation's lifetime, cancel it, release its checkout turn, or clear activity early.
- Preserve caller-chosen stable operation IDs in the request payload, separate from RPC transport IDs. Deduplicate across clients and reconnects, binding each ID to the exact checkout and operation arguments. Publish ownership before execution; retain mutation results for the generation and the bounded read replay window.
- Keep queued-versus-executing activity and progress-age semantics. Status reads remain read-only. A replacement stays mutation-closed until role-side reconciliation opens admission; a lost mutation acknowledgement is never permission to re-execute intent against a new owner.
- RPC stream backpressure must not block or fail broker execution/journal settlement. Bound per-peer outbound buffering and disconnect an undraining observer without disowning its work. Broker shutdown and safe replacement still depend on the owner/process group, not completion of an RPC stream.

#### Tests first

Retain the existing broker regressions and add deterministic gates for:

- strict top-level and nested payloads, including rejection of an `argv` vector and malformed JSON with a visible correlated failure or connection close rather than silent omission;
- inbound and outbound `MAX_FRAME_BYTES` enforcement in UTF-8 bytes, including multibyte text, split headers/bodies, and oversized declared lengths rejected before retaining their body;
- `MAX_PAYLOAD_BYTES` enforcement before a terminal result is retained, and bounded output under a slow/non-draining peer;
- progress during a blocked operation, independent status queries, and a terminal result event;
- abort/disconnect after admission: the observer settles, Git retains its turn, activity remains accurate, journal settlement completes, and same-ID replay does not execute twice;
- duplicate IDs across independent clients/reconnects, rejection of ID reuse for different work, and retained mutation replay after the read window rolls over;
- read-only status, fail-closed inherited generations, and reopening only after explicit reconciliation;
- typed Git failures without credential leakage and operation-specific result validation;
- protocol-version mismatch that fails promptly rather than leaving registration pending;
- owner-only socket permissions, stale/live socket handling, long-path placement, transport cleanup, and replacement only after the old process group exits.

#### Design

1. One `RpcGroup` with `RegisterCheckout`, `QueryStatus`, `OpenAdmission`, and streaming `ExecuteOperation`. The execute payload includes the stable operation ID; stream events are explicitly discriminated progress and terminal result values. Carry the existing broker ID, activity, ambiguity/evidence, and admission fields in status responses. Preserve Promise-based `BrokerConnection` / `BrokerGitSync` contracts and cancellation reasons.
2. Build client protocol layers in the connection's owning scope, not by providing a temporary layer only around `RpcClient.make`; closing that construction effect would release the returned client's transport. Separate RPC observation scopes from broker-owned execution and replay. The ledger joins the actual operation Promise/fiber, not a subscriber stream. A reconnect observes/replays the same operation; stream cancellation removes only the observer. Do not replace `ActiveRequests` with RPC client/request fiber maps.
3. Use a private `RpcSerialization` adapter retaining bounded length-prefixed byte framing for RPC envelopes. Check inbound declared lengths before retaining bodies and outbound encoded lengths before sending; preserve payload and pending-output limits. Stock `layerNdjsonWith({ maxBufferSize })` is insufficient: it counts code units after decoding, skips malformed lines, and leaves encoding unbounded. Fail malformed traffic visibly and keep failures from wedging unrelated callers or losing terminal results.
4. Strict payloads: `RpcServer` exposes no decode parse options, and nested schema annotations are insufficient on `4.0.1`. Apply exact-key validation to the encoded payload before decoding at every relevant nesting level, including each operation variant. Keep field/value constraints and existing result validation; do not rely on a post-decode check after unknown keys have been stripped.
5. Add the curated `/effect/rpc` and `/effect/bun` exports described above, with exact dependencies and the documented private Schema exception. Adopt only the modules required by this transport, not the broad platform barrel or public Effect APIs.
6. Use `BunSocketServer.layer({ path })` behind that boundary. The production client uses a scoped `BunSocket.fromDuplex` layer rather than stock `layerNet`: the latter hides native `writableLength`, which is needed to account bytes after an interrupted write and enforce the same hard output budget on both endpoints. The acquisition adapter exposes no raw socket outside the private transport. These are Node `net` adapters, so retain live-owner probing, safe stale-socket cleanup, path derivation, `0700` runtime-directory and `0600` socket permissions, and owned teardown. Bump `BROKER_PROTOCOL_VERSION` for the new RPC envelope and update both endpoints atomically; refuse mismatches promptly, without a legacy fallback.

Validation: directory-sync tests, targeted typecheck/lint, architecture/docs/changeset checks, a fresh forced Brain build, and `bun run surface:check`. Run `bun run test:git-broker-process-inventory` (100-cycle soak) and `bun run test:git-broker-recovery` against the fresh packaged broker; exercise abort/disconnect while Git is held and verify replay/health/recovery invariants. Then run `bun start:personal` from `packages/brain-cli` with the canonical local Git remote, confirming an entity edit produces an `Auto-sync` commit. Phase 3 remains unmerged if any ownership, framing, permissions, process-inventory, or recovery gate fails; Phase 1–2 releases do not depend on it.

#### Phase 3 foundation checkpoint

- Added private curated RPC and Bun boundaries, with exact `4.0.1` runtime/platform versions and a matching transitive adapter pin. Unrelated lockfile workspace version records are preserved.
- Private RPC declarations adapt the existing strict Zod operations, including nested reconciliation checkpoints; encoded envelopes are checked before RPC decoding.
- Length-prefixed serialization enforces UTF-8 byte limits, rejects malformed JSON/UTF-8 visibly, checks declared lengths before retaining bodies, and bounds encoded batches. The output adapter accounts concurrent writes across writer acquisitions and native buffered bytes after observer interruption.
- Deterministic real-Git regressions pin abort/disconnect ownership, retained checkout turns, queued/executing activity, durable settlement, reconnect replay, and original abort reasons. A real Unix-socket probe verifies status, progress/terminal streaming, and typed failures through the platform layers.
- Foundation validation passes 19 new regressions, all 283 utils tests and 846 directory-sync tests (one opt-in soak skip), full types (107 tasks), forced lint (99 tasks), full tests (105 tasks), script types/tests (129 tests), architecture, docs, dependencies, frozen install, and changeset checks.
- This historical checkpoint covered transport foundations and pre-migration ownership regressions, not endpoint integration. It did not mark Phase 3 complete.

#### Phase 3 endpoint integration

- Both production endpoints now use Effect RPC v2, with no legacy fallback. The private socket protocol disconnects malformed/oversized/version-mismatched peers and applies bounded native output independently of broker execution. The old decoder, message union, and Bun partial-write helper are retired.
- Broker-owned Promises publish stable-ID ownership before asynchronous checkout canonicalization. RPC observer finalizers remove subscriptions, not Git work. Completed reads alone participate in the replay eviction window; in-flight reads remain owned across read-window rollover.
- Callback-producer failures are explicitly forwarded to their output queue: `Stream.callback` does not do that automatically on v4. JSON-compatible terminal values are normalized before RPC encoding, preserving the former wire treatment of optional `undefined` fields.
- Progress is a bounded sliding heartbeat queue: healthy bursts coalesce rather than losing terminal results. Unexpected RPC interruption maps to owner unavailability; caller cancellation retains its original reason.
- The platform socket binds in a scoped private generation directory and atomically publishes an owner-only hard link. Native Node cleanup cannot unlink a replacement owner's public socket. Regression tests cover replacement preservation, concurrent publication, generation cleanup, and deep-path placement.
- The facade settles on the terminal operation event and stops observation without waiting for a second RPC Exit acknowledgement. Public Promise/AbortSignal and status contracts remain unchanged. Deterministic tests cover malformed-peer isolation, permissions, cross-client joins, retained in-flight reads, and terminal-event settlement without an Exit frame.
- Completion gates pass: full types (107 tasks), forced lint (99 tasks), full tests (105 tasks; directory-sync 848 passing with one opt-in skip), script types/tests (129 tests), architecture, dependencies, docs, changesets, and frozen installation. Fresh forced build/surface checks pass 51 public-surface and three packaged boot tests.
- Fresh Phase 3 bundles measure 12,000,709 bytes for the CLI and 1,323,803 bytes for the broker, versus preserved Phase 2 artifacts of 11,537,795 and 937,701 bytes. Private RPC adds approximately 463 KB and 386 KB respectively; no overall bundle reduction or end-to-end speedup is claimed for this transport migration.
- The 100-cycle inventory completes 300 Git operations with zero lost completions and zero baseline/final zombies. All four packaged recovery tests pass against the rebuilt broker.
- Canonical `bun start:personal` boots with an isolated local bare remote. An authenticated HTTP MCP `system_update` confirmation flow edits `green-software-principles`; the app exports and pushes its marker in an `Auto-sync` commit. Temporary configuration is restored and the app is stopped. Embeddings are disabled and the provider key is a placeholder: this verifies command/entity/Git behavior, not provider-backed generation.

## Completion

Phases 1–2 complete the independently releasable v4 upgrade: the curated boundary uses v4 APIs, `runEffectPromise` is gone, and shared-contract, lifecycle, declaration, and packaged boot gates pass. Phase 3 is also complete locally, including the independently gated broker ownership, framing, permissions, process inventory, packaged recovery, and canonical MCP entity-edit verification.

Delete this plan only when all three phases are merged and released: the separately gated broker RPC transport must also preserve ownership, stable-ID replay, recovery admission, bounded framing/output, and socket permissions, with the soak and packaged recovery gates green.
