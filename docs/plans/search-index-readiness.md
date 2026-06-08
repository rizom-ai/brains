# Plan: Search index readiness for playbook gates

## Problem

`entityService.search()` currently requires an embedding row. Entities without embeddings are invisible, even if they exist and are present in FTS. This can falsely block playbook gates and any other runtime that depends on KB search.

This surfaced while adding focused playbook `GoalCheck` evals: the Rover eval content has an `anchor-profile` entity and FTS rows, but the precompiled eval DB has zero embeddings. Because search inner-joins `entities` with `embeddings`, the judge saw no KB excerpts and correctly returned `met: false` from incomplete material.

This is not a playbooks fallback problem. It is a KB search/index-readiness contract problem.

## Required behavior

Search should distinguish:

- **entity absent**: no entity/content exists.
- **entity present but embeddings pending/missing**: entity exists and may match lexically.
- **semantic search ready**: embeddings exist and vector search can rank it.

A user starting onboarding before embeddings finish should not have an existing KB fact disappear from the gate checker just because the semantic index is incomplete.

## Phase 1 — Diagnose and lock with tests

Add entity-service tests proving the current bug:

1. Entity exists in DB + FTS, no embedding row.
2. `search("Alex Chen")` should return it.
3. Search should still respect:
   - `visibilityScope`
   - `types`
   - `excludeTypes`
   - `includeUngenerated`
   - `limit/offset`

This test should fail first.

## Phase 2 — Fix search semantics

Change `EntitySearch.search()` so it does not inner-join embeddings as the only path.

Preferred shape:

- Run vector search for embedded entities.
- Run FTS/lexical search for matching entities, including unembedded ones.
- Merge/dedupe results.
- Score:
  - vector + FTS matches highest;
  - vector-only next;
  - FTS-only valid but lower/confidence-marked by score.
- Keep filters identical across both paths.

No playbooks-specific logic.

## Phase 3 — Backfill missing/stale embeddings

Add generic entity-service backfill:

- After DB init and entity type registration, enqueue embedding jobs for embeddable entities where:
  - no embedding row exists, or
  - embedding `content_hash !== entity.contentHash`.
- Respect entity type config `embeddable: false`.
- Use job deduplication so boot does not create duplicate embedding storms.

Add tests:

- missing embedding queues job;
- stale embedding queues job;
- current embedding does not queue;
- non-embeddable type is skipped.

## Phase 4 — Eval DB isolation

Fix eval boot:

- Override `embeddingDatabase` to a temp path alongside:
  - entity DB;
  - jobs DB;
  - conversation DB.
- If eval content includes `embeddings.db`, copy it.
- If not, rely on Phase 2 search fallback plus Phase 3 backfill.

Add test for `bootEvalApp` config shape if practical.

## Phase 5 — Readiness for evals

Before running eval test cases, wait for startup/indexing work to settle enough for deterministic search.

Add a bounded wait in eval runner:

- poll active jobs;
- wait until no pending/processing jobs for indexing/import-critical job types, or timeout with diagnostic;
- include diagnostics in verbose output if timeout.

Do not wait forever.

## Phase 6 — Restore focused GoalCheck evals

Only after search/index readiness is fixed:

- Add focused playbooks plugin evals:
  - KB satisfies goal → `met: true`;
  - KB lacks goal → `met: false`.
- Then retry the Rover onboarding product eval.

## Do not do

- Do not add playbooks-specific KB fallback.
- Do not dump arbitrary entities into GoalCheck material.
- Do not make gates pass because indexing is pending.
- Do not hardcode `anchor-profile` or Rover onboarding semantics.
