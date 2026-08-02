# Projection Scheduling and Runtime Resilience Plan

## Status

Implementation is in progress on `work/projection-runtime-resilience`.

The incident-hardening work is largely implemented. The remaining structural
problem is projection fan-out: N source mutations can independently trigger N
jobs at each derivation level and repeated site builds. This plan solves that
problem with scheduler-owned derivation waves.

This plan keeps the existing packaging and deployment shape:

- one published Bun package;
- one bundled Brain entrypoint;
- one configured Brain runtime;
- the existing job queue, entity service, and plugin system.

Worker-only packages, runtime profiles, schema marker files, liveness marker
files, and new process-coordination environment variables are rejected
outright. Process splitting is in scope but sequenced last: the "Process
supervisor" part at the end of this plan isolates queue execution into a child
process of the same bundle, and starts only after the scheduler work above is
complete.

## Problem

The current derivation system is event choreography. Every projection reacts to
source changes independently:

```text
N source changes
└── N topic triggers
    └── topic mutations trigger skill work
        └── skill mutations trigger SWOT work
            └── intermediate mutations trigger site builds
```

Deduplication and debounce reduce some bursts, but they do not define a batch
boundary or guarantee one execution per rule. The system discovers a wave by
reacting to events instead of scheduling one explicitly.

N is arbitrary. It may be 2, 100, or 100,000. The architecture must make job
cardinality depend on the number of reachable rules, not the number of source
entities:

```text
projection jobs per wave = O(reachable rules)
not O(changed entities × reachable rules)
```

Model calls may still scale with total input tokens when deterministic chunks
are required by a model context limit. They must not scale because one event
created one job per entity.

## Decision

Derivations become scheduler-owned batch rules executed in topological waves.
Entity and semantic events no longer connect derivation rules to each other.
Events remain valid for external ingress and observer notification.

```text
ingress mutations
└── append dirty entity revisions
    └── scheduler atomically claims and coalesces one dirty generation
        └── find reachable rules from the validated projection graph
            └── level 0: enqueue one job per reachable rule
                └── changed write results feed level 1
                    └── continue through the acyclic graph
                        └── successful wave end
                            └── make one site-build decision
```

For any settled dirty set, each reachable rule executes at most once in the
wave. Independent rules at the same level may execute concurrently.

## Invariants

1. A rule is scheduled by the wave scheduler, never by another rule's event.
2. Each reachable rule has at most one job per wave.
3. The projection graph is acyclic. Startup rejects every cycle.
4. A rule fingerprints the exact immutable input object passed to its derive
   function.
5. An unchanged fingerprint performs no model call.
6. The framework applies rule writes idempotently and reports which targets
   actually changed.
7. Only changed targets make downstream rules reachable.
8. New ingress during an active wave remains pending for a successor wave.
9. A successful wave makes one site-build decision; an unchanged site
   fingerprint performs no render.
10. Job attempts, leases, retries, sessions, and deadlines remain owned only by
    the existing job queue.

## Rule contract

Projection declarations remain private plugin capabilities collected by
`PluginManager`. They are not exposed through broad `IShell` or plugin-context
mutation APIs.

An executable rule declares:

```ts
interface ProjectionRule<TInput> {
  id: string;
  version: string;
  sources: readonly ProjectionSource[];
  targetType: string;
  inputSchema: z.ZodType<TInput>;

  selectInput(
    trigger: ProjectionWaveTrigger,
    context: ProjectionInputContext,
    signal: AbortSignal,
  ): Promise<TInput>;

  fingerprint(input: TInput): string;

  derive(
    input: TInput,
    context: ProjectionExecutionContext,
    signal: AbortSignal,
  ): Promise<ProjectionWriteIntent[]>;
}
```

### Input selection

The dirty set determines reachability; it is not necessarily the complete rule
input. Global rules select their full effective current input:

- skill selects the complete visible topic set;
- SWOT selects the complete relevant skill, agent, identity, prompt, and model
  configuration;
- series selects the complete current membership set;
- topic reconciliation selects the complete relevant topic set.

`selectInput` returns one plain, immutable JSON-compatible object containing all
effective inputs: sorted source IDs and content hashes, visibility, prompt
content/version, plugin configuration, identity inputs, model configuration,
and any explicit operator invalidation revision.

The framework supplies the canonical fingerprint implementation; rule
definitions cannot override it. It computes and stores the fingerprint from
that object, then passes the same frozen object to `derive`. `derive` may not
perform additional live entity reads that change its semantic input.

### Execution context

`ProjectionExecutionContext` is narrow. It contains cancellation, logging,
metered AI access, and deterministic helpers. It does not expose entity
mutation APIs. Rules return canonical upsert and delete intents; the framework
resolves each upsert to create, semantic update, or no-op and owns persistence.

### Batching large model inputs

One wave still creates one job per rule. If a rule's selected input exceeds a
model context limit, the rule uses a deterministic token-budget partition of
that input inside the job. The partition count is a function of input size and
model limits, never the number of emitted entity events.

## Minimal durable state

The scheduler adds only state required to avoid losing work across a restart.
It does not duplicate job-queue ownership.

Dirty inputs, wave coordination, and rule memos live in the entity database.
That placement is required: an entity mutation and its dirty revision must
commit in the same database transaction or a crash between two databases could
silently lose projection work. The entity-service package owns these tables and
exposes a narrow internal projection-store contract; `shell/core` does not
reach into its database directly. The job-queue database remains exclusively
responsible for jobs and their execution lifecycle.

### Dirty revisions

Pending ingress is an append-only revision journal:

```text
(generation, kind, sourceType, sourceId, revision, operation, markedAt)
```

Entity inputs use `kind = entity`, their entity type and ID, and content hash as
the revision. `operation` is `upsert` or `delete`; deletes are tombstones.
Non-entity inputs use `kind = rule`, the affected rule ID, and a revision for
prompt/configuration/model changes or explicit operator invalidation. This
makes those changes schedulable without inventing process-coordination state.

For entity inputs, the entity-service create, update, or delete transaction
also inserts the journal row atomically. Each insert receives a database-owned,
monotonic generation; marking dirty never rewrites an earlier generation or
uses conflict-update SQL. Claiming coalesces rows through its generation cutoff
to the latest revision per `(kind, sourceType, sourceId)`, then removes all
journal rows through that cutoff. A newer mutation has a greater generation and
cannot be cleared accidentally.

### Wave records and claimed inputs

A wave header records:

```text
(id, cutoffGeneration, graphFingerprint, status, startedAt, completedAt)
```

The claim transaction copies each coalesced latest dirty revision into a
wave-input record before removing the covered journal generations:

```text
(waveId, kind, sourceType, sourceId, revision, operation, generation)
```

This is the durable recovery source. A newer pending revision for the same
entity can coexist with the claimed wave input.

A per-rule record stores only scheduler coordination:

```text
(waveId, ruleId, targetType, level, jobId, status, inputFingerprint, changedTargets)
```

It does not store attempts, leases, heartbeats, or retry counters. Those remain
in the existing job queue. `jobId` lets the scheduler reconcile terminal job
results after restart.

The one-running-wave invariant should be structural, not just behavioral: a
unique partial index on `status = 'running'` makes concurrent claims impossible
at the database level instead of relying on the check-then-insert transaction.

### Rule memos and atomic application

A memo stores:

```text
(ruleId, ruleVersion, inputFingerprint, canonicalWriteIntents)
```

After derivation, one entity-service transaction:

1. inserts the memo if it is absent;
2. applies canonical upsert and delete intents, resolving each upsert to
   create, semantic update, or no-op;
3. records the changed-target set and terminal wave-rule outcome.

A crash before this transaction may repeat model generation because no durable
output exists yet. After the transaction commits, retry replays or verifies the
memo without another model call, even if job-queue completion was interrupted.
The transaction reconciles only targets owned by that rule.

Memos must not grow without bound: each distinct (rule, version, fingerprint)
stores full write-intent JSON forever if never pruned. Retention rule: a memo
is only needed to make an interrupted or repeated application of the _current_
input replayable, so keep the latest memo per (ruleId, ruleVersion) and delete
older fingerprints once a newer memo's wave completes.

These are the only new durable scheduler concepts: pending dirty revisions,
claimed wave inputs and coordination, and rule memos. They share the entity
database so entity writes and scheduler outcomes have one atomic boundary.

## Wave lifecycle

### 1. Mark dirty

External mutations—directory sync, user edits, API writes, and chat tools—append
a source revision in the same entity-service transaction as the mutation. A
changed rule configuration fingerprint or explicit operator invalidation
appends a direct rule revision. Startup hydration and persistence replay do not
mark entity inputs dirty.

Projection-owned writes do not re-enter the global event path. Their changed
results are attached directly to the active wave and evaluated against the
next graph level.

### 2. Start one wave

A short trailing debounce allows an ingress burst to settle. If no wave is
active, the scheduler atomically:

1. chooses cutoff generation G;
2. creates a wave record;
3. coalesces dirty rows with generation ≤ G to the latest row per scheduling
   input and copies those revisions into durable wave inputs;
4. deletes journal rows with generation ≤ G;
5. pins the finalized graph fingerprint.

Only one wave is active in one Brain runtime. Ingress newer than G stays dirty
for the successor wave.

### 3. Schedule a level

The scheduler finds rules reachable from the current changed entity types and
enqueues one job per rule using the durable key:

```text
projection-wave:<waveId>:<ruleId>
```

The job queue owns execution deadlines, cancellation, fenced completion,
leases, retries, and worker sessions.

### 4. Advance

After all jobs in a level complete, the scheduler reads their atomically
persisted wave-rule outcomes. Only targets that were actually created,
semantically updated, or deleted feed the next level.

A memo hit returns the previously recorded write intents. The same
entity-service transaction verifies or reapplies those intents and records the
outcome. If they are already reflected in entity state, the changed-target set
is empty and no downstream rule runs.

### 5. Complete or fail

A successful final level marks the wave complete, enqueues embedding jobs for
every changed target, and requests one site build. The embedding step is not
optional: wave writes apply entity rows directly and bypass the interactive
mutation path that normally schedules embedding generation, so without it,
derived content (topics, skills, SWOT) would be invisible to semantic search
until the next boot-time backfill. The existing site fingerprint skips
rendering when output would be identical.

If a rule exhausts queue retries:

- the wave is marked failed;
- no wave-completion site build runs;
- claimed wave inputs are returned to the dirty set unless a newer pending
  revision already supersedes them;
- repeated rule crashes may open the existing persisted projection circuit.

Restart recovery reads the active wave, reconciles each recorded `jobId` with
the job queue, and resumes from the first incomplete level. It does not create a
second job for a completed or active rule.

A wave whose pinned graph fingerprint no longer matches the finalized
composition (a deploy changed rules or rule versions mid-wave) must not wedge
the scheduler: refusing to advance it is correct, but recovery must then fail
that wave — returning its claimed inputs to the dirty set — and claim a fresh
wave under the new fingerprint. An active stale wave that can only throw would
otherwise block every successor while ingress accumulates in the journal.

## Graph policy

The existing projection registry remains the composition authority.

At startup it:

- expands wildcard entity sources;
- rejects duplicate rule IDs;
- rejects unknown targets;
- rejects all directed cycles;
- computes topological levels;
- produces the graph fingerprint pinned by each wave.

Intentional feedback/fixpoint groups are deferred. No current production
projection requires one. If a legitimate cyclic derivation is introduced, it
requires a separate design and cannot bypass the acyclic startup gate.

Semantic completion events may still be emitted for external observers, but
no projection rule consumes them to schedule another projection.

## Relationship to completed resilience work

The wave scheduler builds on, rather than replaces, the incident fixes already
implemented on this branch:

- derived outputs fail closed as projection sources;
- the concrete SWOT feedback edge is removed;
- projection composition is validated before runtime startup;
- job attempts are leased, deadlined, cancellable, and fenced;
- worker sessions fence replaced processes;
- projection circuits persist and appear in readiness;
- semantic output comparison prevents timestamp-only mutations;
- site input fingerprints skip identical renders;
- trailing rebuild backpressure prevents mutation bursts from starting
  parallel builds;
- Git operations are cancellable and children are reaped;
- liveness and readiness are separate.

Causal lineage and runtime budgets remain temporary guards while any
choreographed projection still exists. They can be removed only after every
rule has migrated and the old event scheduling path has no callers.

## Migration strategy

Wave scheduling and event choreography may coexist only across disconnected
graph components. A connected derivation component cannot be split across
execution owners: suppressing projection events would strand event-owned
downstream rules, while emitting them would let work escape the wave.

Each connected component therefore has one execution owner:

```text
event-owned | wave-owned
```

Startup rejects a rule registered in both modes and rejects every graph edge
whose endpoints have different owners. Production cutover changes an entire
connected component atomically. Completion events may still be emitted for
external observers, but no projection consumes them inside a wave-owned
component.

### Stage 0: clean contract boundary

- Remove the unfinished event-job-payload fingerprint rollout.
- Keep proven PR 5 semantic fingerprints until each handler migrates.
- Introduce `ProjectionRule`, narrow input/execution contexts, canonical write
  intents, and entity-database memo storage.
- Add entity-service schema and repository tests for atomic mutation/dirty
  writes, dirty claims, wave recovery, atomic rule application, and memos.
- Remove the registry's now-dead feedback surface: cycles are rejected
  unconditionally, so `feedback` declarations and the always-empty
  `declaredCycles` graph field are vestigial.
- Schema nit: drop the dirty table's separate generation index — `generation`
  is already the integer primary key.

### Stage 1: scheduler walking skeleton

- Add the scheduler in `shell/core` and scheduler persistence in the entity
  database.
- Mark external entity mutations dirty atomically.
- Exercise one isolated fixture component end to end without changing a
  production projection's execution owner.
- Prove arbitrary N source revisions create one rule job in the fixture wave.
- Keep all production components event-owned until a complete connected
  component is ready to cut over.

### Stage 2: migrate connected derivation components

Migrate every registered derivation discovered from the graph, one complete
connected component per cutover, including:

- skill;
- SWOT;
- series;
- conversation-memory summaries;
- newsletter;
- social posts;
- preset-specific rules.

For each component, remove all internal semantic-event scheduling edges in the
same cutover that changes its owner to `wave-owned`. At the end of this stage,
one ingress batch produces one job per reachable rule in validated topological
order, with no event bridge between projection rules.

### Stage 3: wave-end site build

- Disable automatic rebuild triggers for wave-owned writes.
- Request one build after successful wave completion.
- Retain immediate explicitly requested builds.
- Retain the site input fingerprint as the final render cache boundary.

### Stage 4: delete choreography guards

After all rules are wave-owned and soak tests pass:

- remove projection event subscriptions;
- remove projection lineage/depth enforcement;
- remove per-root projection job/mutation budgets;
- keep persisted crash circuits, queue fencing, health diagnostics, and a
  scheduler assertion that jobs per wave cannot exceed reachable rule count.

## Testing strategy

The tests verify cardinality invariants, not a special value of N.

### Unit and property tests

For generated dirty sets of varying size:

- every reachable acyclic rule is scheduled once;
- unrelated rules are not scheduled;
- duplicate revisions collapse to the latest source revision;
- mutations after the cutoff remain pending;
- unchanged fingerprints use memo replay;
- only semantic writes propagate downstream;
- restart resumes the same wave and job IDs;
- an entity mutation and dirty revision commit or roll back together;
- memo, semantic writes, changed targets, and wave-rule completion commit or
  roll back together;
- no connected graph edge crosses execution owners.

### Full-preset integration

For the Rover full graph:

```text
documents → topics → skills → SWOT
```

assert:

- one job per reachable rule;
- topological level order;
- no second topic execution;
- no model calls for unchanged rule inputs;
- one site-build decision after successful completion.

A batch of 100 documents remains a useful load fixture, but it is only one
sample proving the general invariant. The implementation must pass the same
cardinality assertion for every tested batch size.

### Failure tests

- changes arriving during execution create one successor wave;
- a timed-out rule retries under the existing fenced attempt;
- retry exhaustion fails the wave and requeues ingress;
- process restart resumes from durable wave/job records;
- a crash between wave claim and rule-row creation leaves a running wave with
  zero rule rows; recovery treats it as "schedule level 0 from wave inputs";
- a committed memo/result transaction survives interruption before job-queue
  completion and retries without a second model call;
- wave-end embedding enqueue covers every changed target, so derived entities
  are searchable without waiting for boot backfill;
- an open persisted circuit keeps full operational readiness at 503 until
  expiry; after S5, this assertion targets `/health/operate` while routing
  readiness remains web-specific.

## Acceptance criteria

1. For any dirty batch size N, each reachable rule has at most one job in the
   wave.
2. Job cardinality is O(reachable rules), not O(N × reachable rules).
3. The full preset has no projection cycle and executes in topological order.
4. Reprocessing an unchanged rule input performs no model call and no semantic
   entity mutation.
5. Entity mutation plus dirty marking, and memo plus projection writes plus
   wave-rule outcome, each commit atomically.
6. Changes during a wave are not lost and run in a successor wave.
7. Restart resumes an active wave without duplicating completed rule jobs.
8. A successful changed wave performs at most one site render; an unchanged
   site fingerprint performs none.
9. Existing job deadlines, leases, fencing, circuits, health checks, Git child
   lifecycle, and JSON site boundary continue to pass.
10. The implementation remains inside the existing single Bun package and does
    not introduce process-coordination files or environment variables.

## Explicitly deferred

- Splitting web and worker execution into separate packages, containers, or
  runtime profiles (the process supervisor below keeps one package and one
  container).
- Distributed scheduling or multiple active Brain nodes.
- Cyclic/fixpoint projection groups.
- Replacing the existing job queue or entity database.

## Process supervisor

Sequenced after the scheduler work above; do not start it earlier. Phase S3
onward additionally assumes the attempt leases, `job_worker_sessions` reclaim,
and host watchdog from the completed resilience work; S5 builds on its
health-endpoint split.

### Problem

A hung job handler currently escalates through `markUnhealthy` to
`process.exit(1)`, restarting the whole container. The web interface — which
could keep serving the built site and health endpoints — goes down with the
worker. A JavaScript timeout cannot recover from a runtime or GC deadlock, so
isolation must be at the OS-process level. An earlier draft expanded this into
deployment isolation (separate images, runtime profiles, schema marker files,
liveness files); that was the wrong scope — two containers need file- or
network-based coordination, while two child processes of one parent get
ordering and liveness from the process model itself.

### Decision

One published Bun package, one bundled entrypoint, one Docker image, one
container. The entrypoint becomes a small parent supervisor:

```text
tini
└── @rizom/brain/dist/brain.js start        (parent supervisor)
    ├── brain.js start --child=web          (interfaces, ingress, daemons)
    └── brain.js start --child=worker       (queue execution)
```

All three processes execute the same bundle and load the same brain
configuration. The child role is an internal argv flag the parent appends when
spawning; operators never pass it and no new environment variables exist.

### Design

- **Parent**: in the final topology, runs migrations exactly once, closes the
  migration database handles, starts the web child, waits for a bounded IPC
  `runtime-ready` signal, and only then starts the worker child. After startup
  it holds process and IPC handles but no application database connections or
  plugin services. Duties: spawn, signal forwarding (`SIGTERM`/`SIGINT`
  forwarded, 15s grace, then `SIGKILL`), reaping, worker startup deadlines,
  and worker respawn with exponential backoff budgeted at 3 attempts per
  rolling hour. If the budget is exhausted, the parent keeps web alive, marks
  worker supervision paused, and retries when the rolling window next permits
  an attempt. A web child exit ends the parent immediately: a dead web child
  is a container-level failure handled by the container restart policy.
- **Web child**: boots interfaces, ingress, plugin ready hooks, daemons, the
  wave scheduler, and enqueue services, but never starts `JobQueueWorker`.
  When initial sync, prompt/identity materialization, and ready hooks finish,
  it sends `runtime-ready` to the parent. It continues serving while the
  worker is restarting or paused. Because the worker starts only after
  `runtime-ready`, nothing on the web ready path may await a queued job's
  completion — initial sync imports entities inline today and downstream
  projections merely enqueue, but this is an invariant, not an accident. A
  boot test must prove the web child reaches `runtime-ready` with no worker
  process present.
- **Worker child**: uses an execution-only registration path introduced after
  every projection is wave-owned. It loads entity schemas/adapters, narrow
  projection-rule execution capabilities, AI dependencies, all declared job
  execution capabilities, and `JobQueueWorker`; it does not register
  interfaces, ingress subscriptions, daemons, tools, or plugin ready hooks.
  Before this split, an inventory test must prove that every registered job
  type declares all local dependencies required in the worker. A handler that
  relies on web-only mutable plugin state or an in-memory web `MessageBus`
  subscriber blocks S3 until that dependency is refactored into an explicit
  execution capability or durable service; this plan does not silently add a
  cross-process message bus. The existing `markUnhealthy` → `process.exit(1)`
  escalation then restarts only the worker. After boot it sends
  `worker-ready`, then heartbeats every 5s over the child-process IPC channel.
  A startup deadline or 3 consecutive missed beats causes the parent to kill
  and respawn it under the same budget.
- **Shared SQLite**: web enqueues while the worker claims from the same
  job-queue database file. WAL mode and `busy_timeout` pragmas must be applied
  in every child process — verify `applySqlitePragmas` runs in both boot paths.
  Scheduler state remains in the shared entity database as defined above.
- **Migration ownership**: the parent-to-child spawn ordering is the schema
  barrier; there is no marker file. Internal child argv tells `App` that the
  parent already completed migrations. This option is package-internal and is
  not an operator-facing runtime profile.
- **Health semantics**: `/health/live` remains dependency-free.
  `/health/ready` represents web-serving/routing readiness and returns 200
  while worker execution is degraded; its payload may include a `degraded`
  worker check from `job_worker_sessions`. A separate `/health/operate`
  endpoint represents full operational readiness and returns 503 for a stale
  or paused worker, queue failure, unhealthy daemon, or open projection
  circuit. Kamal uses `/health/ready`; operational monitoring uses
  `/health/operate`; Docker and the host watchdog continue to act only on
  liveness. Worker degradation never triggers a container restart. Because no
  automated recovery acts on a paused worker, `/health/operate` must have a
  named consumer — external uptime monitoring alerting the operator — and the
  parent must emit a structured `worker-supervision-paused` incident to stderr
  when it pauses worker supervision. Container logging preserves that record
  without adding a host-path mount or coordination file; the watchdog only
  records incidents on restarts, and a pause without a log and alert is silent
  degradation.

### Phases

Each phase lands with deterministic tests; fake clocks and scripted child
promises replace sleep-based synchronization. The tree stays green after every
phase.

0. **S0 — execution-boundary inventory**: enumerate every registered job type
   in the full preset and its entity, AI, template, registry, and messaging
   dependencies. Convert registration to immutable job execution capabilities.
   Prove execution-only boot can construct every handler without interfaces,
   ingress subscriptions, daemons, or ready hooks. S1 may start before every
   handler is converted, but S3 is blocked until this gate passes. The known
   largest item is job progress reporting: `JobProgressMonitor` emits over the
   in-process message bus that web interfaces subscribe to, so in a worker
   child those emissions have no subscribers and chat/web progress goes dark.
   It must move to a durable path — the natural fit is the web child polling
   job status from the shared queue database — before S3.
1. **S1 — supervisor skeleton**: parent spawns a single `--child=web` process;
   the unchanged web child still owns migrations in this phase. Add signal
   forwarding, reaping, and exit-code propagation with externally identical
   behavior.
2. **S2 — parent boot ownership**: extract migration execution to the parent,
   add the internal child "migrations completed" contract, add the bounded web
   `runtime-ready` IPC handshake, and prove no child starts before migrations
   succeed.
3. **S3 — worker split**: add execution-only capability registration;
   `--child=worker` boots those capabilities plus `JobQueueWorker`; web stops
   starting the worker; parent starts worker only after web readiness; worker
   exit or startup timeout triggers budgeted backoff respawn. Exhausted budget
   pauses worker supervision without stopping web.
4. **S4 — stuck-worker detection**: IPC heartbeat; kill-and-respawn after 3
   missed beats, charged to the same rolling budget.
5. **S5 — health semantics**: add `degraded` health details and
   `/health/operate`; prove `/health/ready` remains 200 for worker-only failure
   while operational readiness returns 503.
6. **S6 — container verification**: manual staging soak — hang the worker with
   a test handler and assert `/health/live`, `/health/ready`, and static serving
   stay up while the worker respawns and the queue drains; exhaust the worker
   budget and prove web stays up; SIGTERM the container and assert clean child
   shutdown with zero zombies.

### Acceptance criteria

1. A hung worker child leaves web serving untouched; the worker respawns and
   the queue resumes, with lease fencing preventing duplicate completion.
2. A crash-looping worker exhausts its budget without stopping web; supervision
   retries only when the rolling window permits another attempt,
   `/health/operate` remains 503 meanwhile, and the pause emits a structured
   incident log.
3. The worker never claims a job before the web child sends `runtime-ready`,
   and the web child reaches `runtime-ready` with no worker process present.
4. Worker execution-only boot registers no interfaces, ingress subscriptions,
   daemons, tools, or plugin ready hooks, and every full-preset job handler
   passes the execution-boundary dependency audit.
5. `SIGTERM` stops both children cleanly: worker sessions ended, no zombies,
   exit within the grace period.
6. No new environment variables, packages, images, containers, or coordination
   files.
7. `/health/ready` reports worker degradation without failing routing;
   `/health/operate` fails for worker degradation; web-critical database
   inaccessibility still makes `/health/ready` return 503.
