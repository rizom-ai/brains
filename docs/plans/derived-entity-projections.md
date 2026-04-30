# Plan: Derived Entity Projections

## Status

Implemented. The immediate OOM-loop root causes were fixed in topic and skill derivation, and true derived-entity lifecycle work now uses first-class projection declarations plus projection-owned jobs instead of legacy `EntityPlugin.derive()` hooks.

## Context

Several plugins maintain **derived/materialized entities**:

```text
source events / initial sync / manual rebuild
  -> queued projection job
  -> derive desired target state
  -> reconcile persisted target entities
```

Current projection users:

- `@brains/topics`: source content entities -> topic entities via `topic:project`
- `@brains/series`: source entities with series metadata -> series entities via `series:project`
- `@brains/agent-discovery` skills: topic entities -> skill entities via `skill:project`

Projection-adjacent plugins remain explicit generation/event flows rather than projections:

- `@brains/social-media`: published entity -> social post generation job
- `@brains/summary`: conversation digest -> summary handler

The production OOM failure showed that true projections need shared lifecycle guarantees:

- no heavy inline work during startup or `sync:initial:completed`
- durable idempotency across process restarts
- queue backpressure instead of direct fanout
- deduped/coalesced jobs
- diff-based reconciliation instead of delete/recreate churn
- bounded mutation concurrency
- predictable stale cleanup
- observability around queued/running/skipped projection work

## Problem

`EntityPlugin.derive()` is an older, implicit projection hook. It is useful, but it mixes several concerns:

- manual `system_extract` routing
- batch derivation
- source-entity derivation
- plugin-local event subscriptions
- job handler registration

Because it is implicit, each plugin still owns its own scheduling and lifecycle. That leads to local reimplementation of hard-to-get-right behavior:

- in-memory `initialDerivationDone` flags
- heavy work in event handlers
- unbounded mutation fanout
- replace-all strategies that delete/recreate unchanged entities
- no shared durable projection state or source freshness model

The missing abstraction is not just a helper around the existing hooks. The missing abstraction is an explicit, projection-owned lifecycle.

## Architectural decision

A **derived entity projection owns its projection job**.

That means:

- the projection definition always provides/registers its job handler
- startup/entity-change handlers only enqueue the projection job
- the projection job does the expensive work
- the projection job uses a shared reconciler for target mutation
- old `EntityPlugin.derive()` hooks are not the foundation for new projection lifecycle behavior

Do **not** make projection handlers optional to support “queue an already registered extract job.” That hides the ownership boundary and preserves the ambiguity we are trying to remove.

## Goals

- Establish an explicit projection pattern before migrating plugins.
- Make queued, idempotent, bounded derivation the default.
- Make job ownership unambiguous.
- Preserve plugin domain boundaries: plugins own schemas and domain derivation logic.
- Migrate true projection plugins to the new pattern.
- Remove legacy `derive()`/`deriveAll()` routing from projection lifecycle and manual extraction.

## Non-goals

- Rewriting the entity service.
- Introducing a new database or external workflow engine.
- Building a full DAG scheduler in the first iteration.
- Treating all generation side effects as derived entity projections.
- Forcing social-media and summary into the projection model unless their semantics actually match.

## Correct projection model

```ts
interface DerivedEntityProjection<TJobData, TDesired, TTarget> {
  id: string;
  targetType: string;

  job: {
    type: string;
    handler: JobHandler<string, TJobData>;
  };

  initialSync?: {
    shouldEnqueue?: (ctx: ProjectionContext) => Promise<boolean>;
    jobData: TJobData;
    jobOptions?: JobOptions;
  };

  sourceChange?: {
    sourceTypes: string[];
    requireInitialSync?: boolean;
    toJobData: (event: EntityChangeEvent) => TJobData | null;
    jobOptions?: (event: EntityChangeEvent) => JobOptions;
  };

  reconcile?: {
    getStableId: (desired: TDesired) => string;
    toEntityInput: (desired: TDesired, id: string) => EntityInput<TTarget>;
    equals: (existing: TTarget, desired: TDesired) => boolean;
    deleteStale?: boolean;
    createConcurrency?: number;
    updateConcurrency?: number;
    deleteConcurrency?: number;
  };
}
```

The runner owns lifecycle and safety. The plugin owns domain derivation.

## Core rules

### 1. No heavy work in message handlers

`sync:initial:completed`, `entity:created`, `entity:updated`, and `entity:deleted` handlers enqueue jobs only.

### 2. Projection-owned jobs only

A projection must register the job it enqueues. No optional handler field. No “assume another abstraction registered this job.”

### 3. Explicit job names

Use explicit projection job names instead of overloading generic extract jobs:

- `skills:project` or `skill:derive`
- `topic:project`
- `series:project`

Names should be target-entity scoped and ownership must be clear.

### 4. Durable initial-sync gates

Initial projections must use durable checks:

- persisted target existence as the minimum gate
- projection state later if needed for zero-result projections, source hashes, and failure visibility

### 5. Diff-based reconciliation

Projection output is reconciled by stable ID:

- unchanged target -> skip
- changed target -> update
- new target -> create
- stale target -> delete, bounded/sequential by default

No projection should implement delete-all/recreate-all as its default path.

### 6. Bounded mutation concurrency

The shared reconciler centralizes limits. Deletes default to sequential. Creates/updates may be bounded later.

### 7. Observability

Every projection run should log/report:

- projection ID
- reason: initial sync, source change, manual rebuild
- queued/skipped/coalesced
- source count
- create/update/delete/skip counts
- duration
- failure reason

## Relationship to `EntityPlugin.derive()`

`EntityPlugin.derive()` / `deriveAll()` are no longer part of the entity plugin base class. Manual extraction is routed to projection-owned `{entityType}:project` jobs, and automatic lifecycle scheduling is declared through `getDerivedEntityProjections()`.

## Plugin classification

### True projections — migrated

#### Skills

- Source: topics
- Target: skills
- Uses `skill:project` with shared initial-sync/source-change scheduling and diff-based reconciliation.

#### Topics

- Source: configured content entity types
- Target: topics
- Uses `topic:project` for initial, source, derive, and rebuild modes.

#### Series

- Source: source entities with series metadata
- Target: series
- Uses `series:project` for initial/source projection jobs.

### Projection-adjacent — explicit non-projections

#### Social media

- Source: published entities
- Target/effect: generated social posts
- Uses explicit generation/publish subscriptions; not a reconciled derived-entity projection.

#### Summary

- Source/effect: conversation digests -> summary entities
- Uses the conversation digest handler directly; not an entity-source projection.

## Implementation phases

### Phase 0: Tests and API contract

Before implementation, add failing tests that encode the architecture:

- projection registration requires a handler
- initial sync enqueues, never runs handler inline
- duplicate initial-sync events do not enqueue duplicate jobs
- persisted targets skip bootstrap enqueue
- source changes enqueue only after initial sync is observed
- reconciliation skips unchanged, updates changed, creates new, deletes stale with bounded concurrency
- `EntityPlugin` can expose projection definitions without relying on legacy `derive()` ownership

### Phase 1: Projection runner and reconciler

Add the core implementation:

- `shell/plugins/src/entity/derived-entity-projection.ts`
- projection registration helper
- initial-sync enqueue helper
- source-change enqueue helper
- shared `hasPersistedTargets()` helper
- shared `reconcileDerivedEntities()` helper
- required job handler in the projection definition

Do not migrate topics in this phase.

### Phase 2: EntityPlugin integration

Add an explicit extension point to `EntityPlugin`, for example:

```ts
protected getDerivedEntityProjections(
  context: EntityPluginContext,
): DerivedEntityProjection[] {
  return [];
}
```

`EntityPlugin.register()` should register those projections after entity type/template/datasource setup.

This makes projections part of the plugin architecture instead of ad hoc calls from `onRegister()`.

### Phase 3: Migrate skills

Move skill lifecycle onto the new projection API:

- source change: topic create/update
- initial sync: queue skill projection when no persisted skills exist
- job handler: derives desired skills and reconciles with shared diff helper
- tests: existing skill initial-sync and replace-all churn regressions continue passing

### Phase 4: Migrate topics

Define explicit topic projection ownership.

Expected changes:

- add a projection-owned batch job, e.g. `topic:project`
- initial sync enqueues that job when no persisted topics exist
- source entity changes enqueue incremental extraction/projection jobs
- remove legacy `derive()`/`deriveAll()` routing in favor of projection jobs
- no startup/event handler performs extraction inline

### Phase 5: Migrate series

Move series event/initial-sync work behind projection-owned jobs:

- entity create/update/delete enqueue series projection jobs
- initial sync enqueues full series projection
- series cleanup/reconciliation is bounded and observable

### Phase 6: Audit social-media and summary

Decide whether each should:

- use only queue scheduling helpers,
- become a different kind of projection/generation trigger,
- or remove the entity-level derive hook.

### Phase 7: Durable projection state, if needed

Add explicit projection state only after migrations reveal concrete need:

```ts
interface ProjectionState {
  projectionId: string;
  lastStartedAt?: string;
  lastCompletedAt?: string;
  lastSuccessfulSourceHash?: string;
  status: "idle" | "running" | "failed";
}
```

Use this for:

- distinguishing “never ran” from “ran and produced zero targets”
- manual rebuild UX
- source watermarking
- failure recovery visibility

### Phase 8: Documentation

Document projection authoring:

- when to use derived entity projections
- when not to use them
- how to choose stable IDs
- how to write equality checks
- how to avoid replace-all churn
- how to configure initial sync/source-change behavior
- how manual extract/rebuild maps to projection jobs

## Testing plan

### Runner tests

- initial-sync event enqueues a job instead of running inline
- duplicate events coalesce to one queued job
- persisted targets cause initial projection skip
- changed source entity queues projection job only after initial sync observation
- projection definitions require a job handler
- diff reconcile skips unchanged targets
- diff reconcile updates changed targets
- diff reconcile creates new targets
- diff reconcile deletes stale targets sequentially/bounded
- failed enqueue does not poison future runs

### EntityPlugin integration tests

- entity plugin registers declared projections
- projection-owned jobs are registered through the plugin context
- projection jobs remain queued through explicit handlers
- manual extract can be routed to projection jobs after migration

### Plugin migration tests

Keep/adapt current regression tests:

- `entities/agent-discovery/test/skill-deriver.test.ts`
- `entities/agent-discovery/test/skill-initial-sync.test.ts`
- `entities/topics/test/initial-sync-derive.test.ts`
- add series projection tests before migration

## Rollout plan

1. Land the projection API and tests with no plugin behavior change.
2. Add `EntityPlugin` projection registration hook.
3. Migrate skills first.
4. Migrate topics with explicit job ownership, not optional handler scheduling.
5. Migrate series.
6. Audit social-media and summary.
7. Watch logs/metrics on yeehaa.io after each migration.

## Open questions

- Should manual `system_extract` remain a generic interface, or become a projection/job routing surface?
- Where should projection state live if/when needed: entity service, job queue metadata, or a shell-level table?
- Should source-change projections support true incremental reconciliation, or is queued full reconcile acceptable for current scale?
- Should projection definitions become part of the public plugin SDK immediately, or stay internal until topics/series migration validates the shape?

## Success criteria

- True projection plugins declare explicit projection definitions.
- Projection handlers are required and job ownership is unambiguous.
- No projection runs heavy work inline during startup/entity events.
- Skills, topics, and series no longer contain custom initial-sync derivation lifecycle code.
- Reconciliation is diff-based and bounded by default.
- Restarting a process with persisted derived entities does not re-run bootstrap derivation.
- Legacy `EntityPlugin.derive()` has been removed from the base entity plugin contract.
