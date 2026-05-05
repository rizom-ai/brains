# Summary Plugin

`@brains/summary` derives durable conversation summaries from stored conversation messages.

## Model

A summary is one markdown entity per conversation:

- entity type: `summary`
- entity id: conversation id
- source of truth: conversation metadata + stored messages
- provenance: time ranges, source message counts, source hash, projection version

Digest events are not the source of truth. Conversation message events trigger `DerivedEntityProjection` jobs; the projector rereads stored messages before writing the entity. Initial sync can rebuild summaries for existing conversations via `context.conversations.list()`.

## Schema

Each entry contains:

- `title`
- `summary`
- `timeRange.start` / `timeRange.end`
- `sourceMessageCount`
- `keyPoints`
- `decisions`
- `actionItems`

Metadata contains conversation identifiers, message/entry counts, source hash, and projection version.

## Evals

Run plugin evals with:

```bash
bun run eval
```

Eval cases live in `evals/test-cases/` and cover basic summarization, decisions, action items, topic shifts, hallucination resistance, low-signal conversations, and long multiphase conversations.

## Validation

```bash
bun run typecheck
bun test
bun run lint
```
