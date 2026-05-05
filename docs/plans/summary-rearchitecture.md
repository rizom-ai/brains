# Summary Rearchitecture Plan

## Goal

Rebuild `@brains/summary` as a healthy, eval-first entity plugin that derives durable conversation summaries from conversation/message storage. Digest events should not be the source of truth.

## Core model

A `summary` is one deterministic projection per conversation.

- Source of truth: conversation metadata + stored messages
- Entity type: `summary`
- Entity ID: conversation ID
- Provenance: time spans, message counts, source hash, projection version
- Backward compatibility: not required

## Proposed schema

```ts
type SummaryEntry = {
  title: string;
  summary: string;
  timeRange: {
    start: string;
    end: string;
  };
  sourceMessageCount: number;
  keyPoints: string[];
  decisions: string[];
  actionItems: string[];
};

type SummaryMetadata = {
  conversationId: string;
  channelId: string;
  channelName?: string;
  interfaceType: string;
  timeRange?: {
    start: string;
    end: string;
  };
  messageCount: number;
  entryCount: number;
  sourceHash: string;
  projectionVersion: number;
};
```

AI should generate prose and structured facts only. Code assigns time ranges and counts from source messages.

## Markdown shape

```md
---
conversationId: conv-123
channelId: cli-terminal
channelName: CLI Terminal
interfaceType: cli
messageCount: 42
entryCount: 2
sourceHash: abc123
projectionVersion: 1
---

# Conversation Summary

## Architecture Direction

Time: 2026-05-04T10:00:00Z → 2026-05-04T10:18:00Z  
Messages summarized: 17

Summary text.

### Key Points

- ...

### Decisions

- ...

### Action Items

- ...
```

## Architecture

Suggested modules:

- `summary-adapter` — markdown serialization/parsing for the new schema
- `summary-source-reader` — loads conversation + messages
- `summary-projector` — builds/upserts summary entities
- `summary-extractor` — AI boundary for summarizing a source span
- `summary-prompt` — prompt construction
- `eval-handlers` — plugin eval hooks

Avoid singleton handlers. Prefer explicit constructors and injected context/logger/config.

## Projection approach

Use `DerivedEntityProjection` with conversation source events:

- `initialSync` enqueues a `rebuild-all` projection when no summaries exist
- `sourceChange` listens to `conversation:messageAdded`
- projection jobs reread stored conversation messages before writing summaries
- the conversation namespace exposes `list()` for backfill/rebuild flows

Digest events are not used as source data.

## Config

```ts
{
  enableProjection: true,
  maxSourceMessages: 1000,
  maxMessagesPerChunk: 40,
  minMessagesBetweenProjections: 5,
  minMinutesBetweenProjections: 5,
  maxEntries: 50,
  maxEntryLength: 800,
  includeKeyPoints: true,
  includeDecisions: true,
  includeActionItems: true,
  projectionVersion: 1,
}
```

## Evals

Add `evals/` like `topics` and `blog`.

Initial cases:

1. basic conversation summary
2. preserves explicit decisions
3. preserves action items without inventing owners/tasks
4. separates topic shifts into separate entries
5. handles long multi-phase conversation
6. rebuild determinism via source hash/projection version
7. empty or low-signal conversation produces minimal safe summary

## Migration stance

No legacy markdown compatibility. Existing tests should be rewritten around the new schema and abstractions.
