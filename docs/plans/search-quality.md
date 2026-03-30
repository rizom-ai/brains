# Plan: Search Quality Improvements

## Context

Search uses `all-MiniLM-L6-v2` embeddings with pure vector similarity (cosine distance). It works but misses exact keyword matches, returns too many low-relevance results, and uses a small embedding model.

## Current Architecture

- **Model**: `all-MiniLM-L6-v2` (384 dimensions, via fastembed/ONNX)
- **Storage**: libSQL vector extension (`vector_distance_cos`)
- **Search**: pure vector similarity, no keyword component
- **Threshold**: distance < 1.0 (very loose — returns almost everything)
- **Weights**: configurable per entity type (e.g., posts weighted higher than notes)
- **No reranking**: results ordered by raw cosine similarity

## Problems

1. **Keyword misses** — search for "TypeScript" might not find a post with "TypeScript" in the title if the embedding doesn't capture it strongly. Pure vector search optimizes for semantic meaning, not lexical match.
2. **Low precision** — threshold of 1.0 returns too many irrelevant results. The agent has to sift through noise.
3. **Small model** — MiniLM-L6-v2 is fast but trades quality for speed. Longer, nuanced content gets compressed into 384 dimensions.
4. **No reranking** — top-20 vector results aren't re-scored for the actual query. A result that's semantically similar but not actually relevant stays high.

## Improvements (ordered by impact/effort)

### 1. Tighten threshold + add minimum score

Lowest effort, immediate impact. Change `distance < 1.0` to `distance < 0.6` and filter results below a minimum weighted score.

### 2. Hybrid search (vector + keyword)

Add SQLite FTS5 (full-text search) alongside vector search. Combine scores:

```
final_score = α * vector_score + (1 - α) * keyword_score
```

- Vector search handles "posts about learning" (semantic)
- Keyword search handles "TypeScript" or "urging new institutions" (exact match)
- α = 0.7 (weight toward semantic, keyword as boost)

libSQL supports FTS5 natively. Create an FTS index on entity content + metadata title.

### 3. Better embedding model

Upgrade from `all-MiniLM-L6-v2` (384d) to a larger model. Options:

| Model                      | Dimensions | Speed  | Quality     | Size  |
| -------------------------- | ---------- | ------ | ----------- | ----- |
| all-MiniLM-L6-v2 (current) | 384        | Fast   | OK          | 23MB  |
| bge-small-en-v1.5          | 384        | Fast   | Good        | 33MB  |
| bge-base-en-v1.5           | 768        | Medium | Better      | 110MB |
| nomic-embed-text-v1.5      | 768        | Medium | Best (open) | 137MB |

Trade-off: larger model = better search but slower embedding generation and larger DB. For a personal brain with hundreds/thousands of entities, `bge-base-en-v1.5` is the sweet spot.

Requires: re-embedding all entities (one-time migration), updating vector column dimensions.

### 4. Reranking (cross-encoder)

After vector search returns top-20 candidates, re-score them with a cross-encoder that compares the query against each result directly. Much more accurate but slower (runs on each candidate, not precomputed).

Options:

- Local ONNX cross-encoder (e.g., `cross-encoder/ms-marco-MiniLM-L-6-v2`)
- Cloud API call (Cohere Rerank, Anthropic tool use)
- Only re-rank when result count > threshold

This is the local AI runtime territory — the reranker would run in the AI sidecar process.

## Steps

### Phase 0: Measure baseline (prerequisite)

Before changing anything, understand current behavior. Blind threshold changes risk silently dropping results the agent depends on — eval scores could _drop_ instead of improve.

1. **Distance distribution analysis** — query a real brain's DB to get the actual distance distribution of search results:

   ```sql
   -- What distances do current results actually have?
   SELECT
     ROUND(vector_distance_cos(e.embedding, vector32(?)), 2) as distance_bucket,
     COUNT(*) as count
   FROM embeddings e
   -- Use a representative set of queries the agent actually makes
   ```

   Key questions: What % of results fall in 0.0–0.4, 0.4–0.6, 0.6–0.8, 0.8–1.0? Where's the natural gap between relevant and irrelevant?

2. **Run eval baseline** — run full eval suite and record scores _before_ any changes. This is the number to beat.

   ```bash
   brain eval              # record pass rate, per-test results
   ```

3. **Identify search-dependent evals** — tag which eval test cases exercise search so we can measure impact precisely:
   - `system-search.yaml` (direct search)
   - `proactive-search.yaml` / `proactive-search-variations.yaml` (agent-initiated search)
   - Any test that implicitly triggers search (content references, "what have I written about...")

### Phase 1: Threshold + score tuning

Data-driven threshold choice based on Phase 0 analysis.

1. Pick threshold based on actual distance distribution — find the natural gap between relevant and irrelevant results (likely 0.5–0.7 range, but let data decide)
2. Add minimum weighted score filter
3. Run evals — pass rate must stay ≥ baseline. If it drops, threshold is too aggressive.
4. Test: search quality improves (fewer irrelevant results) without losing relevant ones

### Phase 2: Hybrid search

1. Create FTS5 virtual table on entity content + metadata title (Drizzle migration)
2. Keep FTS5 index in sync — update on entity create/update/delete in `EntityMutations`
3. Implement keyword search function in `EntitySearch`
4. Combine vector + keyword scores with configurable α:
   ```
   final_score = α * vector_score + (1 - α) * keyword_score
   ```
   Start with α = 0.7 (semantic-heavy), tune based on eval results.
5. Run evals — compare against Phase 1 baseline. Keyword-dependent queries ("TypeScript", exact titles) should improve.

### Phase 3: Better embedding model (optional — with [local AI runtime](./embedding-service.md))

1. Switch to `bge-base-en-v1.5` or `nomic-embed-text-v1.5`
2. Re-embed all entities (migration script)
3. Update vector column dimensions (384 → 768)
4. Test: semantic search quality improves on nuanced queries

### Phase 4: Reranking (optional — with [local AI runtime](./embedding-service.md))

1. Add cross-encoder reranker to AI runtime
2. Re-score top-N results for each search
3. Test: top results are more relevant

## Files affected

| Phase | Files | Nature                                                             |
| ----- | ----- | ------------------------------------------------------------------ |
| 0     | 0     | Analysis only — SQL queries on real DB + eval run                  |
| 1     | 1     | entity-search.ts threshold change (data-driven value)              |
| 2     | ~4    | FTS5 migration, entity-mutations sync, keyword search, score combo |
| 3     | ~3    | Model config, migration script, schema change                      |
| 4     | ~3    | Reranker integration, AI runtime                                   |

## Verification

Every phase must pass this gate before moving to the next:

1. **Eval pass rate ≥ baseline** — no regressions
2. **Search-specific evals stable or improved** — proactive search, system search
3. Manual spot checks:
   - Search for exact title → finds the entity (keyword match, Phase 2+)
   - Search for semantic concept → finds related entities (vector match)
   - Irrelevant results no longer in top-10
   - "What did I write about X?" consistently returns the right posts
