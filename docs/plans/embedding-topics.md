# Plan: Embedding-Based Topic Derivation

## Context

Topic extraction currently costs 1 LLM call per entity (via `context.ai.generate()`). With hundreds of entities, this is slow and expensive. Every entity create/update triggers a job that sends the full content to the LLM for topic analysis.

Meanwhile, every entity already gets a 384-dim embedding (all-MiniLM-L6-v2, local, ~5ms) stored in the database with a vector index. The infrastructure for cosine similarity search already exists and is used by `system_search`. The agent-directory skills plan describes the same pattern: "embedding-based clustering, only use AI for naming/describing clusters."

**Goal:** Replace the per-entity LLM call with an embedding similarity lookup against existing topics. LLM is only used to label genuinely new topics (one call per new topic, not per entity).

---

## How It Works

**Current flow** (per entity):

```
entity:created → extract job → LLM analyzes full content → returns topics → create/merge
```

**New flow** (per entity):

```
entity:created → extract job → search(entity.content, {types: ["topic"]}) → assign to matches
                                                                          → no match? → LLM labels ONE new topic
```

The `search()` call generates a local embedding (~5ms) and finds similar topics via SQL `vector_distance_cos`. No API call needed for assignment.

---

## Steps

### 1. Add config fields

**File:** `entities/topics/src/schemas/config.ts`

```typescript
topicAssignmentThreshold: z.number().min(0).max(1).default(0.6),
maxTopicsPerEntity: z.number().int().positive().default(3),
```

- `topicAssignmentThreshold` — minimum similarity score to assign an entity to a topic (lower than `mergeSimilarityThreshold` since we're matching entity→topic, not topic→topic)
- `maxTopicsPerEntity` — cap on how many topics one entity can be assigned to

### 2. Create `TopicAssigner`

**New file:** `entities/topics/src/lib/topic-assigner.ts`

Two methods:

**`assignToTopics(entity, config)`** — the cheap path:

1. `entityService.search(entity.content, { types: ["topic"], limit: maxTopicsPerEntity })`
2. Filter by `topicAssignmentThreshold`
3. Return matching topics with scores

**`labelNewTopic(entity, context)`** — the expensive path (only when no match):

1. `context.ai.generate()` with a simplified prompt (one topic, not 1-3)
2. Returns title, content, keywords for the new topic

### 3. Rewrite `TopicExtractionHandler`

**File:** `entities/topics/src/handlers/topic-extraction-handler.ts`

Replace:

```
TopicExtractor.extractFromEntity(entity)  →  [ExtractedTopic]  →  enqueue process-single jobs
```

With:

```
TopicAssigner.assignToTopics(entity)
  → matches found  →  topicService.updateTopic() to add source (no LLM, no extra job)
  → no match       →  TopicAssigner.labelNewTopic()  →  topicService.createTopic()
```

This eliminates the `process-single` job queue step for the common case (assignment to existing topic). The staleness check (`contentHash`) and progress reporting stay the same.

### 4. Simplify the labeling template

**File:** `entities/topics/src/templates/extraction-template.ts`

The current prompt asks for 1-3 topics from an entity. The new prompt asks for exactly 1 topic since the entity didn't match anything existing. Can reuse the existing template and take only the first result, or create a simpler single-topic variant.

### 5. Update `deriveAll()` for batch mode

**File:** `entities/topics/src/index.ts`

Current `deriveAll()` loops all entities and enqueues extract jobs. New behavior:

1. Same loop, but each job uses the embedding-based assignment
2. Most entities match existing topics → fast, no LLM
3. Unmatched entities → LLM creates new topics (batched)
4. Optional: identify orphaned topics (no remaining sources) and flag them

### 6. Keep backward compat

`TopicProcessingHandler` stays registered for in-flight `process-single` jobs from the old system. Can be removed in a follow-up once all old jobs drain. `TopicExtractor` stays as an unused file until cleanup.

### 7. Update tests

- `topic-extraction-handler.test.ts` → test embedding-based assignment
- New `topic-assigner.test.ts` → unit tests for assign + label
- Existing `plugin.test.ts` → validate new config fields

---

## What Doesn't Change

- Topic entity schema (title, content, keywords, sources)
- TopicService (createTopic, updateTopic, mergeTopics, searchTopics)
- TopicAdapter (markdown serialization)
- Topic datasources and site templates (topic-list, topic-detail)
- Event subscriptions (entity:created, entity:updated, sync:initial:completed)
- Insights (topic-distribution)

---

## Cost Comparison

| Scenario                             | Current (LLM)  | New (Embedding)                             |
| ------------------------------------ | -------------- | ------------------------------------------- |
| Entity added, matches existing topic | ~2s (LLM call) | ~10ms (local embed + SQL)                   |
| Entity added, new topic needed       | ~2s (LLM call) | ~2s (LLM for labeling)                      |
| deriveAll() on 100 entities          | ~100 LLM calls | ~100 searches + ~5 LLM calls for new topics |
| Cold start (0 topics, 50 entities)   | 50 LLM calls   | 50 LLM calls (same — all create new topics) |

The win is proportional to topic coverage. Once 10-20 topics exist, most entities match and the LLM is rarely called.

---

## Verification

1. `bun run typecheck` — new config fields, TopicAssigner types
2. `bun test entities/topics/` — all tests pass
3. Manual: create a blog post, verify it gets assigned to an existing topic without LLM call
4. Manual: create a post about a completely new subject, verify a new topic is created
5. `deriveAll()` via `system_extract topic` — verify batch mode works
6. Eval: topic-related test cases still pass

---

## Files Summary

| Change            | File                                                       |
| ----------------- | ---------------------------------------------------------- |
| New config fields | `entities/topics/src/schemas/config.ts`                    |
| New assigner      | `entities/topics/src/lib/topic-assigner.ts` (new)          |
| Rewrite handler   | `entities/topics/src/handlers/topic-extraction-handler.ts` |
| Update plugin     | `entities/topics/src/index.ts` (job data, deriveAll)       |
| Simplify template | `entities/topics/src/templates/extraction-template.ts`     |
| Tests             | `entities/topics/test/` (update + new)                     |
