# Plan: Topic Auto-Merge

## Context

The current topics plugin is too noisy on `yeehaa.io/topics` because it creates near-duplicate topics with slightly different titles, for example:

- `Human-AI Collaboration`
- `AI Collaboration`
- `Human-Agent Collaboration`
- `Human-Bot Collaboration`
- `Agency in Human-AI Collaboration`

and:

- `Fragmentation and Digital Pluralism`
- `Fragmentation and Multiplicity`
- `Fragmentation as Opportunity`
- `Fragmentation in Digital Ecosystems`

Today, deduplication is mostly title/slug-based. That is too weak for reusable knowledge domains.

## Goal

Create a real auto-merge pipeline that:

- detects when extracted topics belong to the same reusable domain
- synthesizes a better merged topic instead of just keeping one raw variant
- preserves discoverability through aliases and merged keywords
- reduces long-term topic sprawl without collapsing genuinely different topics

## Non-goals

- Perfect ontology design in v1
- Full hierarchical taxonomy
- Embedding-only clustering across the entire corpus
- Rewriting all existing topics in one risky migration

## Design

### Two-step merge model

Topic auto-merge should treat merging as two separate problems:

1. **Detection** — should two topics merge?
2. **Synthesis** — what should the merged topic become?

### Detection

Use a layered approach, cheapest first:

1. **Deterministic normalization**
   - lowercase
   - strip punctuation
   - normalize weak framing words (`as`, `in`, `for`, `through`)
   - simple synonym folding (`bot` -> `agent` in collaboration contexts)

2. **Token and keyword overlap**
   - title token overlap
   - keyword overlap
   - title-to-keyword cross overlap

3. **Embeddings for fuzzy similarity**
   - only for candidates that survive cheap filtering
   - used as a semantic similarity score, not as the sole decision maker

4. **Small LLM merge judge for ambiguous cases**
   - only when the similarity score lands in a gray zone
   - narrow prompt: “Are these the same reusable knowledge domain?”

### Synthesis

If two topics should merge, use a small LLM pass to produce:

- canonical title
- merged summary/content
- merged keywords
- alias titles

This is important because merge is not just “keep A or B”; it should preserve nuance from both topics while creating one stable reusable topic.

## Canonicalization rules

When synthesizing a merged topic, prefer:

- shorter titles
- broader reusable concepts
- less rhetorical framing
- existing stable titles over new one-off phrasings

Examples:

- `Human-Agent Collaboration` + `Human-Bot Collaboration` + `Agency in Human-AI Collaboration`
  -> `Human-AI Collaboration`
- `Fragmentation as Opportunity` + `Fragmentation and Multiplicity`
  -> `Fragmentation`
- `Regenerative and Decentralized Design` + `Regenerative Design`
  -> likely `Regenerative Design`

## Data model changes

Keep merge state minimal. Store only bounded aliases in topic metadata:

```ts
metadata: {
  aliases?: string[];
}
```

Notes:

- `aliases` keeps old variant titles searchable
- old merged titles become aliases on the canonical topic
- do **not** add `mergedFrom` for now — it adds provenance/history surface without enough immediate value
- keep aliases bounded and deduped (for example max 5)
- keep aliases in metadata, not frontmatter, because they are system-maintained canonicalization state rather than authored topic content

## Proposed flow

### New extraction path

1. Extract candidate topic from content
2. Search existing topics for merge candidates
3. Score candidates with deterministic rules
4. Optionally use embeddings for shortlisted candidates
5. If ambiguous, call narrow LLM merge judge
6. If mergeable:
   - run LLM synthesis pass
   - update canonical topic
   - append aliases and merged keywords
   - do not create a duplicate
7. If not mergeable:
   - create a new topic

## Implementation sketch

### Phase 1: Detection service

Add a topic merge service in `entities/topics/src/lib/`:

- `findMergeCandidate(topic)`
- `scoreTopicSimilarity(a, b)`
- `normalizeTopicTitle(title)`

Wire detection into the `process()` method in `topic-processing-handler.ts`, which currently calls `createTopic()` directly without checking for merge candidates. The handler already accepts `autoMerge` and `mergeSimilarityThreshold` in its schema — it just ignores them.

Primary files:

- `entities/topics/src/lib/topic-service.ts`
- `entities/topics/src/handlers/topic-processing-handler.ts` (insertion point: `process()` method)
- new helper files under `entities/topics/src/lib/`

### Phase 2: Synthesis pass + metadata support

Synthesis and minimal metadata must land together. The synthesis pass may produce aliases, but that output cannot be persisted until the topic schema supports it.

**Synthesis**: add a merge template and synthesis step:

- input: canonical topic + incoming topic
- output: merged title/content/keywords/aliases

This should replace or extend the existing `TopicService.mergeTopics()` method (`topic-service.ts:155-213`), which currently does naive content concatenation with `---` separators and keyword dedup. That method is adequate for manual merges but not for auto-merge synthesis.

**Metadata**: extend `topicMetadataSchema` only for:

- `aliases`

Do **not** add `mergedFrom` or `mergeVersion` in this phase. Keep the durable state minimal and focused on search/canonicalization.

Update the topic adapter only as needed to preserve metadata roundtrip behavior without surfacing aliases as frontmatter-authored content.

Note: `topicMergeJobDataSchema` already exists in `entities/topics/src/schemas/topic.ts:56-62` with `topicIds` and `similarityThreshold` fields, but no job handler is registered for it. This schema should be used or cleaned up as part of this phase.

Primary files:

- `entities/topics/src/templates/` (new merge synthesis template)
- `entities/topics/src/lib/topic-service.ts` (replace/extend `mergeTopics()`)
- `entities/topics/src/schemas/topic.ts` (extend `topicMetadataSchema`)
- `entities/topics/src/lib/topic-adapter.ts` (only if needed for metadata roundtrip)

### Phase 3: Safe backfill

Add an opt-in maintenance command/eval to reprocess existing topic sets in batches.
Do not silently rewrite all existing topics during normal startup.

## Evals

### Existing test cases

Four eval test cases already exist under `entities/topics/evals/test-cases/`:

| Test case                      | File                                              | What it tests                                                                |
| ------------------------------ | ------------------------------------------------- | ---------------------------------------------------------------------------- |
| Collaboration variants merge   | `sequential-human-ai-collaboration-grouping.yaml` | Two collaboration variant articles → 1 topic titled "Human-AI Collaboration" |
| Fragmentation variants merge   | `sequential-fragmentation-grouping.yaml`          | Two fragmentation variant articles → 1 topic titled "Fragmentation"          |
| Similar content triggers merge | `merge-similarity.yaml`                           | React Hooks variants → `wouldMerge: true`                                    |
| Different topics don't merge   | `no-merge-different-topics.yaml`                  | Kubernetes vs Watercolor → `wouldMerge: false`                               |

**Caveat**: these evals currently pass because of prompt-side canonicalization, not because of a detection pipeline. The `checkMergeSimilarity` eval handler is a stub that compares lowercased titles. Once Phase 1 lands, the evals need to test the detection service directly — not just end-to-end extraction that happens to produce canonical titles.

### Still needed

Add or extend evals to prove:

1. **Detection-specific tests** — call the detection service with pre-existing topics and verify merge/no-merge decisions independently of extraction

2. **Nuance is preserved after merge**
   - merged content contains ideas from both inputs
   - aliases preserve old titles
   - alias list stays bounded and deduped

3. **Gray-zone cases are stable**
   - ambiguous topics only merge when judge agrees

## Verification

Success looks like:

- noticeably fewer near-duplicate topics on `yeehaa.io/topics`
- canonical titles stabilize over time instead of drifting
- merged topics contain richer summaries than either source alone
- old variant titles remain discoverable through aliases/search
- alias metadata stays small and does not grow without bound
- unrelated topics still remain separate

## Rollout

1. Land Phase 1 (detection) behind existing `autoMerge` config flag
2. Land Phase 2 (synthesis + metadata) once candidate matching is trustworthy
3. Land Phase 3 (backfill) with an explicit maintenance run
4. Re-run topic evals and inspect `yeehaa.io/topics`

## Current state vs target

### What exists

| Layer                         | Location                                                     | Status                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Config schema                 | `entities/topics/src/schemas/config.ts`                      | Done — `autoMerge` (bool, default true) and `mergeSimilarityThreshold` (0-1, default 0.85)                                             |
| Config plumbing               | `topic-extraction-handler.ts`, `topic-processing-handler.ts` | Wired but dead — both handlers accept `autoMerge` and `mergeSimilarityThreshold` in their schemas, extract them, but never act on them |
| Prompt-side canonicalization  | `entities/topics/src/lib/extraction-prompt.ts:47-57`         | Done — rules for preferring umbrella topics, collapsing near-duplicates, avoiding rhetorical framing                                   |
| Manual merge method           | `entities/topics/src/lib/topic-service.ts:155-213`           | Done — `mergeTopics(topicIds, targetId)` with naive concatenation; adequate for manual use, not for auto-merge synthesis               |
| Merge job schema              | `entities/topics/src/schemas/topic.ts:56-62`                 | Dead code — `topicMergeJobDataSchema` defined but no handler registered                                                                |
| Merge similarity eval handler | `entities/topics/src/index.ts:288-335`                       | Stub — `checkMergeSimilarity` compares lowercased titles, not real similarity scoring                                                  |
| Eval test cases               | `entities/topics/evals/test-cases/`                          | 4 cases exist (see Evals section), pass via prompt canonicalization not detection                                                      |
| Topic metadata                | `entities/topics/src/schemas/topic.ts`                       | Empty — `topicMetadataSchema = z.object({})`, no `aliases`/`mergedFrom`/`mergeVersion`                                                 |

### What's missing

| Phase                   | What needs to happen                                                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Detection            | `findMergeCandidate`, `scoreTopicSimilarity`, `normalizeTopicTitle` + wiring into `topic-processing-handler.ts` `process()` method           |
| 2. Synthesis + metadata | Merge synthesis template, upgrade `mergeTopics()`, extend `topicMetadataSchema` with bounded `aliases`, update `TopicAdapter` only if needed |
| 3. Backfill             | Opt-in batch reprocessing command                                                                                                            |
| Evals                   | Detection-specific tests that bypass extraction; nuance-preservation assertions; gray-zone stability                                         |

This plan covers making `autoMerge` real as a detection + synthesis pipeline.
