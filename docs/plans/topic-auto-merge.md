# Plan: Topic Auto-Merge

## Context

This is no longer a greenfield plan. Topic auto-merge already shipped in the topics plugin and is part of the current runtime behavior.

The original problem was near-duplicate topics such as:

- `Human-AI Collaboration`
- `AI Collaboration`
- `Human-Agent Collaboration`
- `Human-Bot Collaboration`

and:

- `Fragmentation and Digital Pluralism`
- `Fragmentation and Multiplicity`
- `Fragmentation as Opportunity`

## What is already true

The topics plugin now supports:

- configurable `autoMerge`
- merge-candidate detection
- merge synthesis
- metadata-only bounded `aliases`
- end-to-end topic processing that merges into an existing canonical topic when appropriate

Current code path:

- extraction produces candidate topics
- `topic-processing-handler.ts` checks `autoMerge`
- `TopicService.findMergeCandidate(...)` looks for an existing canonical topic
- `TopicMergeSynthesizer` produces merged title/content/keywords
- `applySynthesizedMerge(...)` updates canonical topic and stores aliases in metadata

Current durable state:

```ts
metadata: {
  aliases?: string[];
}
```

## Current behavior

When `autoMerge` is enabled:

1. extracted topic is compared against existing topics
2. if a strong candidate exists, merge synthesis runs
3. canonical topic is updated
4. old titles are preserved as metadata aliases
5. alias list stays bounded

If no candidate clears threshold, a new topic is created.

## Proof in repo

Implementation exists in:

- `entities/topics/src/handlers/topic-processing-handler.ts`
- `entities/topics/src/lib/topic-service.ts`
- `entities/topics/src/lib/topic-merge-synthesizer.ts`
- `entities/topics/src/schemas/topic.ts`

Tests exist in:

- `entities/topics/test/handlers/topic-processing-handler.test.ts`
- `entities/topics/test/handlers/topic-extraction-handler.test.ts`

User-facing description already exists in:

- `entities/topics/README.md`

## What is still incomplete

Two leftovers remain and should be treated as cleanup, not as a large future project:

### 1. Eval parity

`checkMergeSimilarity` in `entities/topics/src/index.ts` still uses a simplified title-match eval path.

That means the runtime merge pipeline is more capable than this particular eval handler.

Desired cleanup:

- make eval coverage exercise the real merge-candidate detection path
- keep gray-zone and no-merge cases explicit

### 2. Dead or underused schema surface

`topicMergeJobDataSchema` still exists in `entities/topics/src/schemas/topic.ts`.

If no real job handler uses it, remove it. If a maintenance merge job is still desired, wire it for real.

## Non-goals

- no new major redesign of topic ontology
- no broad backfill project unless operators explicitly want one
- no expansion of metadata beyond what search/canonicalization needs

## Verification

This doc is accurate when all of these remain true:

1. `autoMerge` is a live runtime behavior, not dead config.
2. similar topics merge into existing canonical topics.
3. aliases are stored in metadata only.
4. aliases remain bounded.
5. evals eventually cover the real detection path instead of a title-only stub.

## Remaining work

Small cleanup only:

1. replace title-only eval path with real detection-path eval coverage
2. remove or wire `topicMergeJobDataSchema`
3. keep docs/examples aligned with shipped behavior
