# Plan: Turso-only database runtime for `0.3`

Last updated: 2026-09-13

## Status

**Active `0.3` release work on `work/turso-migration`; `0.2` remains on libSQL.**

The exploratory engine decision is closed: the `0.3` runtime will use Turso Database for every runtime database, including authentication. libSQL remains only in a separately packaged one-time `0.2` importer and does not remain as a runtime selector, fallback, remote path, or auth-replica exception.

The implementation foundation is extensive but not ready to merge as a `0.2` change or to deploy. Runtime conversion, the owner/worker boundary, consolidated embeddings, portable search, entity/job outbox, offline importer, backup/restore tooling, and isolated driver proof exist. Canonical migration, full off-thread driver integration, production recovery rehearsal, and fleet soak remain release gates.

Git remains the content synchronization model. The investigation rejected database-level/browser sync as the migration reason: current Turso sync is whole-database, while entity content and regenerable embeddings need different sync fates. MVCC remains parked until observed owner-connection saturation justifies it.

## Goal

Ship `0.3` with one Turso-only local database architecture that:

- preserves all durable `0.2` state through a verified offline migration;
- gives the web process sole ownership of local databases while workers use typed local transport;
- keeps entity changes and embedding-job intents durable together;
- stores regenerated embeddings in the entity database without retaining a second runtime engine;
- preserves auth, conversations, jobs, runtime state, content Git state, configuration, and encryption material through backup/restore; and
- has a rehearsed per-instance cutover and bounded rollback policy.

## Implemented foundation

### Runtime storage

- All service databases can open through the shared Turso adapter.
- The intended runtime removes engine selection, remote libSQL URLs/tokens, auth replicas, and transitive libSQL runtime loading.
- Native FTS is replaced by a portable exact-phrase scan; the runtime refuses unsupported legacy FTS files rather than rewriting live state with another engine.
- Embeddings are consolidated into `brain.db` and remain derived/regenerable.
- Entity mutations journal embedding-job intents atomically through an owner-local outbox; relay into the separate job queue is idempotent.
- Auth shutdown awaits admitted writes and durable close.

### Process ownership

- The web process is the sole local database owner.
- Worker and headless operations use typed owner transport rather than opening another local handle.
- Production-shaped boundary tests cover service behavior, shutdown, and persistence under WAL.

### Offline migration

`@rizom/db-migration` imports the five `0.2` runtime databases from a checksum-verified snapshot into a new private destination. It preserves paged durable-table content, pending jobs, and auth state; refuses processing jobs; never opens the sole source in place; and retains failed staging for diagnosis/retry.

The importer is the only package allowed to carry libSQL after `0.3` runtime publication.

### Backup and restore

The branch's `docs/turso-backup-restore.md` runbook and deploy helpers capture databases, Git refs/dirty files, configuration, private environment, and encryption keys with writers fenced. Restore targets isolation, never overwrites an existing destination, and does not automatically restart jobs. Real-Docker fixtures cover capture, restore, source restart, failure cleanup, and restored auth/session/signature/decryption data.

### Off-thread proof

An isolated native-owning worker proof demonstrates main-thread HTTP progress while database native work blocks, transaction isolation, packaging, and durable main-file recovery. No canonical runtime caller uses that driver yet.

## Remaining release gates

### 1. Complete off-thread persistence

Review and implement the branch's `docs/plans/turso-off-thread-persistence.md` proposal:

- full driver command/query/transaction parity;
- connection affinity and single-owner enforcement;
- binary staging, hashing, and transfer without request-loop stalls;
- atomic asset/entity writes;
- package and compiled-runtime loading; and
- crash, cancellation, drain, and shutdown semantics.

Async method signatures alone do not prove isolation: Turso `0.7.2` performs native prepare/bind/step/row extraction on the calling thread.

### 2. Prove canonical `0.2` migration

From a complete representative `0.2` snapshot:

- fence all writers and capture verified source state;
- import into a new destination, never in place;
- compare durable counts and content digests;
- restore Git/config/private environment and encryption material;
- verify passkey login, sessions, signatures, decryption, pending-job recovery, search, embeddings readiness, directory import/export, and owner/worker traffic; and
- prove interruption leaves the source usable and supports deterministic retry/discard.

### 3. Prove production recovery

- Run the real deploy backup gate with canonical images and mounts.
- Verify restore after interrupted migration and interrupted deployment.
- Replace every retired `embeddings.db`, live libSQL, and auth-replica assumption in ops.
- Document the point after which rollback to the old snapshot would lose accepted `0.3` writes; do not claim lossless rollback across that boundary.

### 4. Soak the fleet deliberately

1. Rehearse migration, failure, restore, and rollback on Smoke.
2. Soak for several days with operational and request-loop evidence.
3. Migrate `yeehaa.io` and `rizom.ai` one at a time after explicit approval.
4. Require Smoke plus at least one real instance to complete a verified backup/restore and sustained healthy operation before stable `0.3`.

## Cutover invariant

For each instance:

1. stop `0.2` and fence web, worker, auth-replica, and operator writes;
2. retain the old image, config, content checkout, and verified source snapshot;
3. import into a new directory;
4. validate all durable domains before switching paths;
5. start `0.3` with traffic fenced and run smoke checks;
6. reopen traffic only after acceptance; and
7. never open `0.3` files with the `0.2` engine.

Before new writes, rollback restores the old binary and source snapshot. After new writes, recovery requires an explicit data policy rather than silently discarding them.

## Non-goals

- Changing the `0.2` storage contract.
- Permanent dual-engine runtime support or an engine environment switch.
- Remote libSQL or auth-replica exceptions in `0.3`.
- Replacing Git content sync with database sync.
- Browser-synced Studio as part of this migration.
- MVCC without measured owner-connection pressure.
- Opening live Turso databases with libSQL/SQLite backup tools.

## Completion

Delete this plan after stable `0.3` ships from the Turso-only contract and the migration, recovery, soak, and rollback procedures are captured in durable runtime/ops documentation.
