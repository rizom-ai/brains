# Projection Scheduling and Runtime Resilience Plan

## Status

Implementation is in progress on `work/projection-runtime-resilience`.

The incident-hardening work and scheduler-only projection cutover are implemented. Durable wave execution, framework-owned output indexing, and wave-end site-build admission are active; same-bundle process supervision remains in progress.

This plan keeps the existing packaging and deployment shape and makes a clean
runtime cutover. There is one derivation-rule contract and one scheduler-owned
execution path. `DerivedEntityProjection`, event-owned scheduling, execution
owner modes, and compatibility bridges are removed rather than retained beside
the scheduler.

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
Entity and semantic events never register or connect derivation rules. Events
remain observer notifications only. This plan does not introduce a second
projection-ingress abstraction, source outbox, importer, source adapter, or
non-entity dirty-input kind.

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

1. `ProjectionRule` is the only plugin derivation registration contract.
   `DerivedEntityProjection` and execution-owner modes do not exist.
2. A rule is scheduled by the wave scheduler, never by another rule's event.
3. Each reachable rule has at most one job per wave.
4. The projection graph is acyclic. Startup rejects every cycle.
5. A rule fingerprints the exact immutable input object passed to its derive
   function.
6. An unchanged fingerprint performs no model call.
7. The framework applies rule writes idempotently and reports which targets
   actually changed.
8. Only changed targets make downstream rules reachable.
9. New ingress during an active wave remains pending for a successor wave.
10. A successful wave makes one site-build decision; an unchanged site
    fingerprint performs no render.
11. Job attempts, leases, retries, sessions, and deadlines remain owned only by
    the existing job queue.

## Rule contract

Projection rules remain private plugin capabilities collected by
`PluginManager`. Registering a rule creates its graph declaration; plugins do
not separately configure a declaration, event handler, job type, initial-sync
handler, or execution owner. Rules are not exposed through broad `IShell` or
plugin-context mutation APIs.

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
content/version, plugin configuration, identity inputs, and model configuration.

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

Pending ingress is an append-only entity revision journal:

```text
(generation, sourceType, sourceId, revision, operation, markedAt)
```

Each input identifies an entity type and ID. Its revision covers the persisted
content, metadata, and visibility; `operation` is `upsert` or `delete`, with
deletes represented as tombstones. There is no non-entity input kind, synthetic
rule input, manual invalidation path, or conversation outbox/importer bridge.

The entity-service create, update, or delete transaction also inserts the
journal row atomically. Each insert receives a database-owned, monotonic
generation; marking dirty never rewrites an earlier generation or uses
conflict-update SQL. Claiming coalesces rows through its generation cutoff to
the latest revision per `(sourceType, sourceId)`, then removes all journal rows
through that cutoff. A newer mutation has a greater generation and cannot be
cleared accidentally.

### Wave records and claimed inputs

A wave header records:

```text
(id, cutoffGeneration, graphFingerprint, status, startedAt, completedAt)
```

The claim transaction copies each coalesced latest dirty revision into a
wave-input record before removing the covered journal generations:

```text
(waveId, sourceType, sourceId, revision, operation, generation)
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

### Entity-database connection roles

Transactional ingress exposed a driver constraint: `@libsql/client`'s sqlite3
flavor discards its connection on every `transaction()` call and lazily opens
a fresh one for later statements (verified against the vendored client;
`sqlite3.js` sets `#db = null` inside `transaction()`). Any connection-local
state on that client — the `ATTACH ... AS emb` used by vector search, and
`busy_timeout` — silently dies with the first mutation. This was latent
before because no entity-client code path used interactive transactions; the
atomic journal transaction makes every create/update/delete trigger it, so one
mutation permanently severs search from the embedding database in production
as well as tests (`no such table: emb.embeddings`).

Decision: split entity-database access by connection role.

- A **mutation client** owns every transaction (`withDirtyInput`, wave claim,
  rule-result application, wave failure). It never carries ATTACH and expects
  nothing connection-local to survive.
- A **search client** — a second client on the same file, created with the
  service — owns the embedding ATTACH and serves every query that joins
  `emb.*`. It never calls `transaction()`, enforced structurally: search code
  receives a read-only type with no transaction affordance, so regression is
  a compile error, not a convention. WAL (persistent in the file) makes the
  concurrent reader and writer safe.

Database-dependent operations gate on the initialization promise internally
(`await` at entry — search and mutations are already async) instead of
trusting callers to await `initialize()` first; sleeps, retries, and other
timing workarounds stay prohibited. Embeddings remain in their separate
rebuildable database; moving them into the entity database or replacing the
driver are rejected — the placement rule stands, and the vector functions
(`vector32`, `vector_distance_cos`) are libsql extensions.

Required regression test: create one entity (forcing a transaction and the
connection replacement), then run a vector search joining `emb.embeddings`
and assert it succeeds. The paired `SQLITE_BUSY: cannot commit transaction -
SQL statements in progress` failures sit in the same init-race /
connection-churn family this split removes; if any survive the split plus
init gating, that is a distinct bug requiring its own diagnosis before
cutover is complete.

## Wave lifecycle

### 1. Mark dirty

External mutations—directory sync, user edits, API writes, and chat tools—append
a source revision in the same entity-service transaction as the mutation. The
entity service records ingress without knowing the projection graph; scheduler
reachability is evaluated only from the finalized `PluginManager` graph.
Existing entities enter the scheduler once through the upgrade migration
backfill. Startup hydration and persistence replay do not mark inputs dirty,
and rule/config changes do not create synthetic scheduler inputs.

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

`ProjectionRegistry`, populated only by `ProjectionRule` registration, is the
composition authority. It has no separate declaration API.

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

Causal lineage and runtime budgets remain defense-in-depth during the cutover
implementation, not support for a second execution path. They may be removed
after the scheduler-only runtime passes the full-preset soak.

## Clean cutover strategy

There is no mixed-mode runtime and no disconnected-component compatibility
exception. The branch may contain incomplete code while implementation is in
progress, but no mergeable state may register or execute both contracts.

### Stage 0: one canonical contract

- `ProjectionRule` is the only derivation registration capability.
- Registering a rule creates its graph declaration; separate projection
  declarations are removed.
- Delete execution-owner fields, defaults, validation, and tests.
- Delete `DerivedEntityProjection`, its controllers, initial-sync configuration,
  source-change job configuration, and event subscription machinery.
- Remove the registry's dead feedback surface: cycles are rejected
  unconditionally, so `feedback` declarations and `declaredCycles` are removed.
- Keep narrow input/execution contexts, canonical write intents, framework-owned
  fingerprints, entity-database memo storage, and persisted crash circuits.

### Stage 1: convert every derivation before activation

Inventory the complete preset and convert every derivation to the canonical
rule contract, including:

- topics;
- skills;
- SWOT;
- series;
- conversation-memory summaries, or disable their automatic producer until a canonical entity-backed source is approved;
- social-post auto-generation from queued posts;
- every preset-specific derivation discovered by the finalized registry.

Newsletter generation and explicitly scheduled social-post generation are
command workflows, not convergent derivations. Remove their projection
declarations and projection job metadata; retain them as ordinary explicit
generation jobs outside the derivation graph.

Each conversion replaces handler-owned mutation with immutable input selection
and canonical write intents. Topic-to-skill and skill-to-SWOT dependencies come
from entity source/target graph edges, never semantic completion events.
Upgrade bootstrap is a one-time migration backfill of existing entity revisions into the ordinary entity dirty journal, not an `initialSync` event handler or a non-entity invalidation kind.

Conversation messages remain outside the entity database. The automatic conversation-memory producer is therefore disabled; existing memory readers, context providers, datasources, templates, and evaluation utilities remain available. Re-enabling production requires a separately approved canonical entity-backed source model, not an outbox, importer, event bridge, or cross-database ingress service.

The activated runtime inventory proves that every registered derivation uses `ProjectionRule` and no derivation subscribes to an event or uses a legacy projection job type. Ordinary command and observer subscriptions that do not register, enqueue, or identify projection work remain outside this constraint.

### Stage 2: activate the scheduler-only runtime

- Atomically append every external entity mutation to the entity-database dirty
  journal; the entity service has no graph or rule-selector knowledge.
- Claim waves, select reachable rules from the one finalized graph, and enqueue
  one job per reachable rule.
- Register the one framework rule job handler and reconcile active wave job IDs
  after restart.
- Fail stale-graph or retry-exhausted waves and requeue their claimed ingress.
- Prove arbitrary N source revisions create one job per reachable rule.

### Stage 3: wave-end effects

- Wave-owned writes never re-enter mutation ingress.
- Enqueue embeddings for changed targets at successful wave completion.
- Remove automatic mutation-event site rebuild triggers.
- Request one site build after successful wave completion while retaining
  immediate explicitly requested builds and the site-input fingerprint.

### Stage 4: remove temporary choreography guards

After the scheduler-only full-preset soak:

- remove projection lineage/depth enforcement;
- remove per-root projection job/mutation budgets;
- keep persisted crash circuits, queue fencing, health diagnostics, and the
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
- the finalized registry contains only executable `ProjectionRule` entries and
  no event-driven derivation registrations.

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
9. The full preset registers only `ProjectionRule`; `DerivedEntityProjection`,
   projection execution owners, projection event subscriptions, and legacy
   projection job types have no definitions or callers.
10. No projection-ingress service, non-entity dirty-input kind, source outbox,
    importer, selector mirror, or compatibility bridge is introduced.
11. Existing job deadlines, leases, fencing, circuits, health checks, Git child
    lifecycle, and JSON site boundary continue to pass.
12. The implementation remains inside the existing single Bun package and does
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
  the scheduler-only derivation cutover. It loads entity schemas/adapters, narrow
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

Implementation status: S0–S3 are complete. S4–S6 remain in progress.

Each phase lands with deterministic tests; fake clocks and scripted child
promises replace sleep-based synchronization. The tree stays green after every
phase.

0. **S0 — execution-boundary prerequisites**: job progress is persisted in the
   shared queue and published by a bounded, indexed reader instead of relying
   on the worker's in-process message bus. Internal subscriptions required by
   durable execution are explicitly marked `subscribeExecution`; ordinary
   ingress subscriptions remain distinct. During S3, immutable execution
   capability registration must be introduced first, then used to derive the
   exact full-preset dependency inventory and execution-only boot gate. A
   hand-maintained manifest is prohibited. The worker split remains blocked
   until that derived gate proves every handler can be constructed without
   interfaces, ordinary ingress subscriptions, daemons, tools, or ready hooks.
1. **S1 — supervisor skeleton**: parent spawns a single `--child=web` process;
   the unchanged web child still owns migrations in this phase. Add signal
   forwarding, reaping, and exit-code propagation with externally identical
   behavior.
2. **S2 — parent boot ownership**: extract migration execution to the parent,
   add the internal child "migrations completed" contract, add the bounded web
   `runtime-ready` IPC handshake, and prove no child starts before migrations
   succeed.
3. **S3 — worker split**: complete. Immutable job registrations now derive the
   full-preset execution inventory; `--child=worker` boots execution
   dependencies plus `JobQueueWorker` without interfaces, ordinary ingress,
   daemons, tools, or ready hooks. Web retains validation and enqueue ownership
   but does not start a worker. The parent starts the worker after web readiness,
   applies bounded exponential respawn for exits and startup timeouts, and
   pauses only worker supervision when the rolling budget is exhausted.
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
