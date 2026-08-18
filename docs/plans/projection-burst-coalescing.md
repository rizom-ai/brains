# Plan: Durable projection coalescing for bulk mutation bursts

## Status

**Proposed 2026-08-18. No implementation or release is authorized by this plan.**

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

## Phase 1: Add a durable bulk-mutation projection boundary

Proceed only if Phase 0 confirms split waves from one directory import.

### 1.1 Keep the boundary in the entity/projection service

Add an internal entity-service operation such as:

```ts
await projectionBatches.run(
  {
    source: "directory-sync",
    operationId,
  },
  async () => {
    await applyBulkMutations();
  },
);
```

The exact API is schema-validated and internal. External plugin authors do not receive a general ability to suspend projection processing.

Directory Sync identifies the logical import boundary, while the entity/projection service owns its persistence and scheduling effect. The plugin must not manage projection task maps or reach into scheduler internals.

### 1.2 Persist the boundary

A process-local counter is insufficient because imports and projection scheduling may run in different roles. Persist a bounded projection batch record with at least:

- batch ID;
- sanitized source/operation identity;
- status: `open`, `closed`, or `abandoned`;
- opened, last-progress, and closed timestamps; and
- optional owning durable job ID when one exists.

Dirty inputs continue to be written atomically with entity mutations. The batch does not buffer entity writes in memory.

The batch record lives in the entity database beside the projection wave tables. Invariant 2 is only enforceable if wave claiming checks open batches inside the same transaction that claims the wave; a record in the runtime-state or job-queue database cannot participate in that transaction. Directory Sync's operation-status service is the natural source of the sanitized source/operation identity, but its runtime-state persistence must not be the barrier itself.

Use a migration only after the Phase 0 evidence proves this path is required. Validate all reads and writes with Zod-backed contracts.

### 1.3 Define admission precisely

While a bulk projection batch is open:

- dirty generations accumulate normally;
- no whole-corpus projection wave may claim an intermediate snapshot;
- embedding and other independently bounded per-entity work continue unless separately proven unsafe;
- closing the last open batch schedules one wakeup using the latest dirty generation; and
- unrelated requests remain durable even if their projection is briefly delayed.

Start with a global projection-admission barrier because a whole-corpus rule can observe partially imported state even when its triggering dirty input is unrelated. Do not claim that a source-scoped barrier is safe without proving rule visibility and graph reachability.

Support nested callers by joining an existing operation batch or reference-counting through durable ownership; never open competing uncoordinated global barriers.

Write the admission tests before the implementation:

- open → dirty writes → close → one claimed wave;
- dirty writes from a second database client while open;
- nested/joined boundary behavior;
- active-wave plus open-successor behavior; and
- pending ingress after close.

### 1.4 Make failure loud and recoverable

An open batch must not strand projection forever.

- Normal success and handled failure close the boundary in `finally` after mutation settlement.
- Startup detects an open batch left by a dead process, marks it abandoned, and wakes the scheduler with the already durable dirty inputs.
- A live durable owner is not declared abandoned merely because another process starts.
- Operational health reports the count and age of open/abandoned batches without exposing paths or content.
- Stale recovery is idempotent, covered by the same generation cutoff rules as ordinary admission, and composes with the shipped `projectionIncidents` / `recoveryGeneration` cutoff semantics rather than introducing a parallel recovery mechanism.
- No elapsed-time callback silently drops the barrier while its owner can still mutate data.

Write the recovery tests before the implementation:

- exception and cancellation release;
- process-death/startup recovery; and
- operational-health reporting for stale boundaries.

### 1.5 Wake the scheduler across the process split

The scheduler currently wakes only through an in-process callback registered in the web role; worker-role runtimes execute jobs without ever calling `startNextWave`, and no poller exists. A batch closed by a worker process must not wait for an unrelated web-role mutation:

- the web-role scheduler re-checks closed-batch and pending-dirty state on every existing wakeup; and
- a bounded periodic sweep in the web role reads the entity database it already owns for closed batches and pending dirty inputs left by other processes.

Do not add a cross-process notification bus for this; polling the owned entity database is sufficient and crash-safe. Write a test proving a worker-closed batch leads to one web-role wave without any web-role mutation.

## Phase 2: Preserve projection invariants

Pin these invariants before wiring Directory Sync:

1. Entity mutation and dirty revision remain one transaction.
2. No wave claims while a bulk boundary is open.
3. Closing a boundary claims every latest source revision exactly once into the next cutoff.
4. A newer revision written after close remains pending for a successor.
5. A crash between the final entity write and boundary close loses no revision.
6. Two database clients observe the same open/closed state.
7. Rule derives remain side-effect-free until atomic write-intent application.
8. Completed fingerprints still reuse memoized intents.
9. Failed-wave recovery does not replace newer pending ingress.
10. Projection graph levels and downstream changed-target propagation remain unchanged.

If any invariant requires replacing the wave model with per-rule reactive generations, stop and write a separate architecture proposal; do not grow this correction into an implicit scheduler rewrite.

Assert graph ordering and memo reuse unchanged with tests in this phase, before any Directory Sync wiring.

## Phase 3: Integrate Directory Sync

- Open one projection batch around the entity-mutation portion of one directory import/sync batch.
- Close it only after all intended entity writes for that logical batch settle.
- Do not hold it across Git network operations, idle polling, unrelated media conversion, or later background jobs.
- Preserve cancellation: completed writes remain dirty and become projectable after the batch is abandoned/closed.
- Give direct in-process sync calls the same semantics as durable job execution.
- Ensure execution-only workers can participate through the shared database without registering host UI callbacks.

Write the Directory Sync boundary tests (cancellation preservation, direct in-process sync parity, execution-only worker participation) before wiring the plugin.

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

## Phase 5: CI contract after the runtime correction

Keep two distinct claims:

- **Ordinary Core CI:** deterministic correctness, bounded queue/concurrency, no repeated full-corpus derive for one explicit bulk batch, and complete drain.
- **Controlled feature lane:** strict CPU, memory, event-loop, throughput, and object-call efficiency under fixed affinity and no competing repository suites.

Only revise the ordinary object-call bound if the instrumented evidence proves the bound measures a scheduler artifact that remains after the runtime correction. Document the exact claim beside the assertion.

## Rollout and observability

- Ship behind no user-facing configuration flag; this is internal scheduling correctness.
- Add bounded diagnostics for open batch age, abandoned-batch recovery, waves claimed after batch close, rule memo hits, and derives superseded before apply.
- Keep `/health/ready` independent unless an open batch actually prevents runtime readiness by an existing contract; expose stale state through operational health.
- Update `docs/plans/directory-sync-import-load.md`, whose current statement that the time delay prevents repeated full-corpus waves is too strong under externally descheduled producers.
- Add a changeset for affected runtime packages only after implementation scope is known.
- Merge, release, and production load testing remain separately approval-gated.

## Stop conditions

Stop and reassess rather than widening scope if:

- diagnostics show retries of one job rather than split waves;
- a batch boundary would require exposing projection suspension publicly;
- the only safe implementation globally blocks projections across long Git/network operations;
- crash recovery cannot distinguish a live owner from an abandoned batch;
- full-corpus topic correctness requires processing every intermediate snapshot; or
- the change cannot compose with the shipped projection incident recovery (`recoveryGeneration`) semantics.
