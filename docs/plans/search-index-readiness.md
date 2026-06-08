# Plan: Search index readiness

## Problem

A playbook gate's judge received no KB excerpts and correctly returned `met: false` from
incomplete material. The trigger: the precompiled Rover eval DB has the `anchor-profile`
entity and FTS rows but **zero embeddings**, and `entityService.search()` inner-joins
embeddings (`entity-search.ts:230`), with FTS only a re-rank boost on the vector-matched
set (`entity-search.ts:208-211`). So a pre-existing seed fact was invisible to retrieval.

The real defect is not that search is wrong. It is that the **semantic index was
incomplete and was queried before it was ready**. Embeddings are our retrieval contract;
the fix is to keep that index complete and to not depend on it before it is ready — not to
teach search to answer from outside it.

## Principle

`search()` answers **only** from the semantic index, and stays that way. We make the index
**complete** (backfill) and we **wait for readiness** before depending on it.

### The rejected path (and why)

Loosening `search()` to also return FTS-only / unembedded rows would redefine search
product-wide to answer from outside the semantic index, in order to mask a transient
startup state — and it would erase the signal that an entity is unembedded (a real problem
we want surfaced, not hidden). Rejected. The `innerJoin` stays.

The one case that seems to need it — a fact created seconds ago, embedding still pending,
checked by a gate — does **not** need a search escape hatch. The playbook records
entity-event **evidence** directly into the run, so freshly-created facts reach the judge
through the evidence channel; pre-existing seed KB reaches it through the (complete, ready)
semantic index. Two channels, clean split, no lexical fallback required.

## How it functions

Invariant: every embeddable entity has a **current** embedding
(`embedding.content_hash == entity.contentHash`). Build it; wait for it; never query around it.

### 1. Completeness — boot backfill

The write path already does the right thing per-entity: create/update persists the entity
immediately, then enqueues a `shell:embedding` job (`entity-mutations.ts:513`), skipped when
`entityConfig.embeddable === false` (`:497`); the handler is staleness-aware — it skips when
the content hash has drifted — and emits `entity:embedding:ready` on success
(`embeddingJobHandler.ts:129,179`).

What is missing is the **bulk/seed** case. Add a generic entity-service backfill that runs
during shell initialization, **after entity types are registered** (so `embeddable` config
is known): scan embeddable entities and enqueue the same `shell:embedding` job for each where
no embedding row exists **or** `embedding.content_hash != entity.contentHash`. No
eval-specific and no playbook-specific logic — this is an entity-service operation.

Dedup is the load-bearing detail, and it belongs at the **shared** enqueue seam, not on
backfill alone. The write path currently does **not** dedupe — `enqueueEmbeddingJob` mints a
fresh `rootJobId` and enqueues unconditionally (`entity-mutations.ts:510-525`); redundant jobs
are safe today only because the handler skips drifted hashes and `storeEmbedding` upserts, so
they waste API calls rather than corrupt the index. Backfill would amplify that into a storm.
The queue already supports keyed dedup (`JobDeduplicator`, `deduplicationStrategy` /
`deduplicationKey`); the embedding path just never opted in. Add the dedup key at
`enqueueEmbeddingJob` — keyed per entity + content (e.g.
`embedding:${entityType}:${entityId}:${contentHash}`) — so the write path **and** backfill both
collapse duplicate / in-flight work. Use `deduplication: "coalesce"`, because the current queue
semantics dedupe pending **and processing** jobs for `coalesce`, while `skip` only dedupes
pending jobs. Do not rely on `getStatusByEntityId` as the correctness primitive: it filters only
by `data.id`, not `entityType` or `contentHash`, and can collide across entity types or stale
content. The explicit `deduplicationKey` is the contract.

Result: a KB loaded from seed content (the eval DB, or a fresh import) converges to fully
embedded on its own.

### 2. Readiness — a first-class primitive

The index is ready when both conditions hold:

1. there are no pending/processing embedding jobs; and
2. the missing/stale embeddable entity count is zero.

The job-queue exposes active jobs via `getActiveJobs(["shell:embedding"])` and queue stats via
`getStats().{pending, processing}` (`job-queue/src/types.ts:150-166`), but active-job emptiness
is not sufficient by itself: failed jobs, skipped backfill, or a stale prebuilt pair can leave
no active work while embeddings are still missing.

Add `entityService.awaitIndexReady({ timeoutMs })` / `isIndexReady()` over the job queue plus
a missing/stale scan — **bounded**, returning diagnostics (active job types/counts,
missing/stale counts, and recent failures if available) on timeout, never waiting forever.
Entity-service owns the question "is my semantic index ready"; the job-queue is the mechanism.
(`entity:embedding:ready` is available if a reactive variant is ever preferred over polling.)

**Failed-terminal handling.** An embedding job that has exhausted its retries is _terminal_,
not pending — it must not count toward the missing/stale total, or one poison entity (content
that always fails to embed) would keep the index "not ready" forever and, via the turn gate,
hold **all** chat indefinitely. So readiness has a degraded-success state: no active jobs and no
missing/stale embeddable entities _except those whose embedding job has terminally failed_ means
`ready: true, degraded: true`, with `failedEmbeddings` diagnostics. Chat can proceed, but ops and
eval diagnostics can see that retrieval is incomplete for specific poisoned entities. A terminal
failure must never be silently folded into "still warming" or hidden as normal readiness.

**Latched per-turn check.** `isIndexReady()` sits on the hot path — every turn at the central
boundary calls it — so it must be O(1), not a full missing/stale scan. Model readiness as a
**sticky latch** meaning "the initial index build completed": the expensive scan lives in
`awaitIndexReady` (startup, eval boot, builder), which sets the latch once achieved, and
`isIndexReady()` just reads it. Because boot itself does not block, production still needs a
background readiness task: after initialization registers entity types and backfill has had a
chance to enqueue work, run `awaitIndexReady()` in the background and set the latch (or degraded
latch) when complete. Without that setter path, the central turn gate could hold chat forever.
The latch is one-way for the normal lifecycle — a later background write being embedded in
steady state does **not** flip chat back to not-ready (that is the async-write design; the new
fact reaches gates via evidence and search via eventual consistency). Only an operation that
genuinely invalidates the index (bulk re-import / reindex) resets the latch and re-runs
`awaitIndexReady`.

### 3. Readiness at the point of use

Booting does **not** block on readiness — that would couple uptime to the embedding service
and stall cold starts. Instead, the consumers that depend on the index check it when they run:

- **Turn gate (generic, central chat boundary).** A chat turn is one round of agent chat
  (`IAgentService.chat`) — the unit every interface (web-chat, Discord, CLI, MCP) drives, not
  a playbook concept. Put the readiness check at one central boundary around agent chat
  (for example the public agent service / `IAgentService.chat` entrypoint), not separately in
  each concrete interface, so all interfaces and eval paths get the same behavior. If the
  index is still warming, return a graceful "still getting set up, one moment" and let the
  client retry, rather than answering from a half-built index. This protects **all**
  retrieval-backed chat (plain Q&A included), not just playbook gates. The warming window is
  short — seed-scale embedding is seconds, and a warm restart is ready immediately.
- **Three-state gate outcome (playbooks).** Inside a turn, a gate resolves to one of three
  states, never two: **not-ready** → hold/retry (do not run the judge yet), **not-met** →
  block honestly, **met** → advance. Flow: `if (!indexReady) hold; else judge`. This keeps
  `GoalCheck` pure — the judge only ever sees ready material — and keeps readiness out of the
  judge. not-ready must never collapse into not-met.

Only the three-state gate logic is playbooks-specific. The readiness primitive and the turn
gate are generic KB/chat infrastructure.

### 4. Search unchanged

`search()` keeps the embeddings `innerJoin`. The absent / pending / ready distinction the
first draft wanted to express _inside search results_ lives in the readiness primitive (2)
instead — it is a readiness signal, not a change to what search returns.

## Wiring

- **Eval runner**: after `bootEvalApp` and any startup sync/import/backfill work has had a
  chance to enqueue embeddings, `awaitIndexReady` before running test cases; on timeout, fail
  with diagnostics in verbose output.
- **Eval DB builder — prebuild a consistent (entities + embeddings) pair.** Today the builder
  saves `brain.db` only, so evals boot with entities but no matching embeddings and must
  regenerate them every run (embedding-API cost, latency, and timing nondeterminism on every
  boot). The builder should instead: build entities → run backfill → `awaitIndexReady` (wait
  for the embedding jobs) → checkpoint the embedding DB → save **both** `brain.db` and
  `embeddings.db` into `eval-content/` as a pinned pair. The copy-on-boot path already exists
  (`eval-environment.ts:75`); the gap is the builder _producing_ the embeddings file. This
  makes eval boot fast, offline, and deterministic — the prebuilt pair is the **primary path**,
  and runtime backfill + readiness become the **safety net** for a missing or stale pair
  (entity content changed without a rebuild → `content_hash` mismatch → re-embed → wait).
  Limitation to note, not solve here: `content_hash` tracks content drift, not embedding-model
  drift — a model change requires rebuilding the pair and is out of scope.
- **Production**: boot does **not** block. Backfill at boot keeps steady-state KBs fully
  embedded (it finds nothing to do once converged); a background readiness task runs after
  init/backfill, sets the ready or ready-degraded latch, and exposes diagnostics for terminal
  failures. The **turn gate** holds chat with a warming response during the brief cold-index
  window. Readiness gating here is **required and graceful**, not optional — without it,
  first-boot onboarding gates and general retrieval chat would answer from a cold index.

## Phases (thin vertical, tests folded in)

1. **Readiness primitive.** `entityService.awaitIndexReady` / `isIndexReady` over
   `getActiveJobs(["shell:embedding"])` plus a missing/stale embeddable scan; terminal
   (retry-exhausted) failures are excluded from the missing count and surfaced as
   `ready: true, degraded: true` diagnostics; `isIndexReady()` is backed by a sticky latch set
   by `awaitIndexReady()` / the production background readiness task. _Unit:_ ready when no
   active jobs and no missing/stale; not-ready while a job is pending; not-ready when no jobs
   are active but missing/stale rows remain; **ready-degraded despite a terminally-failed
   entity** (counted as degraded, not pending); `isIndexReady()` stays ready after a
   steady-state write enqueues a new job; bounded timeout returns diagnostics.
2. **Boot backfill.** Enqueue `shell:embedding` jobs for missing/stale embeddable entities
   after type registration; respect `embeddable: false`. Add `deduplication: "coalesce"` and a
   stable per-entity/content `deduplicationKey` at the shared `enqueueEmbeddingJob` seam so the
   write path and backfill both collapse pending/processing duplicates — backfill does not get
   its own dedup path and does not use `getStatusByEntityId` for correctness. _Unit:_ missing →
   queued; stale (hash mismatch) → queued; current → skipped; non-embeddable → skipped; a
   second enqueue for in-flight equivalent work is collapsed, not duplicated.
3. **Point-of-use gating.** Turn gate at the central chat boundary:
   `if (!isIndexReady())` return the warming response. Three-state gate outcome in playbooks:
   not-ready → hold, not-met → block, met → advance. _Unit:_ turn held while warming and runs
   once ready; gate holds (never calls the judge) while not ready; gate blocks on not-met;
   advances on met.
4. **Eval determinism.** Eval runner: backfill + `awaitIndexReady` post-boot, pre-cases, with
   timeout diagnostics. Eval DB builder: wait + checkpoint + save the `brain.db`/`embeddings.db`
   pair. _Test:_ a prebuilt pair boots ready with no regeneration; an eval DB missing
   `embeddings.db` self-heals via backfill and search returns the seed entity.
5. **Restore focused GoalCheck evals.** KB satisfies goal → `met: true`; KB lacks goal →
   `met: false`. Then retry the Rover onboarding product eval.

## Do not

- Do not add a lexical/FTS retrieval path to `search()` to mask missing embeddings.
- Do not add playbooks-specific KB fallback, or dump arbitrary entities into GoalCheck material.
- Do not let indexing state distort a gate verdict — not-ready is its own state: never fake
  `met`, and never report not-met because the index is still warming.
- Do not block process boot on readiness — gate at the point of use (turn / gate), never at startup.
- Do not hardcode `anchor-profile` or Rover onboarding semantics.
- Do not wait forever for readiness — bounded, with diagnostics.
