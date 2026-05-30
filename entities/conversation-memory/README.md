# Conversation Memory Plugin

`@brains/conversation-memory` derives durable team memory from stored conversation messages.

## Model

The package owns three conversation-derived entity types:

- `summary` — narrative memory, one markdown entity per conversation
- `decision` — first-class decisions with provenance and status
- `action-item` — first-class follow-up work with provenance and lifecycle status

Digest events are not the source of truth. Conversation message events trigger `DerivedEntityProjection` jobs; the projector rereads stored messages before writing memory entities. Initial sync can rebuild memory for existing conversations via `context.conversations.list()`.

## Summary schema

Each summary entry contains:

- `title`
- `summary`
- `timeRange.start` / `timeRange.end`
- `sourceMessageCount`
- `keyPoints`

Decisions and action items are extracted from the same conversation pass but stored as separate entities, not embedded in summary entries.

## Memory retrieval

`ConversationMemoryRetriever` is the explicit retrieval contract for using conversation memory as context. It accepts a query plus either a conversation id or an interface/channel pair, scopes results to that same conversation space by default, and returns ranked memory with conversation, space, timestamp, and score provenance. Cross-space retrieval is opt-in with `includeOtherSpaces`.

The plugin registers an agent-context provider so relevant same-space summaries, decisions, and action items can be injected into the agent turn with provenance. Eval handlers expose both layers:

- `retrieveMemory` tests the retrieval contract directly.
- `buildAgentContext` tests the injected agent-context payload.

## Validation

```bash
bun run typecheck
bun test
bun run lint
```
