# Off-thread Turso persistence and binary transfers

## Status

Architecture gate for 0.3 remains **OPEN**. The approved isolated driver proof
is implemented under `shared/db/test/`; no runtime caller or production driver
has been replaced. The chunked asset-transfer work remains an uncommitted
functional prototype, not evidence that bulk work is isolated from the web
request loop.

The local protocol rehearsal transfers and persists 100 MiB through 1 MiB chunks
without raising the 16 MiB RPC frame limit. It also checks disconnection cleanup
and cross-connection upload isolation. These are correctness results, not a
responsiveness guarantee or document-entity cutover.

## Evidence from the installed SDK

Inspected `@tursodatabase/database` and `@tursodatabase/database-common`, both
version **0.7.2**:

- `database/dist/promise.js` constructs the native database and wraps it in the
  common Promise facade. It does not create a JavaScript worker thread.
- `database-common/dist/promise.js`, `Database.prepare`, calls native `prepare`
  synchronously once connected.
- `Statement.run/get/all/iterate` bind parameters on the calling thread and call
  native `stepSync`; row extraction is also a synchronous native call.
- `Database.exec` uses the same synchronous stepping model.
- The default `ioStep` is an async no-op. The source explicitly documents that
  Node/in-memory I/O is synchronous. Awaiting a resolved Promise is not an
  event-loop isolation boundary.
- `connectAsync` exists, but asynchronous connection establishment does not
  imply off-thread statement execution.

This establishes that the installed JS binding does not provide the required
nonblocking execution guarantee. It does not claim that every underlying native
or OS operation lacks internal concurrency.

Our own proportional work also remains on calling threads:

- `shared/assets/src/index.ts`: `prepareAsset` copies and hashes the entire
  payload; `assertPreparedAsset` hashes it again.
- `shell/entity-service/src/asset-transfers.ts`: upload allocation, assembly and
  final digest verification occur in the owner handler.
- `shell/entity-service/src/sqlite-asset-repository.ts`: staging copies the
  complete payload; duplicate verification and full reads materialize BLOBs.
- `shared/image/src/adapters/image-adapter.ts`: image construction calls
  `prepareAsset` again. Threading only the RPC handler would miss this path.
- `shell/core/src/local-database-endpoint.ts`: JSON/base64 framing runs in the
  caller. Chunking bounds individual work units, but does not offload them.

## Isolated driver proof

The proof lives in `shared/db/test/fixtures/turso-thread/`, with source tests in
`shared/db/test/turso-thread-proof.test.ts` and an opt-in packed-consumer runner
in `shared/db/test/turso-thread-packed.ts`. It is not exported by `@brains/db`.

### Contract exercised

- **Affinity:** one lifecycle-scoped worker per connection, inside the owning
  process. Only that worker imports and calls the native adapter. Its handshake
  identifies the actual spawned thread and process; each reply carries the same
  connection generation. No second connection or main-thread fallback exists.
- **Protocol:** Zod-validated execute/begin/finish/close commands, monotonic
  request IDs and generation-scoped transaction tokens. Leased statements are
  serialized; unleased work waits outside the active transaction. Finished or
  foreign tokens are rejected rather than interpreted as ordinary queries.
- **Admission:** at most 16 ordinary requests and 256 KiB of logical queued
  payload, with reserved finalization/close slots so a full queue cannot prevent
  the transaction holding it up from settling. Commands and results are capped
  at 64 KiB **for this proof only**, not as new runtime/asset limits.
- **Bytes:** caller buffers remain attached. The bounded input snapshot copies
  only a view's visible bytes, not its potentially huge or pooled backing store.
  Result buffers are copied into exact owned storage on the worker and transferred;
  the worker verifies that its buffers were detached. The separate resident-stage
  proof below does not yet replace the runtime producer/data path.
- **Shutdown/failure:** close fences new work, lets already-admitted transactions
  finish, waits for queued work, checkpoints, closes and then joins the worker.
  Owner loss rejects pending work with an explicit uncertain-outcome error; there
  is no mutation replay or automatic replacement thread.

The shared acceptance body checks named/positional bindings, hybrid rows, binary
ownership, commit/rollback isolation, admission during close and reopening an
exclusive copy of **only the checkpointed main file** in a new worker. A test-only
`SharedArrayBuffer`/`Atomics.wait` gate holds the persistence thread blocked while
an HTTP request is served on the main thread. This is synchronization evidence,
not a latency benchmark; there are no sleeps or timeout overrides.

### Packaging result and discovered requirement

The same acceptance body passes from a packed package installed outside the
monorepo, both as JavaScript and from a compiled Bun consumer. Neither consumer
installs libSQL. The worker is an **installed filesystem sidecar**, supplied by
explicit URL, alongside the SDK's normal native dependencies; this does not prove
an entirely self-contained executable or the actual brain/ops build integration.

On Bun **1.4.0**, the initial compiled consumer failed to locate the native addon
although it was installed and the JavaScript consumer passed. Compiled Bun disables
package.json autoloading by default. Building with
`--compile-autoload-package-json` allows the sidecar's SDK and addon package
metadata to resolve, and the full acceptance body then passes. This is specific
to the compiled consumer: the current brain and ops builds emit JavaScript bundles,
and Docker runs `brain.js` with Bun. That deployment path does not need the flag.
Any future standalone compiled distribution must deliberately retain this
requirement or prove another packaging strategy; it must not silently fall back
to inline execution.

Both consumer modes also pass the acceptance body when launched from an unrelated
working directory containing decoy package metadata, a worker, SDK/native packages
and a WASI fallback package. None of the decoy modules execute. Separate fresh-process
probes temporarily remove the installed worker or all installed native addon files:
both modes reject startup and leave their database directories empty. The fixture
restores the artifacts in `finally`; it only renames files in its private temporary
installation, never mutating Bun's hardlinked cache contents.

These checks establish working-directory independence and fail-closed missing-artifact
behavior for the tested layout. They are not artifact signature/version verification,
protection against a writable installation being modified, or canonical brain/ops
build acceptance.

Run from `shared/db`:

```sh
bun test test/turso-thread-proof.test.ts
bun run test:thread-proof:packed
```

### What this does not establish

This is a narrow execution-driver proof, not a complete `Client` replacement.
The actual `LibSQLSession`, bounded batches, public Drizzle migrator and nested
savepoints are now exercised below, not full driver parity. Five-database runtime
wiring, compiled brain/ops distribution and offline helpers remain integration
work. The transaction proof covers structured leases, not caller-issued raw
transaction control SQL. Inputs are trusted internal driver commands, not a public
SQL RPC.

The message bounds do not bound SQLite's own query working memory: the existing
adapter still materializes results on the worker before enforcing the result
message limit. Production result paging and binary capabilities need their own
contract. Runtime upload assembly, hashing and producer/reader processing are unchanged.
Worker termination coverage is not native-crash fault containment: a native abort
can still stop the entire owner process, and uncertain-commit recovery remains an
operational acceptance gate. No canonical brain boot or production instance was
used for this proof.

## Staged-binary contract — isolated lifecycle slice implemented

The full contract below remains the target before replacing runtime callers. The
first lifecycle/binding slice is now executable under `shared/db/test/`; there are
still no production exports or runtime callers. The persistence driver stays
generic: asset references, image inspection, entity registration, projection policy
and outbox orchestration do not move into it.

### Current executable slice and limits

`binary-protocol.ts`, `staged-binaries.ts` and `binary-client.ts` in the thread-proof
fixture implement scope creation/revocation, bounded append, worker-side incremental
SHA-256/sealing, mutation claims and explicit resident SQL arguments. All claims
are validated together and pinned **before** waiting for the native transaction;
commit/rollback invalidates them. Unclaimed scope resources are released on closure;
admitted claims remain charged until explicitly released or their transaction
settles. Cleanup has its own bounded lane, separate from transaction finalization,
so saturated ordinary requests cannot prevent either resource cleanup or commit.

`binary-transaction.ts` now uses the actual **`LibSQLSession`**, replacing the
SQLite-proxy experiment. Its public session/transaction constructors, `.toSQL()`
and `Placeholder` objects establish ordinary and resident execution on one native
lease. No private ORM fields, ambient transaction state, fake buffers or second
connection are involved. Missing/unused maps and escaped contexts are rejected.

The factory creates guarded nested facades through Drizzle's own savepoint
implementation. Both `context.transaction()` and ordinary `context.db.transaction()`
use it. Parent work is suspended while a child runs; overlapping siblings reject
instead of sharing savepoint names. Closed child contexts and retained ORM facades
reject even while the outer lease remains live. An admitted child callback drains
before outer finalization. Mutation claims stay pinned to the **root** lease,
including across inner rollback, and are released only at outer completion.
This is still a test-only factory, not wiring into `ProjectionStore.withDirtyInput`.

`libsql-client.ts` supplies the typed `Client`/`Transaction` surface using only
libSQL **type** imports. Native batch/script/migration execution stays in the
worker. The narrow proof allows at most 16 statements per batch and bounds the
aggregate reply, not just individual results. A post-execution encoding failure is
`RESULT_UNAVAILABLE`: changes may already have committed, so it is not evidence
of rollback and must not trigger replay. Void close joins the observable async
close path, including through the existing public `closeSqliteClient()` helper.

`orm-exercise.ts` exercises real insert/returning and BLOB/boolean/date mapping,
prepared placeholders, relational queries, Drizzle batch mapping, nested rollback
and the public Drizzle migrator (including idempotent rerun). The same exercise
passes source, externally installed JavaScript and compiled Bun consumers and
verifies the resulting rows after main-file-only restore. No libSQL runtime is
installed in those packed consumers.

`libsql-session-proof.test.ts` additionally covers script parsing/partial failure,
transaction-local batch failure, foreign-key restoration after ordinary migration
success/failure, admission/result limits, async close, escaped nested facades,
parent suspension, sibling rejection and child drain before outer rollback.

`ownership.ts` now adds a separate worker-owned admission gate. The existing native
adapter releases its own queue after failed finalization, so merely catching that
failure outside the adapter is too late: another queued operation could already
have entered the connection. Here, ordinary work and queued transaction begins
wait **outside** that native queue. The gate stays held through the root lease's
finalization and is poisoned before waiting admissions can enter after a failure.
Per-lease tails still drain admitted statements; successful shutdown still drains
queued/admitted leases rather than imposing an operational deadline.

Root batches now use explicit native transactions instead of the adapter's batch
helper with swallowed rollback errors. SQL failure is local only after rollback
acknowledges success; failed commit or rollback poisons the owner. Migrations use
explicit foreign-key disable/reset and read back the state under the same gate.
Failed reset, even after successful commit, is uncertain—not a rollback guarantee.
A poisoned connection performs no further native cleanup or queued work. Begin and
durable-close failures are terminal too. The schema-first `owner-failed` reply
rejects all pending work, fences late successes, invalidates live facade state and
terminates the worker; `close()` joins that termination and cannot report a durable
close acknowledgement. There is no retry, replacement connection or inline fallback.

`owner-failure-proof.test.ts` injects failures through typed backend methods, not
SQL marker strings. It checks queue exclusion even when the native slot is already
released, retained primary/cleanup causes, failed commit/rollback/reset/close,
verified settings, and ordinary SQL failure with successful cleanup. These are
controller fault tests, not physical disk/native-crash fault injection.
`failure-exercise.ts` additionally uses a real deferred foreign-key violation with
a resident BLOB to fail commit. Source, externally installed JS and compiled Bun
consumers all reject queued writes/migration/begin/close, join owner termination,
and explicitly reopen a new generation to verify the queued writes never reached
storage and old capabilities cannot be reused. That recovery opens the stopped
original database with any WAL; it does **not** claim a clean main-file-only backup
of an uncertain owner. Normal-close main-file-only restore remains a separate test.

**Still open:** raw transaction-control SQL, implicit engine rollback after a
statement error, and nested savepoint-cleanup failure need native state tracking.
An apparently live JavaScript lease is not proof that its native transaction still
exists. The installed SDK exposes public `Database.inTransaction`, but the current
`Client` adapter does not expose that state. Establish it through a public,
worker-owned backend boundary—not private field access or SQL-message matching—
before claiming full transaction semantics or switching runtime callers.

`staged-binaries.test.ts` exercises malformed/incomplete uploads, expected-digest
failure, visible views and empty BLOBs, foreign scopes/generations, byte/slot limits,
claim retention, repeated-argument bind limits, queued transactions during shutdown,
saturation-safe cleanup, SQL-failure rollback and stale capabilities/contexts.
The shared source/packed acceptance body stages **65,539 bytes** through bounded
chunks, inserts the resident BLOB plus a reference and an effect row on one lease,
checks nested rollback with outer commit and outer rollback after successful inner
writes, then checks the exact fixture bytes after main-file-only restore.
The caller holds one reusable chunk, not a full assembled payload or hashing pass.

Important limits of this slice:

- Chunks are **32 KiB**, copied in bounded visible slices on the caller and sent on
  the existing private worker port. The proposed direct binary channel, one-use
  data grants and authenticated application-RPC scope mapping are not implemented.
- The 100 MiB resident budget, 16 stage slots and 16 scope slots are enforced per
  proof execution owner, **not yet shared across all five runtime connections**.
  Reserving the maximum is tested; a 100 MiB end-to-end resident transfer is not.
- Producer/image processing, generic read capabilities, incremental duplicate
  verification and native-crash recovery remain unproven here.
  Do not combine the older main-thread 100 MiB chunking rehearsal with this smaller
  off-thread proof and call that an end-to-end large-asset acceptance result.
- No asset/entity schemas, migrations, runtime deployment scripts or runtime
  callers were switched. The fixtures' tables model atomic effects; they are not
  a canonical entity/projection/outbox integration rehearsal.

### Audit: where the current interfaces force bulk work

| Current boundary                                                                                                                                  | Required change                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/assets/src/index.ts`: `prepareAsset`, `preparedAssetSchema`, `assertPreparedAsset`                                                        | Runtime preparation becomes asynchronous and handle-based; validation of a mutation envelope must not rehash its bytes. Keep synchronous utilities only for explicitly synchronous, non-request uses. |
| `shared/image/src/adapters/image-adapter.ts`: `createImageEntity`                                                                                 | Construct metadata from trusted inspection results tied to the sealed digest, not another full preparation pass. Image processing stays in the image package, executing off-thread.                   |
| `shell/entity-service/src/remote-entity-service.ts`: `requestMutation`                                                                            | Do not require a caller-computed digest before upload or rehash `PreparedAsset` before sending. Use a bounded source and an authenticated upload capability.                                          |
| `shell/entity-service/src/asset-transfers.ts` and `entity-rpc.ts`                                                                                 | Replace owner-thread allocation/assembly/hash with metadata-only scope/admission orchestration. Never reconstruct a `PreparedAsset` on web when consuming an upload.                                  |
| `shell/entity-service/src/entity-mutations.ts`                                                                                                    | Validate canonical content/ref and admission using sealed metadata; reserve the stage before entering the existing entity transaction.                                                                |
| `shell/entity-service/src/sqlite-asset-repository.ts`                                                                                             | Bind resident bytes inside that transaction; perform duplicate verification and read/digest work beside the native connection. Keep asset-table policy here.                                          |
| `shared/image/src/lib/image-utils.ts`, `shell/plugins/src/message-interface/artifact-entity.ts`, `interfaces/web-chat/src/attachment-handlers.ts` | Replace whole-payload reads/inspection/base64 work on the request loop with stream or processing-destination APIs.                                                                                    |

Producer call sites include stock-photo selection and directory-sync's image helper,
file operations and conversion handler. Audit their actual execution placement,
including standalone mode; running off-web in one deployment topology is not an
architectural guarantee. Provider payload serialization and historical inline data
URLs also count as bulk work. Preserving legacy image readability does not justify
keeping their decode/rehash/serialization on the request loop.

### Scope, admission and lifetime

A generic resident capability identifies `{ generation, scope, id }`. It contains
no bytes, SQL table name, file path or durable asset reference. Schema validation
alone does not authenticate it: the worker must find a live record for the exact
connection generation and authorized scope. The owner creates that scope from
an actual control-connection lifetime, or an explicit local lifetime in standalone
mode; it never trusts a peer's claimed session ID. Application workers do not
receive native transaction leases or permission to issue SQL.

1. **Begin:** reserve a slot and a declared maximum byte count before allocation.
   Accept an optional exact size and expected SHA-256. A digest is not mandatory:
   requiring it would force a preparation/hash pass before the upload. For an
   unknown-length source, reserve its bounded maximum; do not buffer it on web
   merely to discover its length. Empty generic binaries remain valid.
2. **Append:** accept ordered, non-overlapping chunks, bounded to 1 MiB. Hash and
   assemble them on the binary execution side. Acknowledge only after accepting
   their bytes into the reserved allocation; receipt of a queued message is not
   capacity release. Malformed order/overflow invalidates the stage.
3. **Seal:** check actual length and any expected digest, stop accepting writes,
   and return `{ capability, sizeBytes, sha256 }`. The assets layer derives the
   durable `asset://sha256/...` reference from those verified facts. A seal is
   neither an insert nor a publication acknowledgement.
4. **Reserve for mutation:** atomically claim the sealed stage for one mutation
   attempt before waiting for its database transaction. Validation/admission
   failure releases that claim. Once admitted, retain the bytes while the attempt
   waits for, executes in, and settles its transaction.
5. **Attach:** associate the reserved stage with the exact native transaction
   lease. Other transactions, generations and scopes cannot bind it. Nested
   savepoints do not constitute an outer commit or release its reservation.
6. **Finish:** commit or rollback ends that attempt and invalidates its capability.
   A retry requires fresh staging or an explicitly verified existing durable ref;
   do not silently replay a consumed capability into a new transaction.

Admission IDs must be known before sending and never reused within their generation.
A lost acknowledgement is handled through that admission ID or scope revocation,
not by blindly repeating `begin`. Discard/revoke is idempotent for unclaimed stages.
For an admitted mutation it requests cancellation but does not free referenced
storage until the attempt settles. Owner loss fences the generation and reports an
uncertain mutation outcome; it is not evidence of rollback or permission to replace
the connection. No age-based polling cleanup or new operational deadline is needed.

### Explicit SQL bindings and transaction association

Use a distinct binary execution operation, with schema-first tagged arguments:

```text
executeBound(lease, {
  sql,
  args: [ scalar(value) | resident(capability), ... ]
})
```

Ordinary `Client.execute` retains its ordinary value contract; it must not recognize
magic strings, pretend a capability is a `Buffer`, or implicitly resolve objects in
SQL parameters. The native worker resolves a resident argument only after checking
its live mutation/transaction ownership. It performs the native BLOB bind itself.
Repeated resident arguments count repeatedly toward the statement's bind budget.
Returning clauses on this path return bounded metadata, not the inserted BLOB.

The entity repository can construct its insert with a public Drizzle SQL placeholder
in the bytes expression, compile with `.toSQL()`, then call a typed transaction-bound
helper with an explicit placeholder-to-capability map. Resolve actual `Placeholder`
objects, not matching scalar strings; reject missing/unused bindings. Do not pass
capabilities through the ordinary column encoder or `fillPlaceholders` into libSQL
argument types. Asset insertion, entity changes, projection records, export intent
and the embedding outbox remain on the same lease and outer commit.

`shared/db/test/staged-binary-query.test.ts` now proves the **compilation-only** part
using Drizzle's public SQLite builder: the bytes placeholder survives compilation,
a same-named scalar remains a scalar, and ordinary BLOB compilation is unchanged.
It does not implement capability resolution or prove transaction execution.

The factory must own the association between its public transaction facade and the
native lease when it creates that facade. A binary helper accepts only transactions
registered by that connection, including correctly registered nested facades; stale
or unrelated objects fail closed. Use public session/transaction constructors or
public extension points to establish the association—not `transaction.session`,
private fields, an ambient “current transaction,” or a second connection. The
isolated factory above now proves this bridge and nested lifetime handling. Root
cleanup-failure ownership is fenced above; finish native transaction-state and
raw-control/savepoint-failure semantics before applying the factory to
`ProjectionStore.withDirtyInput`.

### Binary channel and buffer ownership

Keep metadata/control on the existing authenticated RPC and parent/worker command
channel. Bind a separate bounded binary channel to a one-use grant issued through
that control scope. The receiving execution worker validates direction, generation,
stage/read identity and scope; it never accepts SQL on this data channel. Revoking
the control scope revokes its data grants. The 16 MiB RPC frame limit stays unchanged.

For same-process producers/processors, transfer explicitly owned buffers over direct
worker message ports. For cross-process producers, use credit-controlled raw binary
chunks, not whole-asset JSON/base64. Web must not decode/re-encode each bulk RPC frame
and then call that “off-thread.” HTTP request/response handling may relay bounded
chunks with backpressure; hashing, image processing, assembly and proportional
serialization belong to the processing side. No caller buffer is silently detached.
An existing borrowed view may only be copied in bounded visible slices, never by
structured-cloning its entire backing allocation.

Image inspection is a separate processing task owned by the image package. Route
its input/output directly to the appropriate binary execution destination, rather
than returning a full buffer to web between inspection and staging. Bind inspection
facts to the sealed digest; do not accept a client's metadata declaration as evidence
that the corresponding bytes were inspected.

### Reads, deduplication and resource budgets

- `stat` returns metadata without a BLOB. Verification returns size/digest facts,
  not bytes. The asset repository supplies bounded SQL chunk plans; the driver
  executes and hashes them generically without knowing the assets table.
- Duplicate verification runs under the entity transaction's lease. Hash the
  existing BLOB incrementally using bounded slices; do not fetch a second complete
  100 MiB BLOB back to web or require a second full resident reservation merely to
  verify a duplicate of a maximum-size staged asset.
- A read intended for a slow external consumer reserves its read budget **before**
  acquiring the snapshot lease, then materializes/verifies a worker-owned read
  capability. Revalidate size under the lease; a changed or oversized value aborts
  rather than waiting for more capacity while holding it. Release the database
  lease before serving the consumer. Network backpressure must not keep the entity
  database transaction open indefinitely.
- A read capability grants bounded pulls to its authorized destination and releases
  on finish, cancel or scope closure. Whole-buffer consumers must name an off-thread
  processing destination; a `Promise<Uint8Array>` is not an isolation guarantee.
  Preserve access checks before granting the read and expose no upload-only asset.
- Keep the 100 MiB asset ceiling. Start the next proof with a shared 100 MiB logical
  resident budget and 16 stage/read slots, not a fresh allowance per connection.
  Sharing the budget is generic controller infrastructure, not image policy.
- Separately bound ingress/egress bytes, waiting admissions and in-flight chunks;
  reserve completion/cancellation capacity so saturation cannot prevent release.
  Reserve verification scratch independently. No operation may wait for resident
  or transport capacity while holding the database lease needed to free it.
  Quotas include claimed stages and slow-reader buffers until their storage is
  actually released. Retaining a slice of a larger allocation retains that whole
  allocation's charge.
- Logical payload quotas are not a total RSS guarantee. Account separately for
  verification scratch, transport copies and native binding/query working memory.
  Prefer incremental digest-only verification and bounded reads; do not rely on
  the current proof's post-materialization result-size rejection for memory safety.

### Next executable acceptance

The lifecycle, actual LibSQLSession, nested resident/ordinary rollback and root
cleanup-failure fencing slices are implemented above. Next establish public native
transaction-state observation: caller-issued control SQL, implicit transaction
rollback after statement failure and nested savepoint-cleanup errors must not leave
a usable facade referring to a different or nonexistent native transaction. Keep
queued work outside the native adapter until the ownership outcome is known.
Then extend scope revocation to actual authenticated control connections and test
cancellation through that boundary. Add duplicate-corruption verification and a
shared owner-wide budget.

Then prove read snapshot consistency, slow/cancelled consumers releasing resources,
maximum-size deduplication without a second whole-buffer reservation, and the direct
binary data path in packed execution. Only after those checks should runtime
producers, mutations and readers be changed together. Do not leave a hidden
`PreparedAsset`/whole-buffer RPC fallback as an unreviewed compatibility path.

## Required boundaries

### Native execution belongs off the request loop

Keep the web process as the durable database owner. Put native handles and all
calls into the native SDK on owner-managed persistence threads. The application
job worker remains an authenticated RPC client; it gains no database access.

Use the existing `@brains/db` asynchronous facade as the driver boundary. Do not
move plugins, registries, entity policies or job orchestration wholesale into a
thread. Keep the driver generic; it must not know the image schema, the assets
table or shell-local runtime state.

Every connection has one execution owner and a serialized transaction lease.
Do not open a second connection for asset writes, transfer a native handle
between threads, or split one transaction across independently scheduled
connections. Thread ownership must be lifecycle-scoped and bounded, not a new
thread per request. Resolve connection/thread affinity explicitly before coding.

There is no inline runtime fallback if the persistence thread cannot start.
Standalone mode retains a combined application process, not native execution on
its request loop.

### Large bytes must not return to the web thread for processing

Move assembly, hashing, byte-sized copies and native BLOB binding/extraction off
the request loop. Moving only the digest calculation leaves the synchronous
native bind/step path in place and is insufficient.

Prefer staged binary capabilities local to the owning persistence connection:
metadata crosses the control plane; the bytes stay beside their eventual
transaction. A capability is scoped to its connection generation, byte budget
and consuming transaction. It is not an independently published asset.

The driver needs an explicit typed binding contract for such capabilities. Do
not disguise a handle as a `Buffer`, use magic strings in ordinary SQL values,
or reach into Drizzle's private session fields. Asset policy remains owned by
the entity package; generic staging/ownership primitives belong below it.

Preserve normal caller buffer ownership. Transferring an `ArrayBuffer` detaches
it, so transfer only storage the sender explicitly owns and relinquishes. Do not
silently detach caller-owned `PreparedAsset.bytes` or transfer an entire pooled
Buffer backing store. Check the actual Bun worker transport and packed build,
not just Node type declarations.

Audit producer and reader APIs as well as the database adapter. Runtime ingress
must not call a synchronous whole-asset preparation helper before offloading;
readers must not copy or rehash a returned 100 MiB buffer on the web thread.
A synchronous utility may remain for explicitly synchronous, non-request uses,
but is not an alternative runtime ingestion path.

### Transfer, transaction and shutdown invariants

- Keep the existing 16 MiB frame limit. Bound chunks, queued bytes, upload slots
  and aggregate admitted bytes on both sides; do not only bound each upload.
- Send bulk bytes on a binary data path, with metadata on the control path.
  Avoid whole-asset JSON/base64 encoding or structured-clone copies on the web
  thread. Any necessary cross-process copying must be bounded and backpressured.
- Validate size, digest, sequence and ownership before durable publication.
- Commit the BLOB and its entity reference in the same existing transaction,
  including projection/export/outbox effects. No upload-only durable publish.
- A disconnect or explicit cancellation releases unconsumed staging. An admitted
  transaction retains its resource reservation until it settles.
- Cancellation after dispatch is not proof of rollback. Report uncertain results;
  do not automatically replay mutations after a thread crash.
- Shutdown fences admission, drains admitted transactions, checkpoints and closes
  the native handles, and only then releases their threads. A dead execution owner
  cannot be silently replaced while its connection's absence is unproven.

## Implementation order and structural acceptance

1. Specify the typed driver commands, connection affinity, transaction leases,
   binary ownership/capability contract and failure states. Review this scope
   before replacing the runtime driver.
2. Implement the worker-backed native adapter with existing query/row semantics,
   transaction serialization, rollback, close and ownership fences intact.
3. Move binary staging/verification and producer/consumer processing to the
   execution boundary; retain only bounded control work on the web thread.
4. Package the worker entry and native dependency through the supported brain
   and ops builds. Verify a packed consumer outside the monorepo, including the
   compiled runtime and offline helpers. No source-tree-only worker path.
5. Prove placement structurally: instrument native execution to assert a worker
   thread; hold that worker behind a deterministic test gate while the main
   thread handles control work. Do not infer isolation from a latency threshold.
6. Re-run atomicity, disconnect, cancellation, shutdown, stale-generation,
   connection-budget and 100 MiB transfer/recovery tests through the real boundary.
7. Measure latency, memory and throughput to validate and size the design, not
   to decide whether the boundary is necessary.

Until these gates pass, retain the 100 MiB storage ceiling without advertising
production-ready large-asset handling. Document ingestion remains a separate
feature; changing transport does not migrate existing inline document entities.

Related: [Turso release plan](turso-database-engine.md),
[durable binary assets](durable-binary-assets.md),
[offline recovery](../turso-backup-restore.md).
