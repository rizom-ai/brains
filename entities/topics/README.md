# Topics Plugin

Derived topic extraction and canonicalization for markdown-backed brain content.

## Overview

`@brains/topics` maintains the best-supported `topic` entities across sources such as posts, notes, links, or books. It records per-source AI votes and selects a bounded topic set, replacing a weak topic when a challenger has clearly stronger support.

Topics are normal entities:

- durable content lives in markdown
- editable fields live in frontmatter/body

## What it does

- **Incremental extraction**: only sources with missing or stale votes cost AI calls
- **Bounded, resumable jobs**: at most ten AI calls, up to four sources per extraction call
- **Ranked selection**: role-weighted relevance determines topic support
- **Canonicalization**: prompts include current topics and leading challengers
- **Replacement**: a challenger must exceed the weakest topic's support by more than 25%
- **Legacy batch extraction, merge, and rebuild helpers** remain available to the eval harness

## Configuration

```ts
interface TopicsPluginConfig {
  includeEntityTypes?: string[]; // Deprecated allow-list. Default: ["*"]
  excludeEntityTypes?: string[]; // Entity types to omit. Default: []
  minRelevanceScore?: number; // Default: 0.5
  createRelevanceThreshold?: number; // Default: 0.7
  reinforceRelevanceThreshold?: number; // Default: 0.5
  sourceRolePolicies?: Partial<
    Record<ProjectionSourceRole, TopicSourceRolePolicy>
  >;
  sourceRoleOverrides?: Record<string, ProjectionSourceRole>;
  mergeSimilarityThreshold?: number; // Default: 0.85
  autoMerge?: boolean; // Default: true
  extractableStatuses?: string[]; // Default: ["published"]
  enableAutoExtraction?: boolean; // Default: true
}

type ProjectionSourceRole =
  "canonical" | "primary" | "secondary" | "supporting" | "ambient" | "excluded";

interface TopicSourceRolePolicy {
  weight: number;
  canMint: boolean;
}
```

Default role policies:

- `canonical`: weight `1`, can mint
- `primary`: weight `1`, can mint
- `secondary`: weight `0.8`, can mint
- `supporting`: weight `0.55`, reinforce/merge only
- `ambient`: weight `0.35`, reinforce/merge only
- `excluded`: weight `0`, ignored

### Notes

- By default, all registered projection-source entity types are processed (`includeEntityTypes: ["*"]`).
- Use `excludeEntityTypes` as the normal blacklist when a brain should omit a source type.
- `includeEntityTypes` remains as a deprecated compatibility allow-list for constrained evals or unusual instances.
- Entity types declare their default derivation authority via `projectionSourceRole`; the topics plugin maps roles to mint/reinforce behavior instead of knowing about package-specific entity names.
- Brain and instance configs can adapt authority with `excludeEntityTypes`, `sourceRoleOverrides`, and `sourceRolePolicies`.
- Legacy `sourceWeights` and `mintableEntityTypes` remain supported for compatibility, but role-based policy is preferred.
- Topic entities themselves are never reprocessed as sources.
- Entities with `status: published` and entities without a status field are extractable by default. Brains can opt in additional statuses such as `draft`.
- `autoMerge` and `reinforceRelevanceThreshold` apply to legacy batch/eval extraction, not automatic ranked selection.
- `maxEntitiesPerBatch` defaults to four; automatic extraction clamps it to four.
- `topicSoftCeilingSourceRatio` defaults to five; the topic cap is `min(24, max(5, ceil(eligibleSources / ratio)))`.
- `extractionVisibility` defaults to `public` and bounds both source reads and derived topic visibility.

## Runtime behavior

When `enableAutoExtraction` is enabled, source create/update/delete events and the shell's startup-content-settled signal enqueue a deduplicated `topics:extract` job. Execution subscriptions also observe imports in the worker process.

Votes are runtime working data in `topics.votes`, keyed by source type and ID, with the source's content hash. Jobs scan sources in pages and keep only keys and hashes; full content is loaded for the sources in each prompt. Jobs remove ineligible/deleted votes, extract stale sources, checkpoint each batch, and enqueue a successor while extraction or selection remains. A title not copied exactly from the listed topics is dropped. A source whose call failed or went unanswered is retried alone; after three counted failures it receives an empty vote until its content changes. Failures count only in a job where the provider answered at least one call, so an outage fails the job instead. A durable lease serializes overlapping jobs and expires after an abandoned attempt. All AI calls receive the job's abort signal.

Selection sums role weight × relevance for each slug. Below the cap, the best qualified challenger enters; at the cap it replaces the weakest topic only with a greater-than-25% lead, and only once every source has been read, so existing topics are not displaced before their votes exist. Description synthesis shares the ten-call job budget and uses up to eight strongest proposals. Retained topics are not rewritten, and new IDs remain visibility-scoped title slugs. Old projection ownership is released once per brain without deleting topic content; the topic ATProto projection is unchanged.

There is no manual extract/rebuild tool.

## Shared system tool surface

The topics package does **not** expose its own CRUD or extraction tools.

Use the shared read and mutation tools for direct topic access:

- `system_get` / `system_list` / `system_search` — read topics
- `system_update` / `system_delete` — edit or remove topics
- `system_create` — create a topic manually

## Merge behavior

Legacy batch/eval extraction uses embedding distance to find merge candidates when `autoMerge` is enabled. AI synthesis then merges a candidate or judges it distinct. Automatic ranked extraction does not run semantic merges: votes canonicalize against listed titles, and support drives selection.

## Topic entity shape

### Frontmatter / authored fields

```yaml
---
title: Human-AI Collaboration
---
```

The markdown body contains the topic summary/content. Metadata is empty for
new topics; unknown legacy fields on existing entities are stripped on read.

## Implementation notes

- Current topics and leading challenger titles are fed back into per-source vote prompts.
- Extraction does not write topic content; selection alone creates descriptions and deletes replaced topics.

### Dependency boundary follow-up

- `@brains/ui-library` and `@brains/utils` are direct workspace dependencies today.
- Before publishing this package externally, either publish those packages too or expose the needed stable APIs through `@brains/plugins`.

## Refactor notes

The package is split by responsibility so `src/index.ts` only wires plugin lifecycle pieces together. Projection, eval, dashboard, presentation, and topic-domain behavior live in package-local modules under `src/lib/`.

## Key files

- `src/index.ts` — plugin registration and package wiring
- `src/lib/constants.ts` — package-local IDs
- `src/lib/ranked-topic-extraction.ts` — bounded extraction jobs and durable checkpoints
- `src/lib/topic-selection.ts` — role-weighted tally and replacement policy
- `src/lib/topic-source-policy.ts` — shared source eligibility and role policy
- `src/schemas/votes.ts` — persisted votes and validated AI responses
- `src/lib/topic-presenter.ts` — shared topic presentation/projection helpers
- `src/lib/dashboard-widget.ts` — dashboard widget registration
- `src/lib/eval-handlers.ts` — eval harness handlers
- `src/lib/topic-extractor.ts` — single-entity extraction
- `src/lib/topic-batch-extractor.ts` — token-budget-aware batch extraction
- `src/lib/topic-merge-synthesizer.ts` — AI merge/distinct verdicts and synthesis
- `src/lib/topic-service.ts` — topic CRUD + merge helpers

## Validation

```bash
cd entities/topics
bun test
bun run typecheck
```

For evals:

```bash
cd entities/topics
bun run eval
```
