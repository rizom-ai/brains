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

### Phase 1: Threshold + score tuning

1. Tighten vector distance threshold from 1.0 to 0.6
2. Add minimum weighted score filter
3. Test: search quality improves (fewer irrelevant results)

### Phase 2: Hybrid search

1. Create FTS5 index on entity content + metadata.title
2. Implement keyword search function
3. Combine vector + keyword scores with configurable α
4. Test: exact keyword queries now return expected results

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

| Phase | Files | Nature                                            |
| ----- | ----- | ------------------------------------------------- |
| 1     | 1     | entity-search.ts threshold change                 |
| 2     | ~3    | FTS5 migration, keyword search, score combination |
| 3     | ~3    | Model config, migration script, schema change     |
| 4     | ~3    | Reranker integration, AI runtime                  |

## Verification

1. Search for exact title → finds the entity (keyword match)
2. Search for semantic concept → finds related entities (vector match)
3. Irrelevant results no longer in top-10
4. "What did I write about X?" consistently returns the right posts
