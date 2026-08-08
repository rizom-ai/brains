# Plan: Turso Database engine migration

## Status

In progress. The engine spike is done on `work/turso-spike` (commits
`23d7d468d`, `d02c4c0cd`): `@brains/db` has a `createTursoClient` adapter that
presents the libSQL `Client` surface over `@tursodatabase/database@0.7.2`, and
`createSqliteDatabase` selects it for `file:` urls when `BRAINS_DB_ENGINE=turso`.
All services and drizzle run unchanged on either engine. Remaining phases below.

This plan originally asked whether the rewrite is worth adopting at all. The
spike answered that: yes — phased, with libSQL as an instant fallback via the
engine flag until the last phase. The strategic sync fork (DB/browser sync vs
git-only) survives as a later gate; it decides the embeddings-fold and MVCC
single-file questions, not the engine swap itself.

## Spike findings (measured, not assumed)

Engine: `@tursodatabase/database` 0.7.2. Suites run with `BRAINS_DB_ENGINE=turso`:

- **Works unchanged:** vector search (`F32_BLOB`, `vector32`,
  `vector_distance_cos`, including the cross-DB `ATTACH` join used by
  `entity-search.ts`, behind the SDK's `attach` experimental flag);
  `PRAGMA journal_mode = mvcc` and `BEGIN CONCURRENT` (MVCC dropped its beta
  label in engine v0.7); multi-process file access behind `multiprocess_wal`
  (writes `*.db-tshm` sidecars, gitignored; invalid for `:memory:`).
- **Suite results:** shared/db 24/24 on both engines; runtime-state 10/10;
  job-queue 194/195; conversation-service 34/35; entity-service 188/325.
- **FTS5 does not exist on Turso** — every entity-service failure is the single
  error `no such module: fts5`. Turso replaces FTS5 with a native Tantivy-based
  engine: `CREATE INDEX … USING fts (cols)` behind the `index_method`
  experimental flag, queried with the standard `MATCH` operator (probed
  working). The index is transactional — no shadow-table sync needed.
- **Row-value cursor predicates don't seek.** `(runtimeUpdatedAt, id) > (?, ?)`
  plans as a full covering-index scan (the job-queue failure); plain
  `runtimeUpdatedAt >= ?` seeks correctly. The expanded-OR form is worse
  (multi-index OR + sorter).
- **`PRAGMA busy_timeout` is a no-op** (the conversation-service failure — its
  readiness test asserts the timeout value). Irrelevant once MVCC replaces WAL.
- **The SDK loads a NAPI native binding at import time.** It is dynamically
  imported and marked external in the app/CLI bundles so libsql-mode consumers
  never resolve it. The packed consumer's nested install did not materialize
  the platform-specific optional dependency — shipping turso-by-default in the
  packed CLI needs that story verified.
- **drizzle-orm 0.45.2 ships no turso driver** (contrary to this plan's earlier
  claim). The adapter therefore implements the libSQL `Client` contract that
  `drizzle-orm/libsql` already speaks — hybrid rows (non-enumerable indices +
  `length`, enumerable named columns), `batch`/`migrate`/`transaction`,
  `CLIENT_CLOSED` on use-after-close. This also means zero per-service swap
  work: the flag covers every service through `createSqliteDatabase`.
- **The libsql vector index was dead weight** on both engines — created on
  every embedding insert, never queried (nothing issues `vector_top_k`).
  Removed in `23d7d468d`, independent of the migration.
- **Not covered:** auth-service's embedded replica (`runtime-db.ts` constructs
  its own `@libsql/client` with `syncUrl`; it syncs against Turso Cloud and
  stays on libSQL throughout this plan), and opening pre-existing DB files
  whose `sqlite_master` still contains the legacy `libsql_vector_idx` index
  definition (needs a drop-index migration run under libSQL before an engine
  switch — Phase 3).

## Context (unchanged)

Every shell service builds its DB through `createSqliteDatabase` in
`shared/db` over a local `file:` SQLite DB. "libSQL" is Turso's fork of
SQLite, now in maintenance; "Turso Database" is the clean-room Rust rewrite
where development happens. Git remains the content sync layer; the entity DB
is a derived index. A brain is one shared store with per-entity visibility —
multi-user exerts no pressure on DB layout.

## Design

Thin vertical slices. The engine flag is the safety rail: every phase before
the default flip is trivially reversible by unsetting `BRAINS_DB_ENGINE`.
Tests precede implementation in each phase.

### Phase 0 — Engine adapter behind a flag — DONE (spike)

`createTursoClient` + `BRAINS_DB_ENGINE=turso` selection in
`createSqliteDatabase`; adapter test suite; dead vector index removed;
bundler externals + dynamic import; `*.db-tshm` gitignored. Landed on
`work/turso-spike`.

### Phase 1 — FTS port to Turso native FTS

The one real port, and the walking skeleton for production parity: after it,
entity-service — the largest and most engine-sensitive suite — must be green
under the flag.

- Tests first: the existing search suites are the spec — they must pass on
  both engines. Add an engine-parity test for the keyword-boost path
  (`EXISTS … MATCH` returns the same boost decisions on both engines).
- Replace `ensureFtsTable`'s `entity_fts` FTS5 virtual table with an
  engine-aware seam in `shared/db` or `entity-service/db`: FTS5 virtual table
  on libsql, `CREATE INDEX … USING fts` (+ `index_method` flag in the adapter)
  on turso. The `MATCH`-based boost subquery in `entity-search.ts` stays
  identical if the index name matches the table it indexes; adjust the
  subquery shape only if probing shows otherwise.
- Delete the FTS5 shadow-table sync machinery on the turso path (the native
  index is transactional).

**Exit:** entity-service 325/325 under `BRAINS_DB_ENGINE=turso` and unchanged
on libsql.

### Phase 2 — Close the small diffs

- Job-queue cursor: rewrite the durable cursor seek as
  `runtimeUpdatedAt >= ?` + client-side tie-skip of already-seen
  `(runtimeUpdatedAt, id)` pairs. Update the query-plan test to assert a
  seek on both engines (`SEARCH … USING INDEX`).
- Conversation-service readiness: make the busy-timeout assertion
  engine-aware — on turso assert the pragma is accepted and writes proceed
  under contention instead of asserting the echoed value.

**Exit:** every service suite green under the flag on both engines.

### Phase 3 — Default flip with fallback

- Verify the packed-CLI platform-binding story: a packed consumer with
  `BRAINS_DB_ENGINE=turso` must resolve the native binding on install
  (platform optional deps in the nested layout). Extend the packed-consumer
  test with a turso-mode smoke.
- Migration for existing installs: under libSQL, drop the legacy
  `embeddings_embedding_idx` from existing embedding DB files before the
  engine can open them; verify turso opens a real production-shaped DB file
  (WAL journal, existing schema).
- Flip the default engine for `file:` urls to turso;
  `BRAINS_DB_ENGINE=libsql` becomes the explicit fallback. Keep WAL journal
  mode — file format stays SQLite-compatible, so fallback remains instant.

**Exit:** production runs turso under WAL with a one-env-var rollback.

### Phase 4 — Sync-model spike (the strategic fork, unchanged)

The fork that decides the file layout. Sync is whole-DB on both engines
(verified earlier — no table-scoped sync), so a separate embedding file is
the only way to give regenerable vectors an independent sync fate.

- Prove entity-DB `push()`/`pull()` against a remote via
  `@tursodatabase/sync`; browser CMS spike via `sync-wasm` opening only the
  entity DB. Compare against git sync: complement or replace; record the
  topology.

**Exit — documented fork:** pursue DB/browser sync → embedding DB stays a
separate file, no fold; stay git-only → the fold becomes available as a local
simplification. Either way, do not fold while the DB-sync option is open.

### Phase 5 — MVCC and layout consequences

Only after the engine has run quietly in production (Phase 3) and the fork is
decided (Phase 4). `journal_mode = mvcc` is the first step that is not
trivially reversible to libSQL, so it comes last.

- Adopt MVCC journal mode; drop the WAL/busy-timeout pragma path.
- Git-only branch: fold embeddings into the entity DB with FK + cascade
  (tests first: atomic entity+embedding write, no orphan window), retiring
  the `ATTACH` plumbing and the `attach` experimental flag.
- Transactional outbox (entity write + job enqueue atomic): reopen the
  separate-jobs-file decision — it was closed because of separate files, and
  MVCC plus a decided sync fate changes both premises. Decision gate,
  tests first, documented either way.

**Exit:** final topology recorded in the roadmap; compensation logic for the
entity-write/enqueue gap removed if the outbox is adopted.

## Non-goals

- No changes to auth-service's replica path — it stays on `@libsql/client`
  against Turso Cloud for the duration of this plan.
- No reliance on experimental page-level "partial sync" for embeddings
  exclusion — access-pattern lazy loading guarantees nothing on `push()`.
- No wholesale one-DB consolidation ahead of the Phase 4 fork; service-level
  separation is domain-driven and survives unless Phase 5 explicitly folds a
  specific pair for transactional integrity.

## Risks

- Turso's native FTS sits behind the `index_method` experimental flag and
  would be load-bearing from Phase 3 on — the engine flag is the mitigation,
  and Phase 3 keeps WAL so fallback stays instant.
- The nested-install native-binding gap (packed CLI) is unresolved until
  Phase 3 verifies it; turso-by-default cannot ship before that.
- MVCC-mode files close the instant-fallback door — deliberately sequenced
  last, behind production soak time.
