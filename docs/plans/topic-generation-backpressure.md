# Topic Generation Backpressure Plan

## Status

Draft. Projection-cycle guards and batch topic processing are implemented. Source-change extraction and downstream skill derivation still need backpressure.

Relevant prior work:

- `f175daac5 feat(topics): Phase 2b — batch extractor + deriveAll() wiring`
- `d203511db feat(topics): trigger batch deriveAll on initial sync`
- `f88e0ce10 fix(derivation): backpressure initial topic and skill jobs`

What survived: initial sync and rebuild use batched extraction.

What still needs work: source-change extraction batching and downstream skill derivation backpressure.

## Problem

Topic generation can fan out badly during content bursts and can also form derived-entity feedback loops.

Current source-change flow:

1. each source entity create/update enqueues a topic projection job
2. each projection job fetches one entity
3. each extraction lists existing topic titles
4. each extraction makes one LLM call
5. each extracted topic enqueues or runs per-topic processing
6. each topic mutation can trigger downstream skill derivation
7. derived entities such as `skill` or `summary` may be included as topic sources and feed the loop again

For `N` source changes and `K` extracted topics over `M` existing topics, this can become:

- `N` LLM extraction calls
- `N` existing-topic list queries
- `K` topic processing jobs
- `K * M` merge-candidate scans
- repeated downstream skill derivation during one logical topic generation wave
- feedback cycles such as `topic -> skill -> topic -> skill`

Known cycle risks:

- Relay currently includes `skill` in `topics.includeEntityTypes`, while skill derivation listens to topic changes. This creates a direct `topic -> skill -> topic` loop.
- Relay includes `summary`; this is intentional because conversations are ephemeral and summaries are the durable proxy for conversation memory. `summary -> topic` is not itself a bad cycle.
- The problematic chain is `summary -> topic -> skill -> topic` when `skill` is also allowed as a topic source.
- Other durable projections such as `decision` and `action-item` may also be valid topic sources when they are terminal projections from ephemeral/raw inputs. They should be reviewed for whether they depend on topics before being blocked.

## Goals

- Break derived-entity feedback loops before optimizing fanout.
- Preserve batch extraction for initial sync and rebuild.
- Add backpressure for source-change bursts.
- Process extracted topics in batches instead of one job per extracted topic.
- Avoid repeated downstream skill derivation during a single topic generation wave.
- Keep changes reviewable and incremental.

## Non-goals

- Redesign the entire derived entity projection framework in the first slice.
- Change topic extraction prompt semantics.
- Reintroduce durable topic source tracking in topic metadata.
- Combine topics, skills, and job-queue refactors in one large PR.

## Slice 0: break projection cycles

Status: complete in `fix(topics): merge cycle guard`.

Backpressure reduces volume, but it does not fix a logical cycle.

### Tests

Add tests that prove:

- entity types can declare whether they are eligible as projection source material
- topics does not extract from entity types whose config opts out of projection sourcing
- Relay's topics config no longer creates a `topic -> skill -> topic` loop
- `summary` remains allowed as a durable proxy for ephemeral conversations
- if an opted-out entity type is intentionally used as a topic source, it must opt in explicitly and have a documented cycle guard

### Implementation

Preferred small fix:

1. Add a generic entity type config flag, tentatively `projectionSource?: boolean`, defaulting to `true`.
2. Set `projectionSource: false` on entity types that should not feed other projections, starting with `topic` and `skill`.
3. Keep `summary` eligible (`projectionSource: true` or omitted) because it is the durable proxy for ephemeral conversations.
4. Update topics so `shouldProcessEntityType` requires both:
   - the type is listed in `includeEntityTypes`
   - the registered entity type config does not set `projectionSource: false`
5. Remove `skill` from Relay's topic source list unless there is a strong product reason to keep it.
6. Revisit `agent`, `decision`, and `action-item` in Relay's topic source list and either keep them as terminal durable projections or set `projectionSource: false` if they depend on topics.

Longer-term rule: entity types own whether they can serve as source material for downstream projections. Topics should extract from primary human/source content and terminal durable proxies for ephemeral inputs, not from entities whose own derivation depends on topics.

### Acceptance

- No default config creates `topic -> skill -> topic` cycles.
- `summary -> topic` remains allowed when summaries are the durable proxy for ephemeral conversations.
- Unit tests cover `projectionSource: false` and opt-in behavior.
- Relay and Rover evals still pass.

## Slice 1: prove and fix per-topic processing fanout

Status: complete in `fix/topics-process-batch`.

Package-local after Slice 0.

### Tests

Add tests that prove:

- `TopicExtractionHandler` enqueues one `process-batch` job for multiple extracted topics instead of N `process-single` jobs.
- The batch handler preloads existing topics exactly once and runs all merge-candidate scoring against that in-memory set.
- The in-memory index is updated after each create/merge so later topics in the same batch see earlier mutations.
- Existing `topics:process-single` behavior remains supported for compatibility while queued jobs drain.

### Implementation

Add a new batch handler, for example `topics:process-batch`.

Flow:

1. `TopicExtractionHandler` extracts topics from one source entity.
2. It enqueues one `process-batch` job containing the extracted topic list and source info.
3. The batch handler preloads existing topics once into an in-memory index.
4. For each extracted topic it runs `findMergeCandidate`-equivalent similarity scoring against the in-memory index (no per-topic DB scan).
5. It creates/updates/merges topics in a bounded pass, updating the in-memory index after each mutation.

Keep `topics:process-single` registered temporarily so old queued jobs and focused tests still work. Removal milestone: drop the handler one release after Slice 1 ships, once production queues have drained.

### Acceptance

- Unit tests cover batch processing behavior, including the "later topic in batch sees earlier merge" case.
- `bun run typecheck`, targeted tests, `bun run lint` pass for `entities/topics`.
- `bun run eval --skip-llm-judge` passes for `entities/topics`.
- Rover eval still passes after the slice.

## Slice 2: source-change batching/backpressure

After Slice 1 is reviewed and checked in.

### Tests

Add tests that prove:

- a burst of source entity changes enqueues one batch/source job rather than one extraction job per source
- stale content hashes are skipped when the batch job runs
- unpublished source entities are skipped
- initial sync gating still prevents source-change extraction before initial sync completes

### Implementation options

Preferred package-local design:

1. Source-change events record dirty source references:
   - `entityType`
   - `id`
   - `contentHash`
2. Source-change events enqueue one delayed/coalesced `topics:source-batch` job.
3. The source-batch job drains dirty source references.
4. It fetches fresh entities, filters stale hashes and unpublished entities, then calls `extractTopicsBatched`.

Avoid the shortcut of running full `deriveAll` on every source change. That fixes fanout but over-extracts too much.

### Open design question

Where should dirty source references live?

Options:

- in-memory buffer: simplest, but loses dirty refs across restart
- job data: durable enough per coalesced job, but hard to merge on coalesce with the current queue API
- small durable queue/entity: most correct, more work
- coalesced job with no per-source payload: enqueue a single `topics:source-batch` job using the existing `deduplication: "coalesce"` support (already used for `topics-initial-derivation`). The handler queries on wake for entities updated since the last topic-extraction wave (tracked via a small marker — last-run timestamp or a per-entity `lastExtractedHash`). Avoids both the merge-on-coalesce problem and the restart-loss problem; the cost is needing a "what changed since" query path

Preferred: the coalesced-job-with-no-payload option, assuming a cheap "what changed since" query is available. Fall back to in-memory for alpha if that query is awkward to add — document the tradeoff either way.

## Slice 3: downstream skill derivation debounce

Topic mutations currently trigger skill derivation. During a topic generation wave, this can run multiple times.

Options:

1. Add a real debounce strategy to the job queue.
2. Make skill derivation preserve/extend `delayMs` when coalescing.
3. Emit a single topic-batch-completed event from the Slice 1 batch handler and have skills derive from that instead of every topic mutation.

Preferred: option 3. It dovetails with the Slice 1 batch handler (which already has the natural "wave done" boundary), keeps the change localized to one event emission plus one subscriber rewrite, and avoids changing job queue semantics. Options 1 and 2 are fallbacks if option 3 turns out to require too much subscriber rework.

This likely crosses package boundaries, so keep it separate from the topics package-local fix.

## Slice 4: optimize batch extractor DB access

Status: complete in `fix/topics-process-batch`.

Folded into Slice 1's worktree — the in-memory topic index built for `process-batch` is the same index `extractTopicsBatched` needs. Splitting them risks building two near-identical indexes.

Before this slice, `extractTopicsBatched` still did per-topic DB checks:

- it called `getTopic(slug)`
- then `createTopic()`, which checked existence again

### Tests

- `extractTopicsBatched` issues one existing-topic preload per run, not one per extracted topic.
- A create helper that trusts a preloaded index still surfaces (or recovers from) a real race error if the slug appears between preload and insert.
- The in-memory index reflects creates and merges performed earlier in the same run.

### Implementation

- Preload existing topic IDs/slugs once per batch or per run, sharing the index with the Slice 1 `process-batch` handler where the call sites overlap.
- Add a create helper that can trust the preloaded index but still handles the race-error path from a concurrent insert.
- Update the in-memory index after each create/merge.

### Acceptance

- Same gates as Slice 1 (`bun run typecheck`, targeted tests, `bun run lint`, `bun run eval --skip-llm-judge`, Rover eval).
- A burst-extraction test shows existing-topic queries scale with batches, not with extracted topics.

## Risks

- Coalescing without durable dirty-source tracking can drop work across restarts.
- Batch merge behavior can differ from single-topic behavior if in-memory indexes are not updated after each mutation.
- Too much batching can delay topic visibility if delay windows are too large.
- Downstream skill derivation changes may cross entity package boundaries.
- Removing topic-derived entity types from topic sources may change topic coverage for Relay; evals should confirm whether the lost coverage was useful or just recursive noise.

## Suggested worktrees

1. `fix/topics-cycle-guard` — Slice 0
2. `fix/topics-process-batch` — Slices 1 and 4 (shared in-memory topic index)
3. `fix/topics-source-backpressure` — Slice 2
4. `fix/skill-derivation-debounce` — Slice 3

Keep each slice reviewed and checked in before continuing.
