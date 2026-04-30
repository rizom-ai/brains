# Plan: Derived Entity Projections

## Status

Proposed follow-up work. The immediate OOM-loop root causes were fixed in the topic and skill derivation paths, but those fixes exposed a repeated architectural pattern that should be made explicit before more derived entity plugins are added.

## Context

Topics and skills are both **materialized projections**:

```text
source entities -> expensive derivation -> persisted derived entities
```

Current examples:

- `@brains/topics`: source content entities -> topic entities
- `@brains/agent-discovery`: topic entities -> skill entities

The recent production failure showed that every projection needs the same lifecycle guarantees:

- no heavy inline work during startup or `sync:initial:completed`
- durable idempotency across process restarts
- queue backpressure instead of direct fanout
- deduped/coalesced jobs
- diff-based reconciliation instead of delete/recreate churn
- bounded mutation concurrency
- predictable stale cleanup
- observability around queued/running/skipped projection work

The point fix added these guarantees locally for topics and skills. This plan extracts the shared pattern so the same class of OOM/churn bug cannot recur in the next projection.

## Problem

Projection lifecycle logic is currently owned independently by each plugin. That leads to local reimplementation of hard-to-get-right behavior:

- in-memory `initialDerivationDone` flags that reset on every deploy
- plugin event handlers doing expensive derivation inline
- unbounded mutation fanout via `Promise.all(...)`
- replace-all strategies that delete/recreate unchanged derived entities
- no shared notion of projection idempotency, source freshness, or durable completion

The missing abstraction is a small shared projection runner/coordinator for **derived entities**.

## Goals

- Provide a shared abstraction for source-to-derived entity projections.
- Make queued, idempotent, bounded derivation the default.
- Preserve plugin boundaries: plugins still own schemas and derivation logic.
- Keep the first implementation small enough to migrate topics and skills without a broad refactor.
- Support future projections without copying the topic/skill lifecycle code.

## Non-goals

- Rewriting the entity service.
- Introducing a new database or workflow engine.
- Making every derived entity eventually consistent in exactly the same way.
- Building a full DAG scheduler in the first iteration.
- Changing topic or skill schemas unless needed for durable projection metadata.

## Proposed abstraction

Introduce a shared projection definition and runner, probably in `shell/plugins` or a small shared package if it needs to be consumed outside plugin internals.

Sketch:

```ts
defineDerivedEntityProjection({
  id: "skills-from-topics",
  sourceTypes: ["topic"],
  targetType: "skill",
  jobType: "skill:derive",
  queueKey: "skill:derive:all",

  shouldRunOnInitialSync: async (ctx) => {
    return !(await ctx.hasPersistedTargets());
  },

  deriveDesiredState: async (ctx) => {
    return ctx.plugin.deriveSkillsFromTopics();
  },

  getStableId: (skill) => skill.id,
  equals: (existing, desired) => stableSkillEquals(existing, desired),
  reconcile: "diff",
  deleteConcurrency: 1,
});
```

The runner owns lifecycle and safety; the plugin owns domain derivation.

## Core responsibilities

### 1. Initial-sync scheduling

`sync:initial:completed` should enqueue projection jobs, never run expensive derivation inline.

The abstraction should provide:

- durable `shouldRunOnInitialSync` checks
- coalesced initial job enqueueing
- skip logging when persisted targets already exist
- optional `force` mode for manual rebuilds

### 2. Change-triggered scheduling

When relevant source entities change, the projection should enqueue a deduped job rather than running inline.

Controls:

- source entity type filters
- debounce/coalescing key
- optional source ID targeting for incremental projections
- max queue concurrency inherited from job queue

### 3. Durable idempotency

The projection should not rely on process memory to know whether bootstrap work has already happened.

Minimum viable approach:

- use persisted target existence as the first durable gate
- optionally store projection metadata later: last run, last success, source watermark, source content hash

Future metadata entity/table could look like:

```ts
interface ProjectionState {
  projectionId: string;
  lastStartedAt?: string;
  lastCompletedAt?: string;
  lastSuccessfulSourceHash?: string;
  status: "idle" | "running" | "failed";
}
```

### 4. Diff-based reconciliation

Projection output should be reconciled by stable IDs:

- unchanged target -> skip
- changed target -> update
- new target -> create
- stale target -> delete, bounded/sequential by default

No projection should implement delete-all/recreate-all as its default path.

### 5. Bounded mutation concurrency

The runner should centralize mutation limits:

- creates/updates can be bounded, not unbounded `Promise.all`
- deletes should default to sequential or a very small concurrency
- per-projection lock prevents overlapping reconciles for the same target type

### 6. Observability

Every projection run should log/report:

- projection ID
- reason: initial sync, source change, manual rebuild
- queued/skipped/coalesced
- source count
- create/update/delete/skip counts
- duration
- failure reason

This should make future OOM-risk patterns visible before they hit production.

## Candidate API shape

```ts
interface DerivedEntityProjection<TSource, TTarget> {
  id: string;
  sourceTypes: string[];
  targetType: string;
  jobType: string;
  queueKey: (event: ProjectionEvent) => string;

  shouldRunOnInitialSync?: (ctx: ProjectionContext) => Promise<boolean>;
  deriveDesiredState: (ctx: ProjectionContext) => Promise<TTarget[]>;

  getStableId: (target: TTarget) => string;
  equals?: (existing: TTarget, desired: TTarget) => boolean;

  reconcile?: "diff";
  createConcurrency?: number;
  updateConcurrency?: number;
  deleteConcurrency?: number;
}
```

Plugin usage:

```ts
registerDerivedEntityProjection(context, skillsFromTopicsProjection);
```

The registration would:

- register the job handler
- subscribe to initial sync events
- subscribe to relevant source entity CRUD events
- enqueue deduped jobs
- run reconciliation safely inside the job handler

## Implementation phases

### Phase 1: Extract the minimal runner

Create the abstraction with only what topics and skills need now:

- projection registration helper
- initial-sync enqueue helper
- source-change enqueue helper
- per-projection in-process coalescing
- diff reconciler
- bounded delete loop

Likely files/packages:

- `shell/plugins/src/entity/derived-entity-projection.ts` or equivalent
- tests in `shell/plugins/test/` or package-local tests if placed elsewhere

### Phase 2: Migrate skills

Move the lifecycle code out of `entities/agent-discovery/src/plugins/skill-plugin.ts` and keep domain logic in:

- `entities/agent-discovery/src/lib/skill-deriver.ts`

Expected result:

- skill plugin declares projection config
- runner handles initial sync, topic change queueing, coalescing, and job handling
- existing skill regression tests continue passing

### Phase 3: Migrate topics

Move initial-sync and entity-change extraction scheduling from `entities/topics/src/index.ts` into a projection definition.

Expected result:

- topics plugin declares projection config
- extraction still uses existing topic extraction handler/domain code
- existing initial sync derive tests continue passing

### Phase 4: Add durable projection state, if needed

After topics and skills use the shared runner, decide whether target-existence checks are enough or whether we need explicit projection state.

Add only if it solves concrete problems:

- distinguishing "never ran" from "ran and produced zero targets"
- manual rebuild UX
- source watermarking
- failure recovery visibility

### Phase 5: Document projection plugin authoring

Add docs for plugin authors:

- when to use derived entity projections
- how to choose stable IDs
- how to write equality checks
- how to avoid replace-all churn
- how to configure initial sync behavior

## Testing plan

### Runner tests

- initial-sync event enqueues a job instead of running inline
- duplicate events coalesce to one queued job
- persisted targets cause initial projection skip
- changed source entity queues projection job
- diff reconcile skips unchanged targets
- diff reconcile updates changed targets
- diff reconcile creates new targets
- diff reconcile deletes stale targets sequentially/bounded
- failed run does not poison future runs

### Plugin migration tests

Keep or adapt current regression tests:

- `entities/agent-discovery/test/skill-deriver.test.ts`
- `entities/agent-discovery/test/skill-initial-sync.test.ts`
- `entities/topics/test/initial-sync-derive.test.ts`

Add targeted tests proving both migrated plugins use queued projection paths instead of inline derivation.

## Rollout plan

1. Land the abstraction behind existing behavior.
2. Migrate skills first; it has the clearest replace-all churn failure mode.
3. Migrate topics second; it has the clearest startup fanout failure mode.
4. Keep all existing public APIs stable.
5. Watch logs/metrics on yeehaa.io after release for projection queue counts and memory stability.

## Open questions

- Where should projection state live if/when we need durable metadata: entity service, job queue metadata, or a small shell-level table?
- Should source-change projections support true incremental derivation, or is queued full reconcile acceptable for the current scale?
- Should manual `force rebuild` be standardized as a tool per projection?
- Should projection definitions be part of the plugin SDK/public API, or remain internal until it stabilizes?

## Success criteria

- Topics and skills no longer contain custom initial-sync derivation lifecycle code.
- No projection runs heavy work inline during startup events.
- Reconciliation is diff-based and bounded by default.
- Restarting a process with persisted derived entities does not re-run bootstrap derivation.
- New derived entity plugins can use the abstraction without copying topic/skill lifecycle code.
