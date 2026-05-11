# Topic Generation Backpressure Plan

## Status

Active. Slice 0 (projection-cycle guard), Slice 1 (per-topic processing fanout), Slice 2 (source-change backpressure), Slice 3 (skill-derivation debounce), and Slice 4 (batch-extractor DB access) have shipped. Slice 5 (eval parity, formerly the topic-auto-merge plan) is implemented in `fix/topic-merge-eval-parity`.

Relevant prior work:

- `f175daac5 feat(topics): Phase 2b — batch extractor + deriveAll() wiring`
- `d203511db feat(topics): trigger batch deriveAll on initial sync`
- `f88e0ce10 fix(derivation): backpressure initial topic and skill jobs`
- `7eb41713f fix(topics): guard projection source cycles` — Slice 0
- `0fa831f1b fix(topics): batch topic processing` — Slices 1 and 4

What survived: initial sync and rebuild use batched extraction; topic-derived entity types (`topic`, `skill`) opt out of projection sourcing via `projectionSource: false`; extracted topics are processed through a batch handler and shared in-memory topic index; source-change events enqueue one delayed batch projection job instead of one extraction job per source.

## Problem

Topic generation can fan out badly during content bursts and can also form derived-entity feedback loops.

Current source-change flow after Slice 2:

1. each source entity create/update records a dirty source reference in the topics plugin
2. source-change events enqueue a delayed batch projection job using one batch-level dedupe key
3. the batch job drains dirty source references, fetches fresh entities, and skips missing, stale, or unpublished sources
4. eligible sources are passed to `extractTopicsBatched`
5. each topic mutation can trigger downstream skill derivation
6. `summary` is intentionally allowed as a topic source (durable proxy for ephemeral conversations); other durable projections such as `decision` and `action-item` may also be valid topic sources when they are terminal projections from ephemeral/raw inputs, but need review before opt-in

The classic feedback cycle (`topic -> skill -> topic -> skill`) was the motivation for Slice 0 and is no longer a risk in Relay's default config — see Slice 0 below. The per-topic processing fanout (`K` topic processing jobs and `K * M` merge-candidate scans) was addressed by Slices 1 and 4. The source-change fanout (`N` extraction jobs and `N` existing-topic list queries during bursts) was addressed by Slice 2.

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

## Slice 2: source-change batching/backpressure (implemented)

Implemented in `fix/topics-source-backpressure`.

What is implemented:

- Source-change events record dirty source references (`entityType`, `id`, `contentHash`) in a package-local `TopicSourceBatchBuffer`.
- Repeated source changes for the same entity keep only the latest content hash.
- Source-change events enqueue `mode: "source-batch"` with one batch-level dedupe key (`topics-source-batch`) and a configurable `sourceChangeBatchDelayMs` delay.
- The batch job drains dirty refs, fetches fresh entities, skips stale hashes, missing entities, and unpublished entities, then calls `extractTopicsBatched` for the eligible set.
- Source-batch extraction applies the configured `minRelevanceScore`.

Acceptance covered:

- Source-change events use a single batch-level dedupe key instead of per-source extraction keys.
- Stale content hashes are skipped when the batch job runs.
- Unpublished source entities are skipped when the batch job runs.
- Initial sync gating still prevents source-change extraction before initial sync completes.

Tradeoff: dirty source refs are in memory. This keeps Slice 2 package-local and avoids adding a cross-package "changed since last extraction" query, but dirty refs can be lost across process restart while a delayed source-batch job is pending. A future durability slice can replace the buffer with a small durable queue or add a cheap updated-since query.

## Slice 3: downstream skill derivation debounce (shipped)

Shipped in `6b434b281` and merged via `7189fe001`.

What is implemented:

- Topic batch extraction emits one `topics:batch-completed` event after a run creates topics.
- Runtime `process-batch` topic processing emits one `topics:batch-completed` event after a batch creates or merges topics.
- Skill derivation now listens to `topics:batch-completed` rather than raw `entity:created` / `entity:updated` topic mutations.
- Skill derivation still uses the existing projection job and `skill-derivation:topic-change` coalescing key, preserving initial-sync gating.

Acceptance covered:

- Topic batch extraction emits one completion event for a changed batch and no event when nothing changes.
- Runtime topic processing emits one completion event for a changed batch.
- Skills enqueue after `topics:batch-completed` once initial sync has been observed.
- Raw topic entity changes no longer enqueue skill derivation directly.

This crosses topics and agent-discovery package boundaries and is intentionally isolated from Slice 2.

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

## Slice 5: eval parity for topic merge (implemented)

Folded in from the former `topic-auto-merge` plan. The `topicMergeJobDataSchema` cleanup is already done.

What is implemented:

- `checkMergeSimilarity` now seeds extracted topics from the first source and evaluates extracted topics from the second source through the same `TopicIndex.findMergeCandidate` decision path used by runtime batch topic processing.
- `checkMergeSimilarity` accepts an optional threshold and returns merge-candidate details in addition to the existing `matchingTitles` / `wouldMerge` fields.
- A threshold-boundary eval keeps the gray-zone no-merge case explicit.

### Acceptance covered

- evals cover the same merge-candidate decision path the runtime uses
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
3. ~~`fix/topics-source-backpressure` — Slice 2~~ (shipped in `0c675abb8`)
4. ~~`fix/skill-derivation-debounce` — Slice 3~~ (shipped in `7189fe001`)
5. `fix/topic-merge-eval-parity` — Slice 5 (implemented, pending merge)

Keep each slice reviewed and checked in before continuing.
