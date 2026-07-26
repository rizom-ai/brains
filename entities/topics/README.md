# Topics Plugin

Derived topic extraction and canonicalization for markdown-backed brain content.

## Overview

`@brains/topics` maintains `topic` entities derived from other entity types such as posts, notes, links, or decks. It extracts candidate topics with AI, canonicalizes them against existing topics, and can automatically merge near-duplicates into a single topic entity.

Topics are normal entities:

- durable content lives in markdown
- editable fields live in frontmatter/body

## What it does

- **Batch topic extraction** from configured source entity types
- **Auto-extraction on entity changes** after initial sync completes
- **Token-budget-aware batching** to reduce one-call-per-entity extraction overhead
- **Canonicalization against existing topics** so new extractions reuse established titles
- **Configurable auto-merge** with similarity scoring and merge synthesis
- **Replace-all rebuilds** for operators who want to delete and regenerate all topics from current source content

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
- `autoMerge` stays configurable; rebuilds do not force it on globally.

## Runtime behavior

### Incremental extraction

When `enableAutoExtraction` is enabled, the plugin waits until initial sync finishes, then subscribes to entity create/update events for registered projection sources except blacklisted types.

Each qualifying entity queues a topic extraction job with the configured relevance threshold and merge settings.

### Batch projection

The `topic:project` job re-extracts topics from all default-open, non-blacklisted published source entities using batched prompts.

This is what normal batch `system_extract` uses:

```json
{
  "entityType": "topic"
}
```

### Replace-all rebuild

The rebuild projection deletes all existing topics, then re-derives them from the current source entities.

Use the shared system tool:

```json
{
  "entityType": "topic",
  "mode": "rebuild"
}
```

This requires explicit confirmation.

## Shared system tool surface

The topics package does **not** expose its own CRUD or extract tools.

Use the shared system tools instead:

- `system_extract` — queue topic projection/rebuild jobs
- `system_get` / `system_list` / `system_search` — read topics
- `system_update` / `system_delete` — edit or remove topics
- `system_create` — manual topic creation if you really want it

## Merge behavior

When `autoMerge` is enabled, each extracted topic is checked against existing topics.

If a strong candidate is found:

1. similarity heuristics identify the likely canonical topic
2. a merge synthesis step produces the merged title/content
3. the incoming topic is absorbed into the canonical one

If no candidate clears the threshold, a new topic entity is created.

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

- Existing topic titles are fed back into extraction prompts to reduce noisy near-duplicates.
- Merge detection uses title/keyword similarity heuristics before synthesis.

### Dependency boundary follow-up

- `@brains/ui-library` and `@brains/utils` are direct workspace dependencies today.
- Before publishing this package externally, either publish those packages too or expose the needed stable APIs through `@brains/plugins`.

## Refactor notes

The package is split by responsibility so `src/index.ts` only wires plugin lifecycle pieces together. Projection, eval, dashboard, presentation, and topic-domain behavior live in package-local modules under `src/lib/`.

## Key files

- `src/index.ts` — plugin registration and package wiring
- `src/lib/constants.ts` — package-local IDs and job constants
- `src/lib/topic-projection.ts` — derive/rebuild projection flow
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
