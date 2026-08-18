# Plan: Durable projection coalescing for bulk mutation bursts

## Status

**Implemented and validated 2026-08-18 in `fix/projection-burst-coalescing`. Release remains separately approval-gated.**

This follows Core CI run `32103466790`, where the 40-note mocked-AI update phase made 33 mocked object calls against a bound of 23. The immediately preceding merged run `32102247188` made 11 calls for the same phase and passed. The controlled two-CPU feature lane has also completed 350-note add and update phases with 88 calls per phase against a bound of 96.

The failing run's load report also recorded a maximum sustained event-loop delay of roughly 1.8 seconds during the update phase — longer than the one-second topic quiet window — while `maxProjectionOutstanding` stayed at 1 throughout. Because the quiet window slides from the latest dirty input's `markedAt`, one stall longer than the window between two writes of a burst splits it. This is direct supporting evidence for the split-wave hypothesis and confirms the excess work is sequential repetition, not concurrency.

Do not weaken the shared-runner assertion or rerun it unchanged before identifying whether the 33 calls came from distinct projection waves, repeated attempts of one wave, or another mechanism.

## Problem

Topic extraction is a whole-corpus projection. One execution reads every eligible source and sends batches of up to four entities to AI, so forty sources take ten topic calls per scan. The eleventh call in the passing phase comes from other AI projection rules the mock also serves (skill and SWOT projections). The 33-call failure is therefore not cleanly three topic scans; per-rule attribution is required before inferring wave counts.

Projection ingress is already durable and generation-based:

1. each entity mutation atomically appends a dirty source revision;
2. the scheduler waits for `sourceChangeBatchDelayMs`;
3. a wave claims an immutable generation cutoff;
4. newer ingress remains pending for a successor wave; and
5. a rule memo reuses work only when the selected whole-corpus fingerprint is identical.

That protects correctness, but a time-based quiet window cannot identify a logical bulk-import boundary. If a bulk producer is descheduled long enough, one logical import may expose several intermediate corpus snapshots. Each distinct snapshot can trigger another complete topic scan. A concurrency limiter does not solve this: job and AI concurrency are already bounded, while the excess work is sequential repetition.

The observed run remained operational and drained to zero, so there is no current evidence of deadlock. There is evidence of possible latency and AI-cost amplification under severe scheduling contention.

## Goals

- Prove the exact source of repeated extraction before changing scheduler semantics.
- Make one logical bulk mutation visible to projection scheduling as one settled burst.
- Keep every source revision durable during the burst.
- Prevent a wave that overlaps a bulk boundary from applying a partially observed whole-corpus result.
- Preserve one active projection wave, topological rule ordering, input fingerprinting, and atomic result application.
- Preserve changes that arrive during active projection work; never discard a newer revision to reduce call count.
- Remain correct across the supported web/worker process split and process crashes.
- Keep admission, recovery, and health state bounded and observable.
- Retain the strict controlled performance gate and make the ordinary Core suite deterministic without hiding superlinear work.

## Non-goals

- Adding `p-limit` or another process-local concurrency utility.
- Increasing `sourceChangeBatchDelayMs` until the failure becomes unlikely.
- Deduplicating solely by job key across wave IDs; distinct waves may represent real revisions and graph order.
- Making projection derives mutate entities or manage their own task maps.
- Exposing raw projection-batch open/close handles or scheduler stores to plugin authors. A callback-scoped bulk-mutation API and a durable-job option are allowed because ownership, fencing, and terminal release remain shell-controlled.
- Reworking the shipped terminal projection incident machinery (`projectionIncidents` / `recoveryGeneration`, released in `@rizom/brain@0.2.0-alpha.284`); this plan composes with it, it does not replace it.
- Reworking topic taxonomy, extraction prompts, or relevance policy.

## Phase 0: Establish causal evidence

### 0.0 Make the scheduler deterministic in the load fixture

The scheduler unit tests already inject `now` and `scheduleWakeup`, but `activateProjectionRuntime` does not plumb `scheduleWakeup` through to the wave scheduler, and the entity mutation path hardcodes `markedAt: Date.now()`. Before writing any reproduction test:

- thread `scheduleWakeup` through `activateProjectionRuntime`; and
- inject the clock used for `markedAt` in the entity mutation path.

Without this, the deterministic pause required by 0.2 cannot be expressed in the feature-load fixture.

### 0.1 Attribute every mocked object call

Extend the hermetic feature-load evidence with bounded, content-free projection diagnostics:

- wave ID;
- rule ID and rule version;
- queue job ID and attempt number;
- claimed cutoff generation;
- selected input fingerprint;
- selected source count;
- memo hit/miss;
- derive start, completion, cancellation, and apply outcome; and
- highest pending generation observed at completion.

Do not log entity content, titles, prompts, model output, or credentials. Prefer a typed diagnostics callback or store query used by the fixture over parsing human log messages.

### 0.2 Pin the three possible causes

Add deterministic tests that distinguish:

1. **Several wave IDs:** one producer burst was split into several durable waves.
2. **One wave/job with several attempts:** lease, retry, or fencing behavior repeated derive work.
3. **One attempt with excess calls:** the topic batch loop or AI adapter repeated work internally.

Use the injected clock/scheduler from 0.0 and an explicit pause between source writes. Do not depend on making CI busy enough to reproduce the failure.

Report object calls broken down per rule ID. The mocked total mixes topic extraction with other AI projection rules, so a raw total cannot distinguish the three causes.

### 0.3 Choose the correction from evidence

- If one job is retried, fix attempt ownership/fencing and prove one applied result.
- If one logical directory import becomes several waves, implement the durable producer boundary in Phase 1.
- If post-import revisions are genuinely distinct, keep the waves and make the expensive rule incremental rather than suppressing real changes.

The 3× call count strongly suggests split full-corpus executions, but implementation must not treat that inference as proof.

### Phase 0 result

The deterministic pre-boundary fixture advanced the injected clock past the one-second quiet window after mutation 20 of one 40-note `DirectorySync.sync()` call. It recorded two distinct topic wave IDs, one attempt per job, selected source counts of 22 and 42 (including two baseline sources), and exactly 6 plus 11 topic object calls. No retry or intra-attempt repetition occurred. This confirms split waves from one logical directory import, so Phase 1 may proceed.

## Phase 1: Add a durable bulk-mutation projection boundary

Proceed only if Phase 0 confirms split waves from one directory import.

### 1.1 Keep ownership in the entity/projection service

First narrow `ServicePluginContext.entityService` so scheduler-only methods such as `getProjectionStore` and `setProjectionWakeup` are not part of the plugin authoring surface. They remain available to shell composition through the concrete entity service.

Expose only two safe ways to identify bulk mutation ownership:

1. a callback-scoped entity API for direct in-process work; and
2. a durable root-job option for work split across queue children.

The callback form is schema-validated and does not expose open/close handles:

```ts
await entityService.runBulkMutation(
  {
    source: "directory-sync",
    operationId,
  },
  async () => {
    await applyBulkMutations();
  },
);
```

The entity service opens the boundary before invoking the callback and releases it in `finally`. An internal async scope attaches the fenced owner token to every mutation transaction performed by the callback. The durable-job form is opened by shell/job-queue integration before children become runnable and is released only from persisted root-job terminal state; plugins cannot close it directly.

Directory Sync identifies the logical operation and changed-entity count, while entity/projection and job-queue services own persistence, fencing, and scheduling. The plugin must not manage projection task maps or reach into scheduler internals.

### 1.2 Persist the boundary, owners, and fence epoch

A process-local counter is insufficient because imports and projection scheduling may run in different roles. Persist bounded coordination state in the entity database beside the projection wave tables:

- a singleton monotonically increasing projection-admission epoch;
- batch ID and sanitized source/operation identity;
- status: `preparing`, `open`, `closed`, or `abandoned`;
- opened, last-progress, terminal, and recovered timestamps;
- owner kind: callback session or durable root job;
- an opaque owner/fencing token;
- durable root job ID and expected/enqueued child counts when applicable; and
- first and highest dirty generation observed for the batch.

`preparing` and `open` both block new wave claims. `preparing` covers the cross-database enqueue window: the barrier and root ID are persisted before the first child enqueue, durable job rows bind the children to that root, and entity-database child records are materialized at execution or recovery. Enqueue completion records the expected count. Partial enqueue failure keeps admission closed until every child that did enqueue is terminal; it then abandons the batch. It never drops the barrier while an unknown child may still mutate.

Dirty inputs continue to be written atomically with entity mutations. A mutation executed in a batch scope validates the owner token and advances batch progress in the same entity transaction as the entity row and dirty revision. A callback that resumes after its owner was fenced fails before writing, so stale-owner recovery cannot permit unbarriered mutations. The batch never buffers entity writes in memory.

Each wave stores the admission epoch observed when it is claimed. Opening a batch advances the epoch. This durable epoch, rather than retained terminal rows, fences results from a wave that overlapped the boundary.

Directory Sync's operation-status service remains the natural source of sanitized operation identity, but its runtime-state persistence is not the barrier. Use a migration only after Phase 0 proves this path is required. Validate every read and write with Zod-backed contracts.

### 1.3 Define admission and active-wave fencing precisely

While any bulk projection batch is `preparing` or `open`:

- dirty generations accumulate normally;
- no new projection wave may claim an intermediate snapshot;
- embedding and other independently bounded per-entity work continue unless separately proven unsafe;
- closing the last barrier schedules one wakeup using the latest dirty generation; and
- unrelated requests remain durable even if their projection is briefly delayed.

Start with a global projection-admission barrier because a whole-corpus rule can observe partially imported state even when its triggering dirty input is unrelated. Do not claim that a source-scoped barrier is safe without proving rule visibility and graph reachability.

Opening a batch does not block waiting for an already active wave, which could deadlock a single-slot worker behind that wave's queued rule. Instead:

1. a rule checks the admission epoch before selecting input and exits as superseded without deriving if its wave is already stale;
2. `applyRuleResult` compares the wave epoch with the current epoch inside the atomic result transaction; and
3. an epoch mismatch applies no intents or memo, marks the wave superseded without an incident, and requeues its claimed inputs using the same newer-revision-preserving logic as failed-wave recovery.

This guarantees that a derive which read live entities while a batch opened cannot apply a partial result, even if the batch closed again before the derive finished. A successor after the last close observes the settled corpus. Work completed and atomically applied before the batch opened remains valid.

Support nested callback callers by joining the same operation and reference-counting the owner token. Independently owned batches may coexist, but the coordinator treats them as one global admission count and wakes only when the last closes.

Write the admission tests before implementation:

- open → dirty writes → close → one claimed wave;
- dirty writes from a second database client while open;
- nested/joined and independently overlapping boundaries;
- batch opens before select → no derive and a settled successor;
- batch opens during derive → no intents or memo apply and a settled successor;
- batch opens and closes during derive → the epoch still fences apply;
- supersession preserves original claimed inputs when the batch touches unrelated types; and
- pending ingress after close remains a successor revision.

### 1.4 Make failure loud, fenced, and recoverable

An open batch must not strand projection forever, and recovery must never authorize its former owner to resume unbarriered writes.

- Normal callback success, handled failure, and cancellation release in `finally` after mutation settlement.
- Callback sessions renew a bounded entity-database lease while active. Expiry alone does not silently release the barrier: recovery atomically fences the old token before abandonment, and every subsequent mutation transaction made by that stale scope is rejected.
- Durable root-job ownership is live while any persisted child is pending or processing, independent of which process currently executes it.
- Startup and the periodic sweep reconcile `preparing`/`open` records against callback leases and durable root-job rows. A second process preserves a live owner; a provably dead or terminal owner is closed or abandoned idempotently.
- Operational health reports count and age of open, preparing, and unrecovered abandoned batches without paths, job payloads, or content.
- Abandonment records a recovery generation. Completion of a wave covering that generation marks the batch recovered, composing with `projectionIncidents` / `recoveryGeneration` rather than creating a competing cutoff rule.

Write recovery tests before implementation:

- exception and cancellation release;
- callback lease remains live across another process startup;
- expired callback owner is fenced and a resumed mutation is rejected;
- process death before callback close;
- process death during batch enqueue, including partial enqueue;
- terminal durable root closes after every child settles; and
- operational-health reporting for preparing, stale, and unrecovered boundaries.

### 1.5 Settle durable roots and wake across the process split

The existing `BatchJobManager` map is process-local and cannot be ownership authority. Add a durable root-job aggregate query over job rows and index the persisted root ID if the query plan requires it. Projection batch recovery and settlement use that query, never the in-memory batch map.

Add a shell-owned job lifecycle observer that runs only after a child completion or terminal failure is persisted. For a projection-batched root it:

1. records the child terminal state;
2. queries the durable root aggregate;
3. closes the entity-database batch only when no bound child is pending or processing; and
4. marks partial-enqueue roots abandoned after all children that actually enqueued are terminal.

A crash after terminal job persistence but before the observer runs is repaired by the web-role sweep. Execution-only workers instantiate the coordinator/observer but do not register scheduler wake callbacks.

The scheduler currently wakes only through an in-process callback registered in the web role. Therefore:

- every ordinary wakeup re-checks barrier and pending-dirty state; and
- a bounded periodic sweep in the web role reconciles owners and reads the entity database for newly unblocked pending inputs.

Do not add a cross-process notification bus; polling the owned databases is sufficient and crash-safe. Test that the last child can close a batch in a worker process and one web-role wave starts without any web-role mutation.

## Phase 2: Preserve projection invariants

Pin these invariants before wiring Directory Sync:

1. Entity mutation, owner-token validation, batch progress, and dirty revision remain one entity-database transaction.
2. No wave claims while any bulk boundary is preparing or open.
3. A wave whose admission epoch became stale applies neither intents nor memo entries.
4. Superseding a wave requeues claimed inputs without replacing newer pending ingress.
5. Closing the last boundary claims every latest source revision exactly once into the next cutoff.
6. A newer revision written after close remains pending for a successor.
7. A crash between the final entity write and boundary close loses no revision.
8. Two database clients observe the same barrier, epoch, owner fencing, and terminal state.
9. A fenced callback or job attempt cannot resume entity mutation.
10. Rule derives remain side-effect-free until atomic write-intent application.
11. Completed fingerprints still reuse memoized intents.
12. Failed-wave incident recovery remains distinct from non-incident supersession and neither replaces newer ingress.
13. Projection graph levels and downstream changed-target propagation remain unchanged.

If any invariant requires replacing the wave model with per-rule reactive generations, stop and write a separate architecture proposal; do not grow this correction into an implicit scheduler rewrite.

Assert graph ordering and memo reuse unchanged with tests in this phase, before any Directory Sync wiring.

## Phase 3: Integrate Directory Sync

- Generate one sanitized operation ID before direct mutation or durable batch enqueue.
- For direct `sync()`/import, use the callback-scoped API only around import and orphan-delete entity mutations.
- For queued sync, open one `preparing` durable root boundary before the first child is enqueued; bind every import/delete/cleanup child that can mutate entities and finalize the bound count after enqueue.
- Close only after all bound children reach persisted terminal state.
- Do not hold the boundary across Git network operations, pre-import idle polling, unrelated media conversion, or later background jobs.
- Preserve cancellation and partial failure: completed writes remain dirty; missing or terminally failed owners lead to fenced abandonment and recovery.
- Give direct in-process sync the same admission epoch and mutation-token semantics as durable execution.
- Ensure execution-only workers participate through shared databases and the lifecycle observer without registering host UI callbacks.

Write Directory Sync tests for cancellation preservation, direct parity, multiple import children under one boundary, partial enqueue failure, and execution-only worker settlement before wiring the plugin.

Record batch duration and changed-entity count as bounded metrics. Do not record filenames or entity content.

## Phase 4: Verification

The focused store and scheduler tests are written inside Phases 1–2, before their implementations. Phase 4 runs them as a complete suite and adds the load regression below; it does not introduce new focused tests.

### Deterministic load regression

Add a 40-note add/update test that deliberately pauses progress for longer than the current one-second batch delay while a projection batch is open. Require:

- one topic derive fingerprint per logical phase;
- object-call count within the current strict bound;
- maximum shared AI concurrency at or below four;
- at most one outstanding projection job;
- all embeddings completed;
- final pending, processing, and active AI counts equal zero; and
- no degraded or not-ready health sample.

### Existing gates

Run, in order:

1. entity-service projection-store tests;
2. core projection scheduler/runtime/job-handler tests;
3. Directory Sync import tests;
4. Topics projection tests;
5. package-scoped typechecks;
6. `bun run arch:check`;
7. root typecheck, lint, test, and build;
8. the controlled two-CPU feature-load lane; and
9. packed compatibility only if public package contracts change.

Do not use a successful rerun of the unchanged shared test as acceptance evidence.

### Implementation result

The corrected deterministic 40-note add and update phases each produced one topic wave, one attempt, one fingerprint, 11 topic object calls, at most one outstanding projection job, complete embedding drain, and no degraded or not-ready sample.

The controlled two-CPU 350-note lane completed add in 29.8 seconds and update in 31.5 seconds. Each phase produced one topic wave and 88 topic object calls, with shared AI concurrency four, projection outstanding one, final queue and AI counts zero, no degraded/not-ready samples, maximum event-loop delay 369 ms, maximum RSS 1.19 GB, and maximum RSS growth 740 MB. All strict resource and efficiency bounds passed.

## Phase 5: CI contract after the runtime correction

Keep two distinct claims:

- **Ordinary Core CI:** deterministic correctness, bounded queue/concurrency, no repeated full-corpus derive for one explicit bulk batch, and complete drain.
- **Controlled feature lane:** strict CPU, memory, event-loop, throughput, and object-call efficiency under fixed affinity and no competing repository suites.

Only revise the ordinary object-call bound if the instrumented evidence proves the bound measures a scheduler artifact that remains after the runtime correction. Document the exact claim beside the assertion.

## Rollout and observability

- Ship behind no user-facing configuration flag; this is internal scheduling correctness.
- Add bounded diagnostics for preparing/open batch age, fenced-owner abandonment, abandoned-batch recovery, waves claimed after batch close, rule memo hits, and derives superseded before apply.
- Retain terminal batch details for at most seven days and at most 100 records, while keeping the singleton admission epoch and unresolved recovery cutoffs. Run cleanup after recovery and from the bounded sweep; test both age and count limits.
- Keep `/health/ready` independent unless an open batch actually prevents runtime readiness by an existing contract; expose stale state through operational health.
- Update `docs/plans/directory-sync-import-load.md`, whose current statement that the time delay prevents repeated full-corpus waves is too strong under externally descheduled producers.
- Add a changeset for affected runtime packages only after implementation scope is known.
- Merge, release, and production load testing remain separately approval-gated.

## Stop conditions

Stop and reassess rather than widening scope if:

- diagnostics show retries of one job rather than split waves;
- a batch boundary would require exposing raw open/close handles or scheduler stores publicly rather than callback/durable ownership;
- the only safe implementation globally blocks projections across long Git/network operations;
- callback fencing or durable root-job aggregation cannot distinguish a live owner from an abandoned batch;
- full-corpus topic correctness requires processing every intermediate snapshot; or
- the change cannot compose with the shipped projection incident recovery (`recoveryGeneration`) semantics.
