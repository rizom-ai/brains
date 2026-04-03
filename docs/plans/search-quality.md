# Plan: Search & Embeddings — Pre-Release

## Context

Search uses `all-MiniLM-L6-v2` embeddings (384d) via fastembed/ONNX, bundled in-process. This creates three problems:

1. **Native deps in bundle** — ONNX can't compile into a standalone binary, bloats the npm package, causes install issues
2. **Low quality embeddings** — 384d MiniLM is the smallest model. Misses nuanced content, keyword-heavy queries underperform
3. **Schema lock-in** — embeddings stored in `brain.db` alongside entities. Changing model dimensions post-release means migrating every user's DB

## Approach: Online Embeddings + Separate DB

Replace local ONNX with an online embedding API (OpenAI `text-embedding-3-small`). Remove fastembed/ONNX from the bundle entirely.

**Why online embeddings for v0.1.0:**

- `AI_API_KEY` already works — same key for text gen and embeddings when using OpenAI
- 1536d embeddings, vastly better quality than 384d MiniLM
- No native deps in `@rizom/brain` bundle
- Cost: ~$0.02 per million tokens. A brain with 500 entities ≈ $0.001 to embed everything
- Local/offline embeddings via sidecar is post-release (see [Local AI Runtime](./embedding-service.md))

**Why separate embedding DB:**

- Embeddings are derived data — regenerable from entity content
- Model swaps = drop `embeddings.db`, re-embed. No entity DB migration
- Smaller `brain.db` backups
- Eval DBs don't bloat with vector data

## Pre-Release Phases

### Phase 1: Separate embedding database

Move the `embeddings` table out of `brain.db` into `embeddings.db`.

1. Shell config gets `embeddingDatabase` URL field
2. Create `embeddings.db` on boot
3. `EntitySearch` queries across both databases via SQLite `ATTACH`
4. Embedding job handler writes to `embeddings.db`
5. First startup migration: move existing embeddings from `brain.db`
6. Update eval tooling to handle separate DB

**Files:** entity-search.ts, embedding-service.ts, shellConfig.ts, migration, eval tooling

### Phase 2: Online embedding provider

Replace fastembed/ONNX with OpenAI embeddings API.

1. `EmbeddingService` interface: `embed(text: string): Promise<number[]>`
2. `OnlineEmbeddingProvider`: calls OpenAI `text-embedding-3-small` (1536d)
3. `LocalEmbeddingProvider`: wraps current fastembed (kept for dev/offline, not bundled)
4. Provider selection from config: `ai.embeddingProvider: "online" | "local"`
5. Default: `"online"` — uses `AI_API_KEY`
6. Update vector column dimensions: 384 → 1536
7. Re-embed on model change (background job on boot)
8. Remove fastembed + ONNX from `@rizom/brain` optionalDependencies

**Files:** embedding-service.ts, online-embedding-provider.ts, shellConfig.ts, package.json

### Phase 3: FTS5 hybrid search

Add SQLite full-text search alongside vector search. Ship the schema from day one — adding FTS tables post-release is a migration.

1. Create FTS5 virtual table on entity content + title (Drizzle migration)
2. Keep FTS5 index in sync on entity create/update/delete
3. Keyword search function in `EntitySearch`
4. Combined scoring: `final = α × vector + (1-α) × keyword`, α = 0.7
5. Eval: keyword queries ("TypeScript", exact titles) should improve

**Files:** entity-search.ts, entity-mutations.ts, migration

### Phase 4: Threshold tuning

Data-driven threshold based on actual distance distributions with the new 1536d embeddings.

1. Distance distribution analysis on eval DB
2. Pick threshold from natural gap between relevant/irrelevant
3. Add minimum score filter
4. Eval: pass rate ≥ baseline, fewer irrelevant results

**Files:** entity-search.ts (one number)

## Post-Release

### Local AI runtime (sidecar)

Move all AI/ML into a separate process. Brain talks to it over HTTP. Enables offline embeddings, local LLMs, shared gateway for hosted rovers.

See [Local AI Runtime plan](./embedding-service.md) for full design.

### Reranking

Cross-encoder re-scoring of top-N results. Runtime-only, no schema change.

## Model Comparison

| Model                         | Dimensions | Quality | Source | Cost           |
| ----------------------------- | ---------- | ------- | ------ | -------------- |
| all-MiniLM-L6-v2 (current)    | 384        | OK      | Local  | Free           |
| bge-small-en-v1.5             | 384        | Good    | Local  | Free           |
| OpenAI text-embedding-3-small | 1536       | Great   | Online | $0.02/M tokens |
| OpenAI text-embedding-3-large | 3072       | Best    | Online | $0.13/M tokens |

`text-embedding-3-small` is the sweet spot: 4x the dimensions of MiniLM, negligible cost, no native deps.

## Verification

Each phase gates on:

1. Eval pass rate ≥ baseline
2. Search-specific evals stable or improved
3. `brain start` → embeddings generated via online API
4. Separate embedding DB: boots clean, search works, model swap = drop + re-embed
5. FTS5: "TypeScript" exact match returns the TypeScript post
