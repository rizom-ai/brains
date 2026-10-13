# Plan: Salvage the Turso branch onto libSQL

Last updated: 2026-09-30

## Status

`work/turso-migration` is frozen and is not the `0.3` release vehicle. `0.3` stays on
libSQL. This plan carries the engine-independent parts of that branch onto `main` as
small PRs, one at a time.

## Decisions

- **Turso is dropped for `0.3`.** Its driver, database/browser sync, was rejected in
  favour of Git-only sync on 2026-08-09. MVCC is parked. Turso has no FTS5, so the branch
  replaced full-text search with an exact-phrase scan. Its native work runs on the
  calling thread, as libSQL's local client does, so the engine brings no event-loop
  gain. Every instance would still need an offline import, restore and soak. Turso is
  revisited only on a concrete need (measured write contention, or libSQL end of
  support), as an engine swap against a mature release.
- **Assets are owned by [durable-binary-assets.md](./durable-binary-assets.md).** Bytes
  stay in `brain.db` as staged chunk rows, published atomically with their entity
  reference, on the application thread. Git sync is optional, so the entity database
  must be a complete, portable copy of an instance on its own.
- **The auth embedded replica stays** as the remote backup/PITR path for auth.
- **No off-thread persistence.** The owner/worker transport, SQL workers and file actors
  are not carried over; staged chunk commits bound asset stalls without them.
- **The job queue stays a separate database.** The outbox journals job intents in the
  entity database and relays them into the job queue; it does not merge the files.

## Phases

Each phase is one PR against current `main`, tests first. Branch commits are reference
material; most are rebuilt rather than cherry-picked, because they assume the Turso
adapter or owner transport.

1. **Fail fast on SQLite lock contention.** `@libsql/client` hands each transaction its
   current connection and opens a new one without the `busy_timeout` that
   `applySqlitePragmas` set, so the timeout silently drops to 0 after the first
   transaction. While it is still armed, a write contending with an open in-process
   transaction busy-waits on the event loop for the full timeout (measured: 2 s for a
   2 s timeout) and then fails, because the lock holder cannot continue.
   - Set the timeout to 0 explicitly on every app-thread libSQL connection.
   - Retry lock acquisition asynchronously through `retrySqliteWrite`:
     - plain writes as today;
     - transactions only when `BEGIN IMMEDIATE` fails, never after their callback has
       started.
   - Tests:
     - a contending write fails within milliseconds instead of blocking;
     - a retried transaction commits after the holder finishes;
     - a started callback never runs twice.
2. **Drop the unused libSQL vector index** (`2db69865ab`). Nothing queries
   `vector_top_k`; existing files get `DROP INDEX IF EXISTS`.
3. **Bounded job-queue cursor reads** (`dff6ed20d7`). The existing
   `(runtimeUpdatedAt, id) > (?, ?)` predicate already seeks through the composite
   index on libSQL. Preserve its cursor ordering and bound page reads; verify the
   query plan before adopting any predicate rewrite from the Turso branch.
4. **Fold embeddings into `brain.db`** (`4aeab88c70`). One-time migration copies rows from
   `embeddings.db` via `ATTACH`; rows that cannot be copied are re-queued, since
   embeddings are derived. Removes the second file, its WAL and the cross-database join.
5. **Entity/job outbox** (`4f984ab51d`). Entity mutations journal embedding-job intents in
   the same transaction; an idempotent relay enqueues them into the job queue.
6. **Durable bulk coordination capability** (`d6662a14f4`). `context.entityCoordination`
   replaces `source`/`operationId` in plugin code and job payloads. Drop its RPC call
   parsing.
7. **Offline backup and restore.** Adapt the branch's `docs/turso-backup-restore.md`
   runbook to libSQL:
   - fence writers;
   - snapshot every database with `VACUUM INTO`;
   - capture Git refs and dirty files, configuration, private environment and
     encryption keys;
   - ship the snapshot off-host;
   - restore into an isolated destination.

   Asset verification follows `durable-binary-assets.md` once assets are active.

8. **Small independent fixes.** Settle durable exports before startup import
   (`9a32c1c49a`). The buffered URL downloader removal (`1fb4acae9d`) is reference
   material, not currently independent: `fetchAsBase64DataUrl` still has a caller in
   `shared/image/src/lib/image-utils.ts`. Remove it only after that caller is migrated
   by the asset work and a fresh caller audit confirms it is unused.

## Left on the frozen branch

- Turso adapter, engine flag, Turso FTS and the portable exact-phrase search, including
  its `search_text` backfill and empty-query fix.
- Web-as-owner topology, worker routing, owner RPC transport and single-owner shutdown.
- The `0.2` → `0.3` offline importer and Turso recovery rehearsal.
- Off-thread persistence, SQL/network workers, native file actors and every caller
  rewrite built on them (chat, email, media, documents, site, AT Protocol, LinkedIn,
  directory-sync).
- Owner write admissions for generation and contact intake, and the CLI runtime-chunk
  and source-map changes that were uncommitted on the branch.

## Completion

Delete this plan when phases 1–8 have landed. Then remove the `turso-migration` worktree
and delete `work/turso-migration`.
