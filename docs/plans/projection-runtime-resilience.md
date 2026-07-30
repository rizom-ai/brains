# Projection and Runtime Resilience Plan

## Status

Proposed

## Incident summary

On 2026-07-30, `yeehaa.io` stopped responding even though its deployment, proxy, host, and container were running. Direct requests to the application and `/health` timed out.

The incident exposed five related defects:

1. A derived-entity feedback loop repeatedly executed:
   `document -> topic -> skill -> SWOT -> topic`.
2. The job worker allowed one hung derivation to occupy its only execution slot indefinitely.
3. Site rebuilding amplified intermediate entity mutations into repeated full builds.
4. Git subprocesses were not reaped by the container's PID 1, leaving hundreds of zombies.
5. Health checks detected the outage but did not make the container recover.

Additional newsletter validation errors created excessive logs during every build because optional `undefined` values crossed a JSON-only site snapshot boundary.

## Goals

- Projection pipelines always converge or are stopped by a circuit breaker.
- Derived outputs cannot become projection inputs accidentally.
- One stuck background job cannot take down the web interface indefinitely.
- Mutation bursts produce bounded background work and site builds.
- Containers reap child processes and recover automatically from deadlocks.
- Health endpoints distinguish liveness from readiness.
- Site-build inputs are valid JSON and validation failures are concise.

## Non-goals

- Replacing the current job queue database.
- Rewriting all projections as deterministic, non-AI transforms.
- Moving to a different deployment platform.

## Phase 1: remove the concrete cycle

### Make SWOT a terminal derived output

Change `entities/assessment/src/plugin.ts` so SWOT cannot be consumed by generic projections:

```ts
protected override getEntityTypeConfig(): EntityTypeConfig {
  return {
    projectionSource: false,
    projectionSourceRole: "excluded",
  };
}
```

### Default derived outputs to excluded

Update the entity projection framework so an entity type produced by a `DerivedEntityProjection` is excluded as a projection source unless the plugin explicitly opts in.

Explicit opt-in must document:

- the consuming projection;
- the convergence rule;
- the deduplication key;
- the maximum derivation depth.

### Regression test

Add a full-preset integration test that:

1. Creates a public document.
2. Drains the queue.
3. Observes topic, skill, and SWOT generation.
4. Proves that no second topic projection is caused by SWOT.
5. Proves the queue reaches quiescence within a bounded number of jobs.

## Phase 2: projection graph and causal protection

### Central projection registry

Extend `shell/plugins/src/entity/derived-entity-projection.ts` with a registry containing:

- projection ID;
- declared source types or source events;
- target entity type;
- emitted semantic events;
- whether feedback is allowed.

After plugin registration, expand wildcards against registered entity types and validate the resulting graph. Reject undeclared cycles during startup.

Event-based dependencies such as `topics:batch-completed -> skill` must be represented so graph validation can detect cycles that cross entity and message channels.

### Mutation provenance

Propagate this context through jobs, entity mutations, and messages:

- `rootJobId` / correlation ID;
- causation ID;
- projection ID;
- source entity reference;
- derivation depth.

Use job-scoped context so nested mutations inherit provenance automatically.

### Runtime circuit breaker

Even with static validation, enforce runtime limits:

- reject a repeated projection ID in the same causal lineage;
- cap derivation depth;
- cap jobs and mutations per root operation;
- open a circuit when the same projection repeatedly changes the same target set;
- expose the circuit state through readiness health and logs.

## Phase 3: convergent, idempotent derivations

### Input fingerprints

Each derived projection should persist a fingerprint of its effective inputs, including sorted source IDs, content hashes, visibility, prompt version, and model configuration.

Skip a derivation when that fingerprint matches the last successful run.

### Semantic output comparison

Do not emit entity updates when semantic content is unchanged.

For SWOT:

- compare quadrants independently of `derivedAt`;
- do not update the entity when only the timestamp changes;
- store operational generation timestamps outside the semantic content hash where possible.

For skills and topics:

- use deterministic ordering;
- use stable generation settings;
- normalize generated values before comparison;
- emit completion events only when entities were actually created, changed, merged, or deleted.

### Source evidence

Topic reinforcement should record source evidence idempotently by source entity and content hash. Reprocessing the same source revision must be a no-op.

## Phase 4: bounded and recoverable job execution

Relevant code is under `shell/job-queue`.

### Job deadlines

Add per-job-type execution deadlines and pass an `AbortSignal` into handlers. On timeout:

1. Abort supported I/O and AI calls.
2. Mark the attempt failed.
3. Release the worker slot.
4. Apply bounded retry policy.

### Leases and heartbeats

Replace `startedAt`-only claims with explicit leases:

- worker ID;
- attempt ID;
- lease expiry;
- heartbeat timestamp.

On startup, immediately reclaim attempts owned by a dead worker instead of waiting for a generic claim timeout. Long-running healthy jobs must renew their leases.

### Queue circuit breakers

Add configurable limits per job type and root operation. Initial defaults should stop abnormal rates such as:

- more than five equivalent derivations in ten minutes;
- more than three site builds from one causal mutation wave;
- sustained queue growth with no completed jobs.

### Process isolation

A JavaScript timeout cannot recover from a runtime or GC deadlock. The long-term solution is to run heavy background jobs in a separate OS process or worker container. The web process should remain able to serve the built site and health endpoints if a derivation worker hangs.

## Phase 5: site-build backpressure

Refactor `plugins/site-builder/src/lib/auto-rebuild.ts`.

### Trailing rebuilds

Use trailing debounce for automatic entity-triggered builds. Explicit user build requests may remain immediate.

### One pending successor

Use an environment-specific deduplication key and track a dirty generation:

- while idle, enqueue one build;
- while pending, update/coalesce it;
- while building, record dirty state;
- after completion, enqueue at most one successor if inputs changed.

### Site input fingerprint

Hash the route definitions, renderable entity content, templates, theme, and static assets. Skip builds whose input fingerprint equals the last successful build.

Longer term, trigger site building when a causal projection wave becomes quiescent instead of rebuilding for every intermediate entity mutation.

## Phase 6: child-process lifecycle

### Proper PID 1

Update `shared/deploy-support/src/Dockerfile` to install and use `tini`:

```dockerfile
ENTRYPOINT ["/usr/bin/tini", "--"]
```

Run the packaged brain entry point directly instead of through avoidable Bun and shell wrapper layers.

### Git process ownership

Audit `plugins/directory-sync/src/lib/git-*` and `simple-git` usage to ensure:

- every process is awaited;
- cancellation terminates child processes;
- timeout paths wait for process exit;
- shutdown drains or kills active Git operations.

Add a container-level soak test that performs hundreds of Git sync operations and asserts the zombie count remains zero.

## Phase 7: health and automatic recovery

### Separate endpoints

Provide:

- `/health/live`: minimal event-loop liveness, with no dependency traversal;
- `/health/ready`: database access, queue progress, stale leases, daemon health, and open circuit breakers.

Readiness must return HTTP 503 when the application cannot safely serve dynamic traffic.

### External supervision

Add a Docker health check plus host-level supervision capable of restarting an unhealthy container. A Docker health status alone does not trigger recovery.

The watchdog should restart only after multiple consecutive liveness failures and should preserve logs and emit an incident record before restart.

### Resource signals

Expose or log:

- RSS and heap usage;
- FD count;
- process/zombie count;
- queue depth by status and type;
- age of oldest pending and processing jobs;
- jobs and mutations per root operation;
- site-build rate;
- projection circuit-breaker state.

## Phase 8: site-content validation boundary

Prepared site snapshots must contain JSON values, but data sources can currently return explicit `undefined` properties.

### Normalize at the boundary

Before `jsonObjectSchema` validation in `plugins/site-builder/src/lib/prepare-site-build.ts`, recursively omit `undefined` object properties. Do not silently coerce unsupported values such as functions, symbols, unsafe integers, or non-JSON class instances.

Data sources such as the newsletter detail datasource should also omit absent optional fields rather than assigning `undefined`.

### Concise validation logging

Log structured Zod issues with route, section, template, and field paths. Do not include minified bundle source excerpts in normal validation errors.

Add regression fixtures for draft newsletters without `sentAt`, `scheduledFor`, or `sourceEntities`.

## Delivery sequence

### PR 1: upstream cycle fix and recovery

- Mark SWOT as an excluded projection source upstream.
- Make derived projection outputs excluded by default unless explicitly opted in.
- Add the full-preset quiescence regression test.
- Publish a new `@rizom/brain` release.
- Upgrade `yeehaa.io` directly to that release, deploy, and verify the persisted queue reaches quiescence.

### PR 2: process and recovery safety

- Add `tini` and direct entrypoint execution.
- Add job deadlines, cancellation, and startup recovery.
- Add liveness/readiness separation and watchdog integration.

### PR 3: convergence and amplification

- Add projection input fingerprints.
- Make SWOT semantic updates idempotent.
- Add bounded site-build scheduling and fingerprints.
- Fix JSON `undefined` normalization.

### PR 4: projection architecture

- Add projection registry and graph validation.
- Add causal provenance and runtime work budgets.
- Add circuit-breaker health reporting.

### PR 5: failure isolation

- Move heavy background processing into a separate worker process/container.
- Verify the web process remains responsive during worker failure and restart.

## Acceptance criteria

1. A new document produces one bounded topic/skill/SWOT wave and the queue reaches idle.
2. The full preset contains no undeclared projection cycle.
3. Reprocessing unchanged inputs produces no entity mutations.
4. A hung job times out or is isolated without permanently blocking the queue.
5. A dead worker's job is reclaimed after restart without duplicate completion.
6. A mutation burst creates at most one build plus one necessary successor.
7. Hundreds of Git syncs leave zero zombie processes.
8. Readiness returns 503 for stale workers or open circuit breakers.
9. Draft newsletters build without optional-field validation errors.
10. A one-hour mutation soak test shows bounded RSS, FD count, process count, queue depth, and site-build rate.
