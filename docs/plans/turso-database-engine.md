# Plan: Turso Database engine evaluation

## Status

Proposed / exploratory. No code written. This plan exists to settle one tradeoff:
is the SQLite-from-scratch rewrite worth adopting, and specifically does it unlock
a **DB-level sync model** (replacing/augmenting today's git sync, and enabling a
browser-synced CMS) that libSQL structurally cannot. Urgency **2/5** — nothing is
broken; the value is option-value while the schema is small and the engine is beta.

## Context

Every shell service uses `@libsql/client@^0.15.7` + `drizzle-orm/libsql`
(`entity-service`, `job-queue`, `conversation-service`, `runtime-state`, plus the
CLI). Usage is deliberately minimal: `createClient({ url, authToken })` over a
local `file:` SQLite DB, with the door open to a remote Turso/libSQL server when
an `authToken` is present. No embedded replicas / `syncUrl` anywhere.

"libSQL" (what we use) is Turso's **fork** of SQLite. "Turso Database"
(`@tursodatabase/database`, formerly Limbo) is a separate **clean-room rewrite**
of SQLite in Rust. Turso's own guidance: new projects → Turso Database;
mission-critical-today → libSQL. The rewrite is still beta.

### Facts that shaped this plan (verified against the code, not assumed)

- **We already use native vector search.** The embeddings table uses
  `F32_BLOB(dimensions)` + `libsql_vector_idx(...)` (`schema/embeddings.ts`,
  `db/embedding-db.ts`). Native vector is **not** something the rewrite unlocks for
  us — we have it. So vector is not a reason to migrate.
- **Today's sync layer is git, not the DB.** Per `docs/directory-sync-git.md`:
  _"The sync directory is the git working tree. The Brain database is another view
  of that same content."_ Source of truth is `brain-data/` markdown synced via
  `git pull/commit/push`; the SQLite entity DB is a **derived, per-node index**
  rebuilt by importing markdown. Embeddings are not content — they are never
  exported to git; each node regenerates them locally (async jobs, `contentHash`
  staleness).
- **Multi-user is not per-user data partitioning.** Per `multi-user.md`, a brain
  is _one shared store_ accessed by multiple people via per-entity visibility
  (`public`/`shared`/`restricted`) and permission levels. One entities table, one
  embeddings store, regardless of user count. Multi-user therefore exerts **no**
  pressure on the DB-vs-DB layout.

### The actual driver: a DB-level sync future

The reason to look at the rewrite is a direction we may want to take that git sync
and libSQL cannot serve well:

1. **Sync the database itself** (cloud replicas / offline writes) instead of, or
   alongside, git-syncing markdown.
2. **A browser-synced DB for a better CMS** (Turso runs in browser via WASM:
   `@tursodatabase/sync` / `sync-wasm`, with `push()`/`pull()`).

What the engine actually adds for these futures (verified against
`docs.turso.tech/sync` and `docs.turso.tech/sync/partial`):

- **Both Turso Sync and libSQL replicas sync the _whole_ database.** `push()` /
  `pull()` move the entire local DB; there is **no table- or row-scoped sync
  config** (`tables: [...]`, exclude filter, etc. do not exist).
- **"Partial sync" is page-level lazy loading, not table exclusion** — and it is
  marked `partialSyncExperimental`. Its mechanisms are _bootstrap_ (download first
  N bytes, or a `query` to pre-hydrate a working set) and _lazy page-fetch on
  access_. A query bootstrap pre-populates only the pages a query touches; it does
  not exclude a table.
- **What the rewrite genuinely unlocks is DB-level + browser (WASM) sync at all**
  (`@tursodatabase/sync` / `sync-wasm`, `push()`/`pull()`), which libSQL's
  git-adjacent posture and whole-file replicas don't give us — _not_ per-table
  selective sync.

**Consequence for the embeddings layout (corrected):** to give embeddings an
_independent sync fate_ (e.g. sync entities to a browser CMS but keep the bulky,
regenerable vectors local), they must remain a **separate database file** — on
_either_ engine. Folding into one DB forfeits that control, because sync is
whole-DB. So the fold and the DB-sync future are in tension regardless of engine.
The closest emergent partial behavior — a browser that never queries embeddings
never lazily fetches those pages — is access-pattern-driven, read-direction-only,
experimental, and guarantees nothing on `push()`. We do not build on it.

### What stays the same under a swap

Drizzle abstracts the dialect (both are the SQLite dialect) and now ships a
dedicated driver for the new engine. So `schema/*.ts`, all queries, and every
`db.select()/insert()` call are untouched. The swap is confined to the
`createEntityDatabase` / `createClient` construction seam (~2 files per service)
plus `drizzle.config.ts` (`dialect: 'turso'`).

## Open questions to settle

- **Sync model (the decisive one) — now answered, and it is "no".** Turso sync is
  whole-DB; "partial sync" is experimental page-level lazy loading, not table
  exclusion (verified in docs). So a single DB cannot give entities and embeddings
  different sync fates. The open part is only: do we _want_ the DB-sync/browser
  future enough to keep the embedding DB physically separate for it (Phase 1
  confirms the sync mechanics; it does not reopen table-scoping).
- Does the browser CMS need embeddings? **Default answer: no.** A CMS is content
  management (browse/edit/metadata/draft-publish) + keyword/FTS find; none of that
  touches vectors. In-browser semantic search would be the only reason, and even
  then a remote query against the server-side embedding store beats shipping
  ~6 KB/entity of float blobs to every client. So the browser opens **only the
  synced entity DB**; the embedding DB never participates in browser sync.
- Does drizzle-kit `generate`/`push` behave against the beta engine, including our
  PRAGMAs (`journal_mode=WAL`, `busy_timeout`) and FTS5 (`entity_fts`)?
- Local vs remote split: `@tursodatabase/database` is the embedded engine; the
  remote `authToken` path still wants `@libsql/client`. Confirm the
  `authToken ? … : …` branch cleanly selects which `drizzle(...)` to build.

## Design

Engine-and-sync decision first; the embeddings-fold and outbox are **downstream
consequences** of that decision, not precursors. Each phase is a thin vertical
slice that ships (or concludes) independently. Tests precede implementation.

### Phase 0 — Walking skeleton: prove the driver swap on one service

Isolated worktree. Smallest, lowest-risk DB first: **`runtime-state`**
(no FTS, no vectors, no cross-service transactions, not sync-relevant).

- Tests first: run the existing `runtime-state` DB suite green on the current
  engine, then re-point its harness at the new driver and require the same suite
  to pass unchanged.
- Swap `db/index.ts` construction: `new Database(dbUrlToPath(url))` +
  `drizzle({ client })` from the new-engine import; keep the `file:`-only WAL/
  busy-timeout guard behavior.
- Validate `drizzle.config.ts` `dialect: 'turso'`, `db:generate`, migrations.

**Exit:** `runtime-state` runs on the new engine with its suite unchanged, or we
document the first concrete blocker and stop. No other service touched.

### Phase 1 — Sync-model spike (the strategic fork)

The phase that justifies everything after it. Still in the worktree, on the
`entity-service` schema (where embeddings live). Sync is whole-DB (verified), so
this spike proves _mechanics and desirability_, not table-scoping.

- Stand up `entity-service` on `@tursodatabase/database`/`sync`. Prove the entity
  DB can `push()`/`pull()` against a remote, and that the **embedding DB remains a
  second, independently-synced (or unsynced) file** — the entity DB and embedding
  DB stay physically separate, each with its own sync policy.
- Spike the browser target (`@tursodatabase/sync-wasm`): a browser client opens
  **only the entity DB** and runs the CMS read/edit path. Confirm the embedding DB
  is never opened/synced client-side (default expectation per the open question).
- Compare against status quo: does DB sync complement git sync (DB for live
  collaboration/CMS, git for durable history) or replace it? Record the topology.

**Exit — the fork in the road, documented:**

- **Pursue DB/browser sync** → entity DB and embedding DB stay **two separate
  files**; the browser syncs only the entity DB. Phase 2 (fold) is **not** taken —
  folding would forfeit the embedding DB's independent sync fate. Proceed to
  Phases 3–4.
- **Stay git-only** (DB sync not worth it yet) → sync fate is moot, so the
  embeddings-fold becomes available purely as a local simplification. Phase 2 is
  on the table.
- Either way: **do not fold while keeping the DB-sync option open.**

### Phase 2 — Embeddings-fold (ONLY in the git-only branch)

Taken **only** if Phase 1 concludes we are not pursuing DB-level sync. Then sync
fate is irrelevant and the fold is a pure local win (FK integrity, atomic writes,
one fewer file/WAL/migration/ATTACH). If we are pursuing DB sync, **skip this
phase and keep the separate embedding DB.**

- Tests first: write an entity **and** its embedding in one transaction (atomic
  snapshot); a consistency test asserting no "entity exists / embedding missing"
  window; an FK cascade-delete test.
- Move embeddings into the entity DB with an enforced FK
  (`entityId → entities.id`, `ON DELETE CASCADE`); retire `db/embedding-db.ts`,
  the separate file, and `attachEmbeddingDatabase`/ATTACH plumbing.
- Preserve the async-generation lifecycle as a same-DB table (the original reason
  for the split — _immediate entity persistence while embeddings generate async_ —
  needs separate tables, not separate files).
- Decide FTS5's fate based on the Phase 0 finding; migrate `entity_fts`.
- Migration/backfill from existing embedding DB files.

**Exit:** entity + embedding are one transactional store with FK integrity and the
separate embedding DB is gone — proven by tests. (Reversible only at cost, so it
is gated on the git-only decision.)

### Phase 3 — Transactional outbox: entity ↔ job-queue

Reopens the decision the memory recorded as closed (closed because of _separate
files_, not domain law). Independent of the embeddings-fold; runs after Phase 1
regardless of which branch it took.

- Tests first: an entity write + its follow-up job enqueue commit atomically; a
  failure rolls back both (no orphan jobs, no lost jobs).
- Evaluate co-locating the job-queue table in the entity DB **for the outbox path
  only**, weighed against the deliberate package/domain boundary. Decision gate,
  document either way.
- If adopted: implement the transactional enqueue; remove the app-level
  compensation logic that covers the gap today.

**Exit:** a documented decision backed by the test; if adopted, the inconsistency
window is closed in code.

### Phase 4 — Roll remaining services + settle the sync topology

Only after 0–3 prove the engine on real workloads.

- Apply the Phase 0 swap pattern to `conversation-service` and `job-queue`
  (each ~2 files), tests-first per service.
- Record the final topology in the roadmap: git sync vs DB sync vs both, and which
  separate DB files participate in DB-level sync (entity DB yes; embedding DB
  local/server-side only unless in-browser semantic search is later wanted).

**Exit:** all shell services on a consistent driver strategy; sync topology
recorded.

## Non-goals

- No wholesale "one DB" consolidation. Service-level separation
  (`entity` / `conversation` / `runtime-state`) is domain-driven and survives;
  only the outbox and (conditionally) the embedding-DB fold are in scope.
- **Do not fold the embedding DB on _either_ engine if we keep the DB-sync/browser
  option open.** Sync is whole-DB on both libSQL and Turso (verified — no
  table-scoped sync), so a separate file is the only way to give embeddings an
  independent sync fate. The fold is viable only in a committed git-only world.
- No production cutover while the engine is beta. This plan validates and stages.

## Risks

- Beta engine: missing PRAGMA/SQLite behaviors we rely on (caps urgency; Phase 0
  is the cheap probe; sync-mechanics maturity is the Phase 1 probe).
- drizzle-kit-on-beta migration drift.
- Folding under a sync future: folding embeddings into the entity DB welds
  regenerable vectors to a whole-DB sync unit, forcing us to either ship them to
  every replica/browser or rely on experimental lazy page-loading. The Phase 1
  fork prevents this by only allowing the fold in the git-only branch.
