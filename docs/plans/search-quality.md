# Plan: Search Quality — Pre-Release

## Context

Search uses `all-MiniLM-L6-v2` embeddings (384d) with pure vector similarity, stored in `brain.db` alongside entities. Before v0.1.0, we need to make two structural decisions that are hard to change after release:

1. **Embedding model** — 384d vs 768d vectors. Changing dimensions post-release means every user re-embeds.
2. **Database layout** — embeddings in `brain.db` vs separate `embeddings.db`. Splitting post-release is a migration.

## Pre-Release (blocking v0.1.0)

### Phase 1: Separate embedding database

Embeddings are derived data — regenerable from entity content. Coupling them to the entity DB creates problems:

- Can't swap embedding models without migrating entity DB
- Can't rebuild embeddings without touching source of truth
- DB bloats with vector data (384 floats × N entities)
- Eval DBs carry unnecessary embedding weight

**Changes:**

1. Create `embeddings.db` alongside `brain.db`
2. Move `embeddings` table out of entity DB
3. `EntitySearch` queries across both databases via SQLite `ATTACH`
4. Embedding job handler writes to `embeddings.db`
5. Shell config gets `embeddingDatabase` URL field
6. First startup migration: move existing embeddings from `brain.db` to `embeddings.db`

**Files:** entity-search.ts, entity-mutations.ts, shellConfig.ts, migration script, eval tooling

### Phase 2: Embedding model decision

Pick the model that ships with v0.1.0. Options:

| Model                      | Dimensions | Speed  | Quality     | Size  |
| -------------------------- | ---------- | ------ | ----------- | ----- |
| all-MiniLM-L6-v2 (current) | 384        | Fast   | OK          | 23MB  |
| bge-small-en-v1.5          | 384        | Fast   | Good        | 33MB  |
| bge-base-en-v1.5           | 768        | Medium | Better      | 110MB |
| nomic-embed-text-v1.5      | 768        | Medium | Best (open) | 137MB |

Decision criteria:

- Bundle size (npm package includes ONNX model)
- Cold start time (ONNX model load)
- Search quality on eval content
- Memory usage at runtime

If we stay with 384d, `bge-small-en-v1.5` is a free quality upgrade (same dimensions, better model). If we go 768d, `bge-base-en-v1.5` is the pragmatic choice.

**Recommendation:** `bge-small-en-v1.5` for v0.1.0. Same 384 dimensions (no schema change), better quality, similar speed. Upgrade to 768d post-release when the separate embedding DB makes model swaps cheap.

**Changes:** fastembed model config, re-build eval DB with new embeddings

## Post-Release (non-breaking improvements)

### Threshold tuning

Tighten `distance < 1.0` to a data-driven threshold. Run distance distribution analysis on eval DB, find the natural gap between relevant and irrelevant results.

No schema change — just a number in entity-search.ts.

### Hybrid search (vector + FTS5)

Add SQLite FTS5 full-text search alongside vector search:

```
final_score = α * vector_score + (1 - α) * keyword_score
```

Additive — new FTS5 table, no changes to existing schema. Fixes keyword misses ("TypeScript" exact match).

### Better embedding model (768d)

With separate embedding DB, upgrading to `bge-base-en-v1.5` (768d) is a clean operation:

1. Update model config
2. Drop and recreate `embeddings.db`
3. Re-embed all entities (background job)

No entity DB migration. No user intervention beyond restart.

### Reranking

Cross-encoder re-scoring of top-N results. Runtime-only, no schema change.

## Verification

1. Eval pass rate ≥ current baseline after each change
2. Search-specific evals (system_search, proactive search) stable or improved
3. Separate embedding DB: brain boots clean, search works, embeddings regenerate on model change
