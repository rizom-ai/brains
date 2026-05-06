# Topics Plugin

Derived topic extraction and canonicalization for markdown-backed brain content.

## Overview

`@brains/topics` maintains `topic` entities derived from other entity types such as posts, notes, links, or decks. It extracts candidate topics with AI, canonicalizes them against existing topics, and can automatically merge near-duplicates into a single topic entity.

Topics are normal entities:

- durable content lives in markdown
- editable fields live in frontmatter/body
- system-maintained aliases live in metadata only

## What it does

- **Batch topic extraction** from configured source entity types
- **Auto-extraction on entity changes** after initial sync completes
- **Token-budget-aware batching** to reduce one-call-per-entity extraction overhead
- **Canonicalization against existing topics** so new extractions reuse established titles
- **Configurable auto-merge** with similarity scoring and merge synthesis
- **Bounded aliases** stored in metadata only (`max 5`)
- **Replace-all rebuilds** for operators who want to delete and regenerate all topics from current source content

## Configuration

```ts
interface TopicsPluginConfig {
  includeEntityTypes?: string[]; // Entity types to extract from
  minRelevanceScore?: number; // Default: 0.5
  mergeSimilarityThreshold?: number; // Default: 0.85
  autoMerge?: boolean; // Default: true
  extractableStatuses?: string[]; // Default: ["published"]
  enableAutoExtraction?: boolean; // Default: true
}
```

### Notes

- Only entity types listed in `includeEntityTypes` are processed.
- Topic entities themselves are never reprocessed as sources.
- Entities with `status: published` and entities without a status field are extractable by default. Brains can opt in additional statuses such as `draft`.
- `autoMerge` stays configurable; rebuilds do not force it on globally.

## Runtime behavior

### Incremental extraction

When `enableAutoExtraction` is enabled, the plugin waits until initial sync finishes, then subscribes to entity create/update events for configured source types.

Each qualifying entity queues a topic extraction job with the configured relevance threshold and merge settings.

### Batch projection

The `topic:project` job re-extracts topics from all configured published source entities using batched prompts.

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
2. a merge synthesis step produces the merged title/content/keywords
3. alias candidates are merged into metadata-only `aliases`
4. aliases are deduped, canonical title is excluded, and the list is capped at 5

If no candidate clears the threshold, a new topic entity is created.

## Topic entity shape

### Frontmatter / authored fields

```yaml
---
title: Human-AI Collaboration
keywords:
  - human-ai
  - collaboration
---
```

The markdown body contains the topic summary/content.

### Metadata

```ts
{
  aliases?: string[];
}
```

Aliases are:

- system-maintained
- metadata-only
- not part of authored frontmatter/content
- used for canonicalization and merge reuse

## Implementation notes

- Existing topic titles are fed back into extraction prompts to reduce noisy near-duplicates.
- Merge detection uses title/keyword similarity heuristics before synthesis.
- Metadata roundtripping preserves aliases; markdown reconstruction does not overwrite persisted metadata.

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
- `src/lib/topic-merge.ts` — similarity and normalization heuristics
- `src/lib/topic-merge-synthesizer.ts` — AI synthesis for merges
- `src/lib/topic-service.ts` — topic CRUD + merge helpers
- `src/handlers/topic-extraction-handler.ts` — extraction job handler
- `src/handlers/topic-processing-handler.ts` — per-topic create/merge handler

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
