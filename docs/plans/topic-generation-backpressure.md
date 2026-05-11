# Topic Generation Backpressure Plan

## Status

Active. Slice 0 (projection-cycle guard), Slice 1 (per-topic processing fanout), and Slice 4 (batch-extractor DB access) have shipped. Slice 2 (source-change backpressure), Slice 3 (skill-derivation debounce), and Slice 5 (eval parity, formerly the topic-auto-merge plan) remain.

Relevant prior work:

- `f175daac5 feat(topics): Phase 2b — batch extractor + deriveAll() wiring`
- `d203511db feat(topics): trigger batch deriveAll on initial sync`
- `f88e0ce10 fix(derivation): backpressure initial topic and skill jobs`
- `7eb41713f fix(topics): guard projection source cycles` — Slice 0
- `0fa831f1b fix(topics): batch topic processing` — Slices 1 and 4

What survived: initial sync and rebuild use batched extraction; topic-derived entity types (`topic`, `skill`) opt out of projection sourcing via `projectionSource: false`; extracted topics are processed through a batch handler and shared in-memory topic index.

## Problem

Topic generation can fan out badly during content bursts and can also form derived-entity feedback loops.

Current source-change flow:

1. each source entity create/update enqueues a topic projection job
2. each projection job fetches one entity
3. each extraction lists existing topic titles
4. each extraction makes one LLM call
5. extracted topics are processed by a batch handler
6. each topic mutation can trigger downstream skill derivation
7. `summary` is intentionally allowed as a topic source (durable proxy for ephemeral conversations); other durable projections such as `decision` and `action-item` may also be valid topic sources when they are terminal projections from ephemeral/raw inputs, but need review before opt-in

For `N` source changes and `K` extracted topics over `M` existing topics, this can still become:

- `N` LLM extraction calls
- `N` existing-topic list queries
- repeated downstream skill derivation during one logical topic generation wave

The classic feedback cycle (`topic -> skill -> topic -> skill`) was the motivation for Slice 0 and is no longer a risk in Relay's default config — see Slice 0 below. The per-topic processing fanout (`K` topic processing jobs and `K * M` merge-candidate scans) was addressed by Slices 1 and 4.

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

## Slice 0: break projection cycles (shipped)

Shipped in `7eb41713f`. Cycle-breaking had to land before any backpressure work, because backpressure reduces volume but doesn't fix a logical cycle.

What shipped:

- A generic `projectionSource?: boolean` flag on `EntityTypeConfig`, defaulting to `true`.
- `projectionSource: false` set on `topic` (in `entities/topics/src/index.ts`) and `skill` (in `plugins/agent-discovery/src/plugins/skill-plugin.ts`).
- `TopicsPlugin.shouldProcessEntityType` now requires both `includeEntityTypes` membership and a non-`false` `projectionSource`.
- Relay's `topics.includeEntityTypes` no longer contains `skill`; the topics-config test asserts this.
- A new `EntityService.getEntityTypeConfig` accessor exposes the registered config so cross-plugin checks like the topics cycle guard can read it without reaching into the registry.

Longer-term rule established: entity types own whether they can serve as source material for downstream projections. Topics should extract from primary human/source content and terminal durable proxies for ephemeral inputs, not from entities whose own derivation depends on topics.

`agent`, `decision`, and `action-item` are not currently in Relay's topic source list; whether to opt them in remains an open call.

## Slice 1: prove and fix per-topic processing fanout (shipped)

Shipped in `0fa831f1b`.

What shipped:

- `TopicExtractionHandler` enqueues one `process-batch` job for multiple extracted topics instead of N `process-single` jobs.
- `TopicProcessingBatchHandler` preloads existing topics once and runs merge-candidate scoring against an in-memory index.
- The in-memory index is updated after each create/merge so later topics in the same batch see earlier mutations.
- `process-single` is no longer registered as a runtime job handler; old queued `process-single` jobs may be orphaned/failed rather than drained.

### Acceptance

- Unit tests cover batch processing behavior, including the "later topic in batch sees earlier merge" case.
- `bun run typecheck`, targeted tests, `bun run lint` pass for `entities/topics`.
- `bun run eval --skip-llm-judge` passes for `entities/topics`.
- Rover eval passes after the slice.

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

## Slice 4: optimize batch extractor DB access (shipped)

Shipped in `0fa831f1b`.

What shipped:

- A shared in-memory `TopicIndex` backs both `process-batch` and `extractTopicsBatched`.
- `extractTopicsBatched` preloads existing topics once per run instead of checking the DB per extracted topic.
- `createTopicFromPreloadedIndex` trusts the preloaded index while still recovering from concurrent insert races by fetching the existing topic.
- The in-memory index reflects creates and merges performed earlier in the same run.

### Acceptance

- Same gates as Slice 1 (`bun run typecheck`, targeted tests, `bun run lint`, `bun run eval --skip-llm-judge`, Rover eval).
- A burst-extraction test shows existing-topic queries scale with batches, not with extracted topics.

## Slice 5: eval parity for topic merge

Folded in from the former `topic-auto-merge` plan. The `topicMergeJobDataSchema` cleanup is already done; one deliverable remains.

`checkMergeSimilarity` in `entities/topics/src/lib/eval-handlers.ts` still uses a simplified lowercase-title-match (lines 177-179). The same file already has a sibling handler, `detectMergeCandidate`, that uses the real `topicService.findMergeCandidate` path — so the work is "consolidate `checkMergeSimilarity` through that real path" rather than "build the real path from scratch."

### Acceptance

- evals cover the same decision path the runtime uses
- gray-zone and no-merge cases stay explicit
- runtime and eval behavior stop drifting

User-facing docs and examples should keep describing the current bounded-alias merge model; that's ongoing maintenance, not a discrete deliverable.

## Risks

- Coalescing without durable dirty-source tracking can drop work across restarts.
- Batch merge behavior can differ from single-topic behavior if in-memory indexes are not updated after each mutation.
- Too much batching can delay topic visibility if delay windows are too large.
- Downstream skill derivation changes may cross entity package boundaries.
- Removing topic-derived entity types from topic sources may change topic coverage for Relay; evals should confirm whether the lost coverage was useful or just recursive noise.

## Suggested worktrees

1. ~~`fix/topics-cycle-guard` — Slice 0~~ (shipped in `7eb41713f`)
2. ~~`fix/topics-process-batch` — Slices 1 and 4~~ (shipped in `0fa831f1b`)
3. `fix/topics-source-backpressure` — Slice 2
4. `fix/skill-derivation-debounce` — Slice 3
5. `fix/topic-merge-eval-parity` — Slice 5

Keep each slice reviewed and checked in before continuing.
