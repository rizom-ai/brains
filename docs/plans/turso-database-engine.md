# Plan: Turso Database engine migration

## Status

In progress. The engine spike is done on `work/turso-spike` (commits
`23d7d468d`, `d02c4c0cd`): `@brains/db` has a `createTursoClient` adapter that
presents the libSQL `Client` surface over `@tursodatabase/database@0.7.2`, and
`createSqliteDatabase` selects it for `file:` urls when `BRAINS_DB_ENGINE=turso`.

Phases 1 through 3 are implemented in `work/turso-migration`: Turso native FTS
is wired through an engine-aware seam, the remaining service differences are
closed, packed installs carry the native binding, and local files default to
Turso with a tested explicit fallback. Phase 4's live sync spike is complete;
the strategic sync choice remains pending an owner decision. The affected
service suites pass on both engines. Review uncovered that Turso's persisted native-FTS
schema syntax is not parseable by libSQL. The chosen mitigation is an explicit,
tested break-glass command: `brain-rollback-entities-to-libsql`.

This plan originally asked whether the rewrite is worth adopting at all. The
spike answered that: yes — phased, with libSQL retained as a fallback. Phase 1
then showed that native-FTS cleanup must accompany the engine flag. The
strategic sync fork (DB/browser sync vs git-only) survives as a later gate; it
decides the embeddings-fold and MVCC
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
  readiness test asserts the timeout value). Irrelevant once MVCC replaces WAL.
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

- The job-queue durable cursor now seeks on `runtimeUpdatedAt >= ?`, then
  tie-skips already-seen `(runtimeUpdatedAt, id)` pairs client-side. Both
  engines report `SEARCH … USING INDEX` for the covering-index query plan.
- Conversation-service readiness is engine-aware: libSQL still verifies the
  echoed busy timeout, while Turso verifies that the pragma is accepted and a
  write waits for a contending process to commit.

**Exit met:** job-queue has 195 passing tests plus one intentional remote-only
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

### Phase 4 — Sync-model spike — SPIKE DONE; DECISION PENDING

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

**Decision gate (owner):** pursue DB/browser sync or retain Git-only content
sync. Pursuing database sync keeps embeddings separate and first requires a
plan for native FTS compatibility, sync-managed-file cutover, authorization,
and the entity service's single-writer responsibilities. Retaining Git-only
sync adds no sync SDK production path and makes the embedding-table fold
available after the production soak. The spike itself adds neither production
path.

### Phase 5 — MVCC and layout consequences

Only after the engine has run quietly in production (Phase 3) and the owner has
resolved the Phase 4 fork. `journal_mode = mvcc` is the first file-format step
that is not reversible to libSQL through schema cleanup, so it comes last.

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
  would be load-bearing from Phase 3 on. WAL keeps the file format compatible,
  but the native FTS schema is not libSQL-parseable; fallback requires the
  explicit cleanup command described in Design and Phase 3.
- MVCC-mode files close the instant-fallback door — deliberately sequenced
  last, behind production soak time.
