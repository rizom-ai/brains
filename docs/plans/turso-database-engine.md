# Plan: Turso Database engine migration

## Status

In progress. The engine spike is done on `work/turso-spike` (commits
`23d7d468d`, `d02c4c0cd`): `@brains/db` has a `createTursoClient` adapter that
presents the libSQL `Client` surface over `@tursodatabase/database@0.7.2`, and
`createSqliteDatabase` selects it for `file:` urls when `BRAINS_DB_ENGINE=turso`.

Phases 1 through 3 are implemented in `work/turso-migration`: Turso native FTS
is wired through an engine-aware seam, the remaining service differences are
closed, packed installs carry the native binding, and local files default to
Turso with a tested explicit fallback. Phase 4's live sync spike is complete,
and the owner selected Git-only content sync. Phases 5A through 5C make the web
process the sole local shell database owner under WAL and fold regenerated
embeddings into `brain.db`. The affected service suites pass on both engines.
Review uncovered that Turso's persisted native-FTS schema syntax is not
parseable by libSQL. The chosen mitigation is an explicit, tested break-glass
command: `brain-rollback-entities-to-libsql`.

Phase 5D is blocked by an engine limitation: Turso custom index modules,
including native FTS, are unsupported in MVCC mode. The owner chose to retain
WAL and native FTS rather than replace indexed keyword search with a table scan.
Phase 5E remains open.

This plan originally asked whether the rewrite is worth adopting at all. The
spike answered that: yes — phased, with libSQL retained as a fallback. Phase 1
then showed that native-FTS cleanup must accompany the engine flag, and Phase 4
closed the strategic sync fork in favor of Git-only content sync. Phase 5
preflight exposed a separate runtime-topology constraint: Turso rejects MVCC
while `multiprocess_wal` is enabled, but the web and worker processes both
opened the same local database files. The owner selected the web process as the
sole local database owner and a private local endpoint for worker traffic.
That boundary is now enforced and proved under WAL. The subsequent MVCC spike
exposed the independent native-FTS blocker recorded in Phase 5D.

## Spike findings (measured, not assumed)

Engine: `@tursodatabase/database` 0.7.2. Suites run with `BRAINS_DB_ENGINE=turso`:

- **Works unchanged:** vector search (`F32_BLOB`, `vector32`,
  `vector_distance_cos`, including the cross-DB `ATTACH` join used by
  `entity-search.ts`, behind the SDK's `attach` experimental flag).
  `PRAGMA journal_mode = mvcc` and `BEGIN CONCURRENT` work without
  `multiprocess_wal`; multi-process file access works behind `multiprocess_wal`
  and writes gitignored `*.db-tshm` sidecars. These modes are mutually
  exclusive: with `multiprocess_wal` enabled, the engine rejects MVCC because
  MVCC does not support multiprocess access.
- **Suite results:** shared/db 24/24 on both engines; runtime-state 10/10;
  job-queue 194/195; conversation-service 34/35; entity-service 188/325.
- **FTS5 does not exist on Turso** — every original entity-service failure was
  the single error `no such module: fts5`. Turso replaces FTS5 with a native
  Tantivy-based engine: `CREATE INDEX … USING fts (cols)` behind the
  `index_method` experimental flag. Queries use `content MATCH ?` against the
  indexed source table, not the index name or a virtual table. Quoted phrases
  also escape embedded quotes with backslashes rather than FTS5's doubled
  quotes. The index is transactional — no shadow-table sync is needed.
- **Native FTS breaks direct libSQL reopening until it is removed.** Its
  `sqlite_master` entries use the Turso-only `fts` and `backing_btree` index
  methods; libSQL reports `SQLITE_CORRUPT: malformed database schema`.
  Dropping `entities_content_fts` while the file is open in Turso removes the
  internal objects and makes it libSQL-readable again. Therefore
  the engine env var alone is not an instant fallback after Phase 1 creates the
  index. Existing FTS5 shadow tables also become stale while Turso is active
  and must be dropped before cutover or rebuilt on fallback.
- **Row-value cursor predicates don't seek.** `(runtimeUpdatedAt, id) > (?, ?)`
  plans as a full covering-index scan (the job-queue failure); plain
  `runtimeUpdatedAt >= ?` seeks correctly. The expanded-OR form is worse
  (multi-index OR + sorter).
- **`PRAGMA busy_timeout` is a no-op** (the conversation-service failure — its
  readiness test asserts the timeout value). Application retries remain
  necessary while Turso uses multiprocess WAL.
- **The SDK loads a NAPI native binding at import time.** It is dynamically
  imported and marked external in the app/CLI bundles so libsql-mode consumers
  never resolve it. The packed consumer's nested install did not materialize
  the platform-specific optional dependency — shipping turso-by-default in the
  packed CLI needed that story verified. Phase 3 resolved it by declaring the
  SDK as a direct optional dependency of `@rizom/brain`; the packed-consumer
  test now starts under Turso, runs the shipped rollback command, and restarts
  under libSQL.
- **drizzle-orm 0.45.2 ships no turso driver** (contrary to this plan's earlier
  claim). The adapter therefore implements the libSQL `Client` contract that
  `drizzle-orm/libsql` already speaks — hybrid rows (non-enumerable indices +
  `length`, enumerable named columns), `batch`/`migrate`/`transaction`,
  `CLIENT_CLOSED` on use-after-close. This also means zero per-service swap
  work: the flag covers every service through `createSqliteDatabase`.
- **The libsql vector index was dead weight** on both engines — created on
  every embedding insert, never queried (nothing issues `vector_top_k`).
  Removed in `23d7d468d`, independent of the migration.
- **Phase 5D MVCC/FTS incompatibility:** with `multiprocess_wal` removed,
  MVCC, `BEGIN CONCURRENT`, disjoint concurrent writes, and MVCC-to-WAL
  conversion all work. Native FTS does not: both released
  `@tursodatabase/database@0.7.2` and `0.8.0-pre.3` reject
  `CREATE INDEX … USING fts` because custom index modules are unsupported in
  MVCC mode. The Turso entity suite reached 183/327, with all 144 failures
  rooted in that error. Creating native FTS under WAL and then converting the
  file to MVCC instead triggered a Turso `root_page must be positive` panic.
- **Not covered:** auth-service's embedded replica (`runtime-db.ts` constructs
  its own `@libsql/client` with `syncUrl`; it syncs against Turso Cloud and
  stays on libSQL throughout this plan). Phase 3 separately resolved the
  pre-existing `libsql_vector_idx` schema gap with a libSQL cleanup before
  Turso opens historical entity and embedding files.

## Context (unchanged)

Every shell service builds its DB through `createSqliteDatabase` in
`shared/db` over a local `file:` SQLite DB. "libSQL" is Turso's fork of
SQLite, now in maintenance; "Turso Database" is the clean-room Rust rewrite
where development happens. Git remains the content sync layer; the entity DB
is a derived index. A brain is one shared store with per-entity visibility —
multi-user exerts no pressure on DB layout.

## Design

Thin vertical slices. The engine flag remains the runtime selector, but the
Phase 1 review disproved the assumption that it is sufficient by itself for
rollback: native FTS persists engine-specific schema. Rollback is deliberately
a break-glass operation, not an automatic startup path: stop the app, run
`brain-rollback-entities-to-libsql`, set `BRAINS_DB_ENGINE=libsql`, and restart.
Tests precede implementation in each phase.

### Phase 0 — Engine adapter behind a flag — DONE (spike)

`createTursoClient` + `BRAINS_DB_ENGINE=turso` selection in
`createSqliteDatabase`; adapter test suite; dead vector index removed;
bundler externals + dynamic import; `*.db-tshm` gitignored. Landed on
`work/turso-spike`.

### Phase 1 — FTS port to Turso native FTS — DONE

The one real port, and the walking skeleton for production parity.

- Existing search suites pass on both engines; an explicit parity test verifies
  the same keyword-boost decisions.
- `SqliteConnection` reports its selected engine. The entity-service seam keeps
  the FTS5 virtual table on libSQL and creates
  `entities_content_fts ON entities USING fts (content)` on Turso, with the
  adapter's `index_method` flag enabled.
- The keyword subquery is engine-specific: FTS5 queries `entity_fts MATCH`;
  Turso queries `fts_entities.content MATCH` against the source table and uses
  Tantivy-compatible phrase escaping.
- FTS5 shadow-row writes are skipped on Turso because the native index tracks
  entity transactions directly.

**Exit met:** entity-service 328/328 under `BRAINS_DB_ENGINE=turso` and
328/328 on libSQL. The explicit rollback command removes native FTS through
Turso, checkpoints the schema change, then recreates and backfills the libSQL
FTS5 table; its file round-trip test passes.

### Phase 2 — Close the small diffs — DONE

- The job-queue durable cursor pages with two bounded covering-index seeks —
  ties at the cursor timestamp by `id`, then rows beyond it — after review
  found the first rewrite fetched unbounded rows. Both engines report
  `SEARCH … USING INDEX` for both query shapes.
- Conversation-service readiness is engine-aware: libSQL still verifies the
  echoed busy timeout, while Turso verifies that the pragma is accepted and a
  write waits for a contending process to commit.

**Exit met:** job-queue has 196 passing tests plus one intentional remote-only
skip, and conversation-service is 35/35 on both engines.

### Phase 3 — Default flip with fallback — DONE

- `@rizom/brain` directly declares the Turso SDK as an optional dependency, so
  packed installs materialize the platform native binding. The packed-consumer
  test starts in Turso mode outside the monorepo.
- Before Turso opens existing local files, the entity migration uses libSQL to
  remove the dead `embeddings_embedding_idx` from both historical entity DBs
  and current embedding DBs, and removes the stale FTS5 shadow table. A
  populated WAL-mode cutover test preserves entity and embedding data.
- The explicit fallback command is shipped by `@rizom/brain` and covered by a
  production-shaped migration round trip. It drops `entities_content_fts`
  through Turso before libSQL opens the file, then recreates and backfills the
  FTS5 shadow table from `entities`.
- Local `file:` urls now default to Turso; remote URLs remain on libSQL and
  `BRAINS_DB_ENGINE=libsql` selects the local fallback. WAL keeps the base file
  SQLite-compatible, while the explicit cleanup handles engine-specific FTS.

**Exit met:** packed startup succeeds under Turso, the shipped rollback command
prepares the same database for a packed libSQL restart, and no one-env-var or
automatic rollback promise remains.

### Phase 4 — Sync-model spike — DONE: owner selected Git-only

Live probes used `@tursodatabase/sync@0.7.2`,
`@tursodatabase/sync-wasm@0.7.2`, and temporary Turso Cloud databases:

- Two Node clients completed bidirectional `push()`/`pull()` through Turso
  Cloud. A separate local embedding database remained absent from the remote.
- A Chromium browser under the required COOP/COEP headers opened only the
  synced entity database, pulled both Node mutations, pushed a browser
  mutation, and a Node client pulled that mutation back.
- This proves the transport, but not a viable Brain topology. The sync package
  manages its own database file family and did not adopt the existing
  standalone production file as an in-place toggle. Replaying the full entity
  migration history into an empty remote also failed on transient projection
  DDL ordering.
- The current Turso Cloud SQL endpoint rejected the native FTS
  schema (`CREATE INDEX … USING fts`) near `USING`, so the production entity
  schema cannot sync unchanged.
- Direct browser writes would bypass the entity service's permission checks,
  visibility scoping, mutation events, projection admission, embedding jobs,
  markdown export, and Git commit chain. A database token would also expose
  the shared store rather than the caller's visibility slice. A read-only
  replica adds a second distribution path without replacing Git's durable,
  reviewable markdown history.

**Owner decision:** retain Git as the only content sync model and keep CMS
reads and writes behind the entity service. No sync SDK dependency or
production path is added. Folding the regenerable embedding table into the
entity database is now available in Phase 5.

### Phase 5 — One local database owner, then layout and MVCC

Phase 5 preflight measured a hard engine constraint. The Turso adapter enables
`multiprocess_wal` because the supervised web and worker processes both open
the local service databases. With that flag active, Turso rejects
`PRAGMA journal_mode = mvcc` with `MVCC does not support multiprocess access`.
Removing the flag without first removing direct cross-process file access is
not an acceptable implementation.

#### Phase 5A — Prove the web owner's private endpoint under WAL

**Owner decision: the web process owns the local databases**; the worker routes
durable persistence calls to it. The interactive path and directory imports
already run in web, so this keeps their database access local and preserves the
current two-child supervisor plus worker-after-web startup order. A separate
state process would isolate database lifetime, but would add a third child and
put both web and worker traffic over IPC.

Do not assume worker traffic is small or insensitive to latency. The worker
constructs every executable job handler; generation, projection, publishing,
queue lease/progress, conversation, runtime-state, and embedding paths all use
persistent services. Capture a direct-database baseline and exercise those
flows through the proposed boundary before removing any worker connection.

A temporary transport spike ran nine interleaved trials against real Turso
job-queue repository operations. Parent relay and a private local socket were
both comfortably above the expected request rate and neither dominated normal
database calls: median sequential throughput was 1,291 versus 1,377 requests
per second, while 32-request concurrency was 1,628 versus 1,474. Parent relay
serialized 256 KiB and 5 MiB payloads faster in the prototype, but payload
throughput is not the deciding requirement.

**Owner decision: use a private web-owned local endpoint.** Phase 5 eventually
moves all worker persistence, so database traffic must not share the parent's
heartbeat and restart-control channel. The rejected parent relay has less
endpoint setup, but permanently turns the supervisor into a data broker and
couples persistence backpressure to process health.

Keep WAL while proving the endpoint with a representative job-queue slice:

- Use OS-local IPC only: a Unix-domain socket on Unix and the equivalent named
  pipe abstraction where supported, never a TCP listener.
- The parent creates a per-runtime endpoint name and capability secret and
  passes them only to its children. Web owns listen/cleanup; filesystem
  permissions or platform ACLs restrict the endpoint to the runtime user.
- Web reports runtime readiness only after the endpoint is listening. A worker
  performs a versioned, authenticated handshake before queue startup.
- Use length-prefixed, size-bounded frames rather than newline-delimited JSON.
  Validate every decoded envelope before dispatch and define an explicit binary
  representation for embeddings and other typed-array payloads.
- Closing the endpoint rejects every pending request. Worker reconnect is
  allowed only for a newly supervised worker session; requests and responses
  carry that session identity so stale replies cannot cross restarts.

For the endpoint boundary:

- Inventory each service contract before implementation. Preserve external
  plugin APIs and their Promise-based operation surfaces, but split internal
  process-local control from remote durable operations where the current
  interface carries functions, concrete classes, or synchronous registry state.
- Define package-owned, Zod-validated request/response envelopes. Do not expose
  SQL or Drizzle, and do not send callbacks, handlers, class instances, or
  `AbortSignal` objects over IPC. Represent cancellation with request IDs and
  explicit cancel messages.
- Propagate operation-context snapshots, request identity, typed failures, and
  cancellation. Bound queues and in-flight requests with explicit limits and
  timeouts.
- Keep owner request handlers leaf-shaped with respect to IPC: they may call
  owner-local services and databases but must never issue a synchronous request
  back to the worker handling the original call.
- Preserve current supervisor semantics and keep heartbeats on parent-child
  IPC. A worker restart establishes a fresh endpoint session with the surviving
  web owner. A web/owner exit closes the endpoint, rejects in-flight requests,
  terminates the worker, and exits the parent; Phase 5 does not add web-child
  restart.
- Parent-owned migrations still run once before web starts. Auth-service's
  embedded replica remains outside this change.

The contract inventory fixes the process split before later services move:

| Service       | Remains process-local                                                                                                                     | Safe durable boundary                                                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Job queue     | Handler and validator registries, executable handlers, worker lifecycle, batch coordination, and progress event behavior                  | Enqueue, typed claims, worker sessions, attempt leases/progress, terminal writes, status, diagnostics, cursors, and cleanup      |
| Entities      | Entity registry, adapters and schemas, Markdown serialization, interceptors, validators, upload handlers, and projection wakeup callbacks | CRUD, list/search/count, semantic and embedding operations, index readiness, and a future narrow async projection-store contract |
| Conversations | Message-bus subscriptions and event delivery policy                                                                                       | Start, message and metadata writes, reads, search, and delete; the owner must emit each durable event exactly once               |
| Runtime state | `scoped()` schema validation and the returned facade                                                                                      | The scoped store's async get/set/list/delete/clear operations, with dates encoded explicitly                                     |

`ProjectionStore`, schemas, handlers, callbacks, scoped stores, and concrete
service instances are therefore not endpoint payloads.

Phase 5A now implements the representative job-queue slice. The supervisor
creates one endpoint and secret, gives every child a fresh process session,
and keeps heartbeat traffic on parent IPC. The web child listens before
readiness; the worker authenticates before database readiness and constructs a
remote queue service without calling `createJobQueueDatabase()`. Package-owned
Zod envelopes cover every durable queue operation while execution registries
stay local. Operation provenance is restored in the web owner before dispatch.

Coverage now includes authentication and version rejection, fragmented and
oversized frames, explicit typed-array encoding, class-instance rejection,
bounded admission, cancellation, request deadlines, owner process loss,
stale-session isolation, socket cleanup, worker session rotation, terminal
owner shutdown, and a full web/worker queue claim-complete round trip.
The remote-service test also asserts that its configured worker database file
is never created. Both Turso and libSQL job-queue suites pass with 198 tests and
one existing remote-contract skip; the Turso path remains in WAL for this
phase. The earlier nine-trial throughput measurements remain the transport
baseline because the implemented endpoint uses the selected private-socket
shape and the parent never brokers its traffic.

**Phase 5A exit: met.** The representative slice passes without a worker-side
job database handle; measured latency/throughput remains recorded; transport
saturation cannot delay the parent heartbeat watchdog.

#### Phase 5B — Route all local shell persistence through the web owner

Build hybrid process facades rather than pretending every existing service is
serializable:

- **Job queue:** handler and validator registration stays local to each process;
  the worker routes durable queue operations to the web-owned repository.
- **Entities:** entity registry, adapters, serialization, and synchronous type
  metadata stay process-local. Async persistence/search runs in web. Replace the
  worker's concrete `ProjectionStore` dependency with a narrow async contract
  whose operations are safe to proxy.
- **Conversations:** keep process-local message-bus behavior explicit while web
  owns conversation persistence; test that events are emitted in the intended
  process exactly once.
- **Runtime state:** `scoped()` returns a local store facade whose async reads,
  writes, and deletes use the selected transport.

Preserve process roles: web validates enqueue requests and owns interfaces;
worker owns executable handlers and durable execution. Verify entity events,
projection lineage, generation and projection bursts, queue heartbeats and
progress, embedding backfill, directory import, visibility, conversation
updates, runtime-state access, and health reports across the boundary. Compare
these flows with the recorded direct-database baseline; do not describe worker
traffic as low-rate or batchable without measurements.

Add a packed-runtime invariant test that fails if the worker opens a local
SQLite file. Cover worker crash/restart, transport interruption, request
timeouts, web-owner shutdown, and terminal parent shutdown after owner loss.
Keep WAL and `multiprocess_wal` until every local shell database has exactly one
process owner.

Phase 5B now implements package-owned, Zod-validated RPC contracts for entity,
projection, conversation, and runtime-state persistence. Worker entity
registries, adapters, serializers, validators, embedding execution handler,
and projection execution handler remain local. The projection facade exposes
only async durable operations; `withDirtyInput()` and database transactions
remain owner-internal. Runtime-state schemas and scoped facades stay in the
worker, while records encode dates as integer milliseconds. Conversation and
entity mutations dispatch through owner-local services, so their durable
message-bus events are emitted once in web rather than duplicated in worker.

The socket-backed web/worker integration configures nonexistent worker paths
for all five shell files (entity, embedding, conversation, job queue, and
runtime state), exercises queue execution, entity CRUD, a 1,536-dimension
embedding frame, conversation writes, and scoped runtime state, and verifies
that none of those worker paths appears. The supervisor also fences every
worker with `BRAINS_FORBID_LOCAL_DATABASE_OPEN=1`; the shared database factory
rejects any `file:` open in that process. The packed-consumer test proves the
shipped bundle contains and enforces that fence, while supervisor coverage
proves fresh and restarted workers receive it and web explicitly does not.
Remote libSQL remains allowed, and auth-service remains outside the fence.

A seven-trial interleaved WAL experiment compared direct web calls with the
socket facade. Each trial performed 100 runtime-state writes, 51 conversation
writes, 50 projection-journal writes, and 20 entity creates. Median completion
was 662 ms direct and 614 ms remote (0.93x); the result is parity, not a claim
that IPC improves database work. The experiment is recorded in
`/tmp/brains-phase5b-owner-load.ts`; correctness tests use acknowledgements and
settled promises rather than timing thresholds.

Both engines pass entity-service 332/332, conversation-service 38/38, and
runtime-state 13/13. Core passes 432/432 on both engines, including endpoint
failure, restart, shutdown, visibility, projection, health, and lifecycle
coverage. WAL and `multiprocess_wal` remain unchanged.

**Phase 5B exit: met.** Behavior and bounded-load results are at parity, while
the web process is the only process permitted to open local shell database
files.

#### Phase 5C — Fold embeddings into the entity database

Existing vectors are regenerated rather than copied. The legacy rows contain a
content hash but no model, model version, or provider-dimension provenance, so
copying them could make the active provider query incompatible vectors. The
migration preserves entities, replaces `embeddings` with an empty local table,
and lets the existing startup backfill enqueue every embeddable entity. The old
`embeddings.db` file is left untouched as a recovery artifact but is never
opened by the runtime.

The generated Drizzle migration gives `embeddings` a composite foreign key to
`entities` with cascade delete. Entity updates and projection writes invalidate
changed-content vectors in their entity transaction; entity deletes remove the
vector in that same transaction. Embedding writes validate the active provider
dimensions and conditionally commit only while the entity content hash still
matches, closing the generation/write race.

Search now joins the local table directly. The separate embedding connection,
raw embedding migrator, `ATTACH` plumbing, embedding database config, packed and
evaluation artifact handling, and Turso SDK `attach` flag are removed. Eval
artifacts now checkpoint and copy one `brain.db`. Turso's client adapter also
holds top-level operations behind an interactive transaction so concurrent
owner requests cannot leak into that transaction on its single connection.

Coverage proves populated pre-cutover rows are cleared while entities survive,
a failed table rebuild leaves the old table intact, provider-dimension
validation, stale-write rejection, atomic invalidation, cascade and orphan
behavior, rollback preservation, direct vector/FTS search, worker-owned RPC
embedding writes, and absence of a legacy file. Entity-service passes 327/327
on both Turso and libSQL; shared DB passes 30/30 and core passes 432/432.

**Phase 5C exit: met.** Entities and embeddings use one owner, one connection,
and one database file, with no runtime configuration or dependency for the
legacy embedding file.

#### Phase 5D — Enable MVCC — BLOCKED

The single-owner prerequisite is met, but the implementation spike found that
Turso native FTS and MVCC cannot coexist. With `multiprocess_wal` removed, the
adapter successfully opened MVCC files, used `BEGIN CONCURRENT`, committed
disjoint writes from independent connections, surfaced write-write conflicts,
and converted MVCC files back to WAL without losing rows. Shared database tests
passed 35/35.

Entity initialization then failed because Turso rejects its custom FTS index in
MVCC mode. The released 0.7.2 SDK and the available 0.8.0 pre-release behave the
same. Pre-creating the index under WAL is not a workaround: converting that
file to MVCC panicked inside Turso. No MVCC code was retained after the spike.

**Owner decision:** retain WAL and native FTS. Do not replace native FTS with a
linear exact-phrase scan or add a separate WAL search database merely to enable
MVCC. The current owner also uses one Turso connection whose adapter serializes
top-level operations, so MVCC would not unlock runtime concurrency today.
Revisit this phase only when a released Turso SDK supports custom index modules
under MVCC; rerun migrations, native FTS, vectors, rollback, packed startup,
owner-topology, restart, and full dual-engine service coverage before cutover.

**Exit: blocked upstream.** Local shell databases remain in WAL and the existing
schema-cleanup libSQL rollback command remains valid.

#### Phase 5E — Entity/job atomicity decision gate

A single owner process does not by itself make separate entity and job files
transactional. Measure an owner-local outbox or a deliberate entity/job file
merge, then present the tradeoff to the owner. Do not remove compensation or
backfill behavior until that decision is explicit and the replacement has
failure-injection coverage.

**Exit:** the owner records the final entity/job topology; compensation for the
entity-write/enqueue gap is removed only if an atomic replacement is adopted.

## Non-goals

- No changes to auth-service's replica path — it stays on `@libsql/client`
  against Turso Cloud for the duration of this plan.
- No reliance on experimental page-level "partial sync" for embeddings
  exclusion — access-pattern lazy loading guarantees nothing on `push()`.
- No wholesale one-DB consolidation. Phase 5 folds only embeddings into the
  entity database; any entity/job merge remains a separate owner decision.

## Risks

- Turso's native FTS sits behind the `index_method` experimental flag and
  would be load-bearing from Phase 3 on. WAL keeps the file format compatible,
  but the native FTS schema is not libSQL-parseable; fallback requires the
  explicit cleanup command described in Design and Phase 3.
- The single-owner boundary adds IPC latency to substantial worker persistence
  traffic. The private endpoint also adds framing, authentication, discovery,
  and cleanup responsibilities. Baseline comparison, overload bounds, failure,
  restart, and shutdown behavior must be proved under WAL before changing the
  file format.
- MVCC currently cannot host Turso's native FTS custom index. If upstream adds
  support, conversion still requires the enforced owner topology plus a tested
  MVCC-to-WAL rollback path before it can ship.
